import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { Order } from '../entities/order.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { CircuitBreakerService } from '../common/services/circuit-breaker.service';
import { SagaModule } from '../saga/saga.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OutboxEvent]),
    BullModule.registerQueue({
      name: 'optimization',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    }),
    SagaModule, // Import saga module
  ],
  controllers: [OrderController],
  providers: [
    OrderService,
    CircuitBreakerService,
  ],
  exports: [OrderService],
})
export class OrderModule {} 