import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

import { Order } from '../entities/order.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { OrderCacheService } from '@calo/database';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrderStatusDto } from './dto/order-status.dto';
import { OrderStatus, OrderPriority } from '@calo/shared';

import { CircuitBreakerService } from '../common/services/circuit-breaker.service';
import { OrderSagaService, OrderSagaData } from '../saga/order-saga.service';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
    @InjectQueue('optimization')
    private optimizationQueue: Queue,
    private dataSource: DataSource,
    private circuitBreaker: CircuitBreakerService,
    private orderCacheService: OrderCacheService,
    private orderSagaService: OrderSagaService,
  ) {}

  async processOrder(createOrderDto: CreateOrderDto, correlationId?: string): Promise<OrderResponseDto> {
    const startTime = Date.now();
    
    // Use database transaction with outbox pattern
    return this.dataSource.transaction(async manager => {
      try {
        // 1. Calculate order totals
        const subtotal = createOrderDto.items.reduce((sum, item) => 
          sum + (item.unitPrice * item.quantity), 0);
        const tax = subtotal * 0.1; // 10% tax
        const deliveryFee = 5.99; // Fixed delivery fee
        const total = subtotal + tax + deliveryFee;

        // 2. Create order record with PENDING status
        const order = manager.create(Order, {
          customerId: createOrderDto.customerId,
          restaurantId: '550e8400-e29b-41d4-a716-446655440000', // Would come from restaurant selection
          items: createOrderDto.items.map(item => ({
            ...item,
            totalPrice: item.unitPrice * item.quantity,
          })),
          deliveryLocation: {
            latitude: createOrderDto.deliveryAddress.latitude,
            longitude: createOrderDto.deliveryAddress.longitude,
            address: `${createOrderDto.deliveryAddress.street}, ${createOrderDto.deliveryAddress.city}`,
            city: createOrderDto.deliveryAddress.city,
            postalCode: createOrderDto.deliveryAddress.postalCode,
          },
          subtotal,
          tax,
          deliveryFee,
          total,
          priority: OrderPriority.NORMAL,
          status: OrderStatus.PENDING, // Keep as PENDING until saga completes
        });

        const savedOrder = await manager.save(order);

        // 3. Create initial outbox event for order creation
        const outboxEvent = manager.create(OutboxEvent, {
          type: 'ORDER_CREATED',
          aggregateId: savedOrder.id,
          aggregateType: 'Order',
          data: {
            orderId: savedOrder.id,
            customerId: savedOrder.customerId,
            restaurantId: savedOrder.restaurantId,
            status: savedOrder.status,
            total: savedOrder.total,
            items: savedOrder.items,
            deliveryLocation: savedOrder.deliveryLocation,
            correlationId,
          },
        });

        await manager.save(outboxEvent);

                 // 4. Start saga orchestration for order processing
         const sagaData: OrderSagaData = {
           orderId: savedOrder.id,
           customerId: savedOrder.customerId,
           restaurantId: savedOrder.restaurantId,
           items: savedOrder.items,
           deliveryLocation: savedOrder.deliveryLocation,
           totalAmount: savedOrder.total,
           maxDeliveryTimeMinutes: createOrderDto.maxDeliveryTimeMinutes,
           priority: savedOrder.priority.toString(),
           specialInstructions: savedOrder.specialInstructions,
         };

        const sagaId = await this.orderSagaService.startOrderProcessingSaga(
          savedOrder.id,
          sagaData,
          correlationId
        );

        this.logger.log(`Order saga started`, {
          orderId: savedOrder.id,
          sagaId,
          correlationId,
        });

        const processingTime = Date.now() - startTime;
        this.logger.log(`Order created and saga initiated in ${processingTime}ms`, {
          orderId: savedOrder.id,
          sagaId,
          processingTime,
        });

        // Return order in PENDING status - saga will handle confirmation
        return this.mapToResponseDto(savedOrder);
      } catch (error) {
        const processingTime = Date.now() - startTime;
        this.logger.error(`Order processing failed in ${processingTime}ms`, {
          correlationId,
          error: error.message,
          processingTime,
        });
        throw error;
      }
    });
  }

  async getOrderById(orderId: string): Promise<OrderResponseDto> {
    // Try cache first for faster response
    const cachedOrder = await this.orderCacheService.getOrderDetails(orderId);
    if (cachedOrder) {
      this.logger.debug('Order retrieved from cache', { orderId });
             return {
         id: cachedOrder.orderId,
         customerId: cachedOrder.customerId,
         channelId: cachedOrder.channelId,
         status: cachedOrder.status,
         totalAmount: cachedOrder.totalAmount,
         estimatedDeliveryTime: cachedOrder.estimatedDeliveryTime 
           ? new Date(cachedOrder.estimatedDeliveryTime) 
           : new Date(),
         createdAt: new Date(cachedOrder.createdAt),
         correlationId: '', // Would need to add to cache schema
       };
    }

    // Fallback to database
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    return this.mapToResponseDto(order);
  }

  async getOrderStatus(orderId: string): Promise<OrderStatusDto> {
    const startTime = Date.now();
    
    try {
      // First, try to get from DynamoDB cache (should be <5ms)
      const cachedStatus = await this.getCachedOrderStatus(orderId);
      
      if (cachedStatus) {
        const duration = Date.now() - startTime;
        this.logger.debug(`Order status retrieved from cache in ${duration}ms`, { orderId });
        return cachedStatus;
      }

      // Fallback to database if not in cache
      this.logger.debug('Cache miss, falling back to database', { orderId });
      
      const order = await this.orderRepository.findOne({
        where: { id: orderId },
        select: ['id', 'status', 'estimatedDeliveryTime', 'updatedAt'],
      });

      if (!order) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }

      const statusDto: OrderStatusDto = {
        id: order.id,
        status: order.status,
        estimatedDeliveryTime: order.estimatedDeliveryTime,
        updatedAt: order.updatedAt,
      };

      // Cache for future requests
      await this.cacheOrderStatus(
        order.id,
        order.status,
        '', // Would need customerId from full query
        '', // Would need restaurantId from full query  
        '', // Would need channelId from full query
        0,  // Would need totalAmount from full query
        order.estimatedDeliveryTime,
      );

      const duration = Date.now() - startTime;
      this.logger.debug(`Order status retrieved from database in ${duration}ms`, { orderId });
      
      return statusDto;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to get order status in ${duration}ms`, {
        orderId,
        error: error.message,
      });
      throw error;
    }
  }

  async updateOrder(orderId: string, updateOrderDto: UpdateOrderDto): Promise<OrderResponseDto> {
    return this.dataSource.transaction(async manager => {
      const order = await manager.findOne(Order, { where: { id: orderId } });
      if (!order) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }

      const previousStatus = order.status;
      
      // Update order fields
      if (updateOrderDto.status) {
        order.status = updateOrderDto.status;
      }
      if (updateOrderDto.estimatedDeliveryTime) {
        order.estimatedDeliveryTime = updateOrderDto.estimatedDeliveryTime;
      }

      const updatedOrder = await manager.save(order);

      // Create outbox event for status change
      if (updateOrderDto.status && updateOrderDto.status !== previousStatus) {
        const outboxEvent = manager.create(OutboxEvent, {
          type: 'ORDER_STATUS_CHANGED',
          aggregateId: orderId,
          aggregateType: 'Order',
          data: {
            orderId,
            previousStatus,
            newStatus: updateOrderDto.status,
            estimatedDeliveryTime: updatedOrder.estimatedDeliveryTime,
            updatedBy: 'system', // Could be passed in DTO
          },
        });

        await manager.save(outboxEvent);

        // Update cache with new status
        await this.orderCacheService.updateOrderStatus(orderId, {
          status: updateOrderDto.status,
          estimatedDeliveryTime: updateOrderDto.estimatedDeliveryTime,
        });
      }

      this.logger.log('Order updated successfully', {
        orderId,
        previousStatus,
        newStatus: updateOrderDto.status,
      });

      return this.mapToResponseDto(updatedOrder);
    });
  }

  async cancelOrder(orderId: string): Promise<OrderResponseDto> {
    return this.dataSource.transaction(async manager => {
      const order = await manager.findOne(Order, { where: { id: orderId } });
      if (!order) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }

      if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
        throw new Error(`Cannot cancel order in ${order.status} status`);
      }

      const previousStatus = order.status;
      order.status = OrderStatus.CANCELLED;

      const cancelledOrder = await manager.save(order);

      // Create outbox event
      const outboxEvent = manager.create(OutboxEvent, {
        type: 'ORDER_CANCELLED',
        aggregateId: orderId,
        aggregateType: 'Order',
        data: {
          orderId,
          previousStatus,
          cancelledAt: new Date(),
          reason: 'User requested cancellation',
        },
      });

      await manager.save(outboxEvent);

      // Update cache
      await this.orderCacheService.updateOrderStatus(orderId, {
        status: OrderStatus.CANCELLED,
      });

      this.logger.log('Order cancelled successfully', { orderId });

      return this.mapToResponseDto(cancelledOrder);
    });
  }

  async getOrderEvents(orderId: string) {
    const events = await this.outboxRepository.find({
      where: { aggregateId: orderId },
      order: { createdAt: 'ASC' },
    });

    return events.map(event => ({
      id: event.id,
      type: event.type,
      data: event.data,
      createdAt: event.createdAt,
      processed: event.processed,
    }));
  }

  private async getCachedOrderStatus(orderId: string): Promise<OrderStatusDto | null> {
    try {
      return await this.orderCacheService.getOrderStatus(orderId);
    } catch (error) {
      this.logger.error('Failed to retrieve order status from cache', {
        orderId,
        error: error.message,
      });
      return null; // Graceful degradation
    }
  }

  private async cacheOrderStatus(
    orderId: string,
    status: OrderStatus,
    customerId: string,
    restaurantId: string,
    channelId: string,
    totalAmount: number,
    estimatedDeliveryTime?: Date,
    trackingCode?: string,
  ): Promise<void> {
    try {
      await this.orderCacheService.cacheOrderStatus(
        orderId,
        status,
        customerId,
        restaurantId,
        channelId,
        totalAmount,
        estimatedDeliveryTime,
        trackingCode,
      );
    } catch (error) {
      this.logger.error('Failed to cache order status', {
        orderId,
        status,
        error: error.message,
      });
      // Don't throw - caching failures shouldn't affect order processing
    }
  }

     private mapToResponseDto(order: Order): OrderResponseDto {
     return {
       id: order.id,
       customerId: order.customerId,
       channelId: 'default-channel', // Would be stored in Order entity
       status: order.status,
       totalAmount: order.total,
       estimatedDeliveryTime: order.estimatedDeliveryTime || new Date(),
       createdAt: order.createdAt,
       correlationId: `order-${order.id}`, // Generate from order ID
     };
   }
} 