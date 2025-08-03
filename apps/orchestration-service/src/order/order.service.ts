import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { randomUUID } from 'crypto';

import { Order } from '../entities/order.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrderStatusDto } from './dto/order-status.dto';
import { RoutingService } from '../routing/routing.service';
import { OutboxService } from '../outbox/outbox.service';
import { OptimizationService } from './optimization.service';
import { CircuitBreakerService } from '../common/services/circuit-breaker.service';

import { OrderStatus, OrderPriority } from '@calo/shared';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(OutboxEvent) private outboxRepo: Repository<OutboxEvent>,
    private routingService: RoutingService,
    private optimizationService: OptimizationService,
    private outboxService: OutboxService,
    private circuitBreaker: CircuitBreakerService,
    private dataSource: DataSource,
  ) {}

  async processOrder(createOrderDto: CreateOrderDto, correlationId?: string): Promise<OrderResponseDto> {
    const orderId = randomUUID();
    const startTime = Date.now();
    const requestCorrelationId = correlationId || randomUUID();

    this.logger.log(`Processing order ${orderId}`, { correlationId: requestCorrelationId });

    try {
      // 1. Get top channels from Redis (target: <5ms)
      const topChannels = await this.routingService.getTopChannels(createOrderDto);
      this.logger.debug(`Retrieved ${topChannels.length} top channels`, { correlationId: requestCorrelationId });

      // 2. Call Python OR-Tools service (target: <100ms)
      const optimalChannel = await this.circuitBreaker.execute(() =>
        this.optimizationService.optimize(createOrderDto, topChannels)
      );
      this.logger.debug(`Optimization completed, selected channel: ${optimalChannel}`, { correlationId: requestCorrelationId });

      // 3. Atomic transaction with outbox pattern
      const order = await this.createOrderWithEvents(createOrderDto, optimalChannel, requestCorrelationId);

      const processingTime = Date.now() - startTime;
      this.logger.log(`Order processed in ${processingTime}ms`, { 
        correlationId: requestCorrelationId, 
        orderId: order.id,
        channelId: optimalChannel,
        processingTime 
      });

      return this.mapToResponseDto(order);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Order processing failed: ${error.message}`, { 
        correlationId: requestCorrelationId, 
        orderId,
        processingTime,
        error 
      });
      throw error;
    }
  }

  private async createOrderWithEvents(
    orderDto: CreateOrderDto, 
    channelId: string, 
    correlationId: string
  ): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      // Insert order
      const order = manager.create(Order, {
        ...orderDto,
        channelId,
        status: OrderStatus.PENDING,
        correlationId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await manager.save(order);

      // Insert outbox events atomically
      const events = [
        {
          id: randomUUID(),
          type: 'OrderCreated',
          aggregateId: order.id,
          aggregateType: 'Order',
          data: { 
            orderId: order.id,
            customerId: order.customerId,
            restaurantId: order.restaurantId,
            channelId,
            status: order.status,
            total: order.total,
            correlationId 
          },
          createdAt: new Date(),
          processed: false,
        },
        {
          id: randomUUID(),
          type: 'OrderRouted',
          aggregateId: order.id,
          aggregateType: 'Order',
          data: { 
            orderId: order.id, 
            channelId,
            correlationId 
          },
          createdAt: new Date(),
          processed: false,
        },
      ];

      for (const eventData of events) {
        const outboxEvent = manager.create(OutboxEvent, eventData);
        await manager.save(outboxEvent);
      }

      return order;
    });
  }

  async getOrderById(orderId: string): Promise<OrderResponseDto> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }
    return this.mapToResponseDto(order);
  }

  async getOrderStatus(orderId: string): Promise<OrderStatusDto> {
    // Try to get from cache first (DynamoDB simulation)
    const cachedStatus = await this.getCachedOrderStatus(orderId);
    if (cachedStatus) {
      return cachedStatus;
    }

    // Fallback to database
    const order = await this.orderRepo.findOne({ 
      where: { id: orderId },
      select: ['id', 'status', 'estimatedDeliveryTime', 'trackingCode', 'updatedAt']
    });
    
    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    const statusDto = this.mapToStatusDto(order);
    
    // Cache the status
    await this.cacheOrderStatus(orderId, statusDto);
    
    return statusDto;
  }

  async updateOrder(orderId: string, updateOrderDto: UpdateOrderDto): Promise<OrderResponseDto> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    return this.dataSource.transaction(async (manager) => {
      // Update order
      const updatedOrder = manager.merge(Order, order, {
        ...updateOrderDto,
        updatedAt: new Date(),
      });
      await manager.save(updatedOrder);

      // Create outbox event for update
      const outboxEvent = manager.create(OutboxEvent, {
        id: randomUUID(),
        type: 'OrderUpdated',
        aggregateId: orderId,
        aggregateType: 'Order',
        data: { 
          orderId,
          updates: updateOrderDto,
          updatedAt: new Date()
        },
        createdAt: new Date(),
        processed: false,
      });
      await manager.save(outboxEvent);

      return this.mapToResponseDto(updatedOrder);
    });
  }

  async cancelOrder(orderId: string): Promise<OrderResponseDto> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new Error('Order is already cancelled');
    }

    return this.dataSource.transaction(async (manager) => {
      // Update order status
      const updatedOrder = manager.merge(Order, order, {
        status: OrderStatus.CANCELLED,
        updatedAt: new Date(),
      });
      await manager.save(updatedOrder);

      // Create outbox event for cancellation
      const outboxEvent = manager.create(OutboxEvent, {
        id: randomUUID(),
        type: 'OrderCancelled',
        aggregateId: orderId,
        aggregateType: 'Order',
        data: { 
          orderId,
          cancelledAt: new Date(),
          reason: 'User requested cancellation'
        },
        createdAt: new Date(),
        processed: false,
      });
      await manager.save(outboxEvent);

      return this.mapToResponseDto(updatedOrder);
    });
  }

  async getOrderEvents(orderId: string) {
    const events = await this.outboxRepo.find({
      where: { aggregateId: orderId },
      order: { createdAt: 'ASC' }
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
    // Simulate DynamoDB cache lookup
    // In production, this would use AWS SDK
    return null;
  }

  private async cacheOrderStatus(orderId: string, status: OrderStatusDto): Promise<void> {
    // Simulate DynamoDB cache storage
    // In production, this would use AWS SDK
  }

  private mapToResponseDto(order: Order): OrderResponseDto {
    return {
      id: order.id,
      customerId: order.customerId,
      restaurantId: order.restaurantId,
      status: order.status,
      priority: order.priority,
      items: order.items,
      deliveryLocation: order.deliveryLocation,
      subtotal: order.subtotal,
      tax: order.tax,
      deliveryFee: order.deliveryFee,
      total: order.total,
      specialInstructions: order.specialInstructions,
      estimatedDeliveryTime: order.estimatedDeliveryTime,
      trackingCode: order.trackingCode,
      assignedDriverId: order.assignedDriverId,
      failureReason: order.failureReason,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private mapToStatusDto(order: Order): OrderStatusDto {
    return {
      id: order.id,
      status: order.status,
      estimatedDeliveryTime: order.estimatedDeliveryTime,
      trackingCode: order.trackingCode,
      updatedAt: order.updatedAt,
    };
  }
} 