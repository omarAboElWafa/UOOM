import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';

import { Saga } from '../entities/saga.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';

// Core saga services
import { SagaCoordinatorService } from './saga-coordinator.service';
import { OrderSagaService } from './order-saga.service';
import { SagaProcessorService } from './saga-processor.service';

// Step Functions integration
import { StepFunctionsService } from './step-functions/step-functions.service';
import { StepFunctionsSagaCoordinatorService } from './step-functions/step-functions-saga-coordinator.service';
import { EnhancedOrderSagaService } from './enhanced-order-saga.service';

// Saga steps
import { ReserveInventoryStep } from './steps/reserve-inventory.step';
import { BookPartnerStep } from './steps/book-partner.step';
import { ConfirmOrderStep } from './steps/confirm-order.step';

// Controllers
import { SagaMonitoringController } from './controllers/saga-monitoring.controller';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Saga, OutboxEvent]),
    BullModule.registerQueue({
      name: 'saga-execution',
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),
  ],
  controllers: [
    SagaMonitoringController,
  ],
  providers: [
    // Core saga coordination
    SagaCoordinatorService,
    OrderSagaService,
    SagaProcessorService,

    // Step Functions integration
    StepFunctionsService,
    StepFunctionsSagaCoordinatorService,
    
    // Enhanced saga service
    EnhancedOrderSagaService,

    // Saga steps
    ReserveInventoryStep,
    BookPartnerStep,
    ConfirmOrderStep,
  ],
  exports: [
    SagaCoordinatorService,
    OrderSagaService,
    StepFunctionsService,
    StepFunctionsSagaCoordinatorService,
    EnhancedOrderSagaService,
  ],
})
export class SagaModule {} 