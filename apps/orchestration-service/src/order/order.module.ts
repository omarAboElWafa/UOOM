import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bull';

// Entities
import { Order } from '../entities/order.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';

// Controllers
import { OrderController } from './order.controller';

// Services
import { OrderService } from './order.service';
import { RoutingService } from '../routing/routing.service';
import { OutboxService } from '../outbox/outbox.service';
import { OptimizationService } from './optimization.service';
import { CircuitBreakerService } from '../common/services/circuit-breaker.service';
import { OptimizationModule } from '../optimization/optimization.module';

// DTOs
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrderStatusDto } from './dto/order-status.dto';

// Guards
import { AuthGuard } from '../common/guards/auth.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

// Interceptors
import { LoggingInterceptor } from '../interceptors/logging.interceptor';
import { MetricsInterceptor } from '../interceptors/metrics.interceptor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OutboxEvent]),
    HttpModule,
    CacheModule.register({
      ttl: 300, // 5 minutes
      max: 1000,
    }),
    BullModule.registerQueue({ name: 'orders' }),
    OptimizationModule,
  ],
  controllers: [OrderController],
  providers: [
    OrderService,
    RoutingService,
    OutboxService,
    OptimizationService,
    CircuitBreakerService,
    AuthGuard,
    RateLimitGuard,
    LoggingInterceptor,
    MetricsInterceptor,
  ],
  exports: [OrderService],
})
export class OrderModule {} 