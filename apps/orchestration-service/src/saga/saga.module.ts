import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

import { Saga } from '../entities/saga.entity';
import { Order } from '../entities/order.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';

import { SagaCoordinatorService } from './saga-coordinator.service';
import { SagaProcessorService } from './saga-processor.service';
import { OrderSagaService } from './order-saga.service';

// Saga Steps
import { ReserveInventoryStep } from './steps/reserve-inventory.step';
import { BookPartnerStep } from './steps/book-partner.step';
import { ConfirmOrderStep } from './steps/confirm-order.step';

@Module({
  imports: [
    TypeOrmModule.forFeature([Saga, Order, OutboxEvent]),
    BullModule.registerQueue({
      name: 'saga-execution',
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
  ],
  providers: [
    SagaCoordinatorService,
    SagaProcessorService,
    OrderSagaService,
    ReserveInventoryStep,
    BookPartnerStep,
    ConfirmOrderStep,
  ],
  exports: [
    SagaCoordinatorService,
    OrderSagaService,
  ],
})
export class SagaModule {} 