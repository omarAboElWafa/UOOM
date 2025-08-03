import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Headers,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiParam } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheInterceptor } from '@nestjs/cache-manager';

import { Order } from '../entities/order.entity';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrderStatusDto } from './dto/order-status.dto';

import { AuthGuard } from '../common/guards/auth.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { LoggingInterceptor } from '../interceptors/logging.interceptor';
import { MetricsInterceptor } from '../interceptors/metrics.interceptor';

@Controller('orders')
@ApiTags('orders')
@UseGuards(AuthGuard, RateLimitGuard)
@UseInterceptors(LoggingInterceptor, MetricsInterceptor)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Submit new order',
    description: 'Creates a new order with intelligent routing and optimization'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Order created successfully',
    type: OrderResponseDto 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid input data' 
  })
  @ApiResponse({ 
    status: 429, 
    description: 'Rate limit exceeded' 
  })
  @ApiHeader({
    name: 'correlation-id',
    description: 'Correlation ID for request tracking',
    required: false,
  })
  async createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @Headers('correlation-id') correlationId?: string,
  ): Promise<OrderResponseDto> {
    const startTime = Date.now();
    
    try {
      const order = await this.orderService.processOrder(createOrderDto, correlationId);
      
      const processingTime = Date.now() - startTime;
      console.log(`Order created in ${processingTime}ms`, { 
        orderId: order.id, 
        correlationId 
      });

      return order;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`Order creation failed in ${processingTime}ms`, { 
        error: error.message, 
        correlationId 
      });
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get order details',
    description: 'Retrieves complete order information'
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Order details retrieved',
    type: OrderResponseDto 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Order not found' 
  })
  async getOrder(@Param('id') orderId: string): Promise<OrderResponseDto> {
    return this.orderService.getOrderById(orderId);
  }

  @Get(':id/status')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ 
    summary: 'Get order status',
    description: 'Retrieves order status from DynamoDB cache (<5ms)'
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Order status retrieved',
    type: OrderStatusDto 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Order not found' 
  })
  async getOrderStatus(@Param('id') orderId: string): Promise<OrderStatusDto> {
    const startTime = Date.now();
    
    try {
      const status = await this.orderService.getOrderStatus(orderId);
      
      const processingTime = Date.now() - startTime;
      console.log(`Order status retrieved in ${processingTime}ms`, { orderId });

      return status;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`Order status retrieval failed in ${processingTime}ms`, { 
        orderId, 
        error: error.message 
      });
      throw error;
    }
  }

  @Put(':id')
  @ApiOperation({ 
    summary: 'Update order',
    description: 'Updates order with event-driven outbox pattern'
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Order updated successfully',
    type: OrderResponseDto 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Order not found' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid update data' 
  })
  async updateOrder(
    @Param('id') orderId: string,
    @Body() updateOrderDto: UpdateOrderDto,
  ): Promise<OrderResponseDto> {
    const startTime = Date.now();
    
    try {
      const order = await this.orderService.updateOrder(orderId, updateOrderDto);
      
      const processingTime = Date.now() - startTime;
      console.log(`Order updated in ${processingTime}ms`, { orderId });

      return order;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`Order update failed in ${processingTime}ms`, { 
        orderId, 
        error: error.message 
      });
      throw error;
    }
  }

  @Get(':id/events')
  @ApiOperation({ 
    summary: 'Get order events',
    description: 'Retrieves order event history for audit trail'
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Order events retrieved' 
  })
  async getOrderEvents(@Param('id') orderId: string) {
    return this.orderService.getOrderEvents(orderId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Cancel order',
    description: 'Cancels an order with proper event emission'
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Order cancelled successfully',
    type: OrderResponseDto 
  })
  async cancelOrder(@Param('id') orderId: string): Promise<OrderResponseDto> {
    return this.orderService.cancelOrder(orderId);
  }
} 