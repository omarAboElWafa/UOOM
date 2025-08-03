import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

import { Saga, SagaStatus, SagaStepStatus, SagaStepData } from '../entities/saga.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { SagaStep, SagaContext, SagaStepResult } from './interfaces/saga-step.interface';

export interface SagaDefinition {
  sagaType: string;
  steps: SagaStep[];
  timeoutMs?: number;
  maxRetries?: number;
}

export interface StartSagaOptions {
  sagaType: string;
  aggregateId: string;
  aggregateType: string;
  sagaData: any;
  correlationId?: string;
}

@Injectable()
export class SagaCoordinatorService {
  private readonly logger = new Logger(SagaCoordinatorService.name);
  private readonly sagaDefinitions = new Map<string, SagaDefinition>();

  constructor(
    @InjectRepository(Saga)
    private sagaRepository: Repository<Saga>,
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
    @InjectQueue('saga-execution')
    private sagaQueue: Queue,
    private dataSource: DataSource,
  ) {}

  /**
   * Register a saga definition
   */
  registerSaga(definition: SagaDefinition): void {
    this.sagaDefinitions.set(definition.sagaType, definition);
    this.logger.log(`Registered saga: ${definition.sagaType} with ${definition.steps.length} steps`);
  }

  /**
   * Start a new saga
   */
  async startSaga(options: StartSagaOptions): Promise<string> {
    const definition = this.sagaDefinitions.get(options.sagaType);
    if (!definition) {
      throw new Error(`Saga definition not found: ${options.sagaType}`);
    }

    return this.dataSource.transaction(async manager => {
      // Create saga entity
      const saga = manager.create(Saga, {
        sagaType: options.sagaType,
        aggregateId: options.aggregateId,
        aggregateType: options.aggregateType,
        sagaData: options.sagaData,
        status: SagaStatus.STARTED,
        currentStep: 0,
        totalSteps: definition.steps.length,
        stepData: definition.steps.map((step, index) => ({
          stepName: step.stepName,
          status: SagaStepStatus.PENDING,
          retryCount: 0,
        })),
        startedAt: new Date(),
        maxRetries: definition.maxRetries || 3,
      });

      const savedSaga = await manager.save(saga);

      // Create outbox event for saga started
      const outboxEvent = manager.create(OutboxEvent, {
        type: 'SAGA_STARTED',
        aggregateId: savedSaga.id,
        aggregateType: 'Saga',
        data: {
          sagaId: savedSaga.id,
          sagaType: options.sagaType,
          aggregateId: options.aggregateId,
          correlationId: options.correlationId,
        },
      });

      await manager.save(outboxEvent);

      // Queue saga execution
      await this.sagaQueue.add('execute-saga', {
        sagaId: savedSaga.id,
        correlationId: options.correlationId,
      }, {
        delay: 100, // Small delay to ensure transaction commits
      });

      this.logger.log(`Started saga: ${savedSaga.id} of type: ${options.sagaType}`, {
        sagaId: savedSaga.id,
        aggregateId: options.aggregateId,
        correlationId: options.correlationId,
      });

      return savedSaga.id;
    });
  }

  /**
   * Execute saga steps
   */
  async executeSaga(sagaId: string, correlationId?: string): Promise<void> {
    const saga = await this.sagaRepository.findOne({ where: { id: sagaId } });
    if (!saga) {
      throw new Error(`Saga not found: ${sagaId}`);
    }

    const definition = this.sagaDefinitions.get(saga.sagaType);
    if (!definition) {
      throw new Error(`Saga definition not found: ${saga.sagaType}`);
    }

    try {
      await this.executeSteps(saga, definition, correlationId);
    } catch (error) {
      this.logger.error(`Saga execution failed: ${sagaId}`, {
        sagaId,
        error: error.message,
        correlationId,
      });
      
      await this.handleSagaFailure(saga, definition, error.message, correlationId);
    }
  }

  /**
   * Execute saga steps sequentially
   */
  private async executeSteps(
    saga: Saga, 
    definition: SagaDefinition, 
    correlationId?: string
  ): Promise<void> {
    const startTime = Date.now();
    
    // Update saga status to in progress
    await this.updateSagaStatus(saga.id, SagaStatus.IN_PROGRESS);

    for (let stepIndex = saga.currentStep; stepIndex < definition.steps.length; stepIndex++) {
      const step = definition.steps[stepIndex];
      const context: SagaContext = {
        sagaId: saga.id,
        aggregateId: saga.aggregateId,
        aggregateType: saga.aggregateType,
        sagaData: saga.sagaData,
        stepIndex,
        totalSteps: definition.steps.length,
        previousStepData: stepIndex > 0 ? saga.stepData[stepIndex - 1]?.data : undefined,
        correlationId,
      };

      const stepStartTime = Date.now();
      
      try {
        this.logger.debug(`Executing step ${stepIndex + 1}/${definition.steps.length}: ${step.stepName}`, {
          sagaId: saga.id,
          stepName: step.stepName,
          correlationId,
        });

        // Execute step with timeout
        const result = await Promise.race([
          step.execute(context),
          this.createTimeoutPromise(step.getTimeout()),
        ]) as SagaStepResult;

        if (!result.success) {
          throw new Error(result.error || `Step ${step.stepName} failed`);
        }

        // Update step as completed
        await this.updateStepStatus(
          saga.id, 
          stepIndex, 
          SagaStepStatus.COMPLETED, 
          result.data
        );

        // Update current step
        await this.updateCurrentStep(saga.id, stepIndex + 1);

        const stepDuration = Date.now() - stepStartTime;
        this.logger.debug(`Step completed: ${step.stepName} in ${stepDuration}ms`, {
          sagaId: saga.id,
          stepName: step.stepName,
          stepDuration,
          correlationId,
        });

      } catch (error) {
        const stepDuration = Date.now() - stepStartTime;
        this.logger.error(`Step failed: ${step.stepName} in ${stepDuration}ms`, {
          sagaId: saga.id,
          stepName: step.stepName,
          error: error.message,
          stepDuration,
          correlationId,
        });

        // Update step as failed
        await this.updateStepStatus(
          saga.id, 
          stepIndex, 
          SagaStepStatus.FAILED, 
          undefined, 
          error.message
        );

        throw error;
      }
    }

    // All steps completed successfully
    const totalDuration = Date.now() - startTime;
    await this.completeSaga(saga.id, totalDuration, correlationId);
  }

  /**
   * Handle saga failure and start compensation
   */
  private async handleSagaFailure(
    saga: Saga, 
    definition: SagaDefinition, 
    error: string,
    correlationId?: string
  ): Promise<void> {
    this.logger.warn(`Starting compensation for saga: ${saga.id}`, {
      sagaId: saga.id,
      error,
      correlationId,
    });

    await this.updateSagaStatus(saga.id, SagaStatus.COMPENSATING, error);

    try {
      await this.compensateSteps(saga, definition, correlationId);
      await this.updateSagaStatus(saga.id, SagaStatus.COMPENSATED);
      
      this.logger.log(`Saga compensated successfully: ${saga.id}`, {
        sagaId: saga.id,
        correlationId,
      });
    } catch (compensationError) {
      await this.updateSagaStatus(saga.id, SagaStatus.FAILED, compensationError.message);
      
      this.logger.error(`Saga compensation failed: ${saga.id}`, {
        sagaId: saga.id,
        error: compensationError.message,
        correlationId,
      });
      
      throw compensationError;
    }
  }

  /**
   * Compensate completed steps in reverse order
   */
  private async compensateSteps(
    saga: Saga, 
    definition: SagaDefinition, 
    correlationId?: string
  ): Promise<void> {
    const completedSteps = saga.stepData
      .map((stepData, index) => ({ ...stepData, index }))
      .filter(step => step.status === SagaStepStatus.COMPLETED)
      .reverse(); // Compensate in reverse order

    for (const stepData of completedSteps) {
      const step = definition.steps[stepData.index];
      if (!step.canCompensate({ 
        sagaId: saga.id, 
        aggregateId: saga.aggregateId,
        aggregateType: saga.aggregateType,
        sagaData: saga.sagaData,
        stepIndex: stepData.index,
        totalSteps: definition.steps.length,
        correlationId,
      })) {
        this.logger.warn(`Step cannot be compensated: ${step.stepName}`, {
          sagaId: saga.id,
          stepName: step.stepName,
          correlationId,
        });
        continue;
      }

      try {
        this.logger.debug(`Compensating step: ${step.stepName}`, {
          sagaId: saga.id,
          stepName: step.stepName,
          correlationId,
        });

        const result = await step.compensate({
          sagaId: saga.id,
          aggregateId: saga.aggregateId,
          aggregateType: saga.aggregateType,
          sagaData: saga.sagaData,
          stepIndex: stepData.index,
          totalSteps: definition.steps.length,
          correlationId,
        });

        if (!result.success) {
          throw new Error(result.error || `Compensation failed for ${step.stepName}`);
        }

        // Mark step as compensated
        await this.updateStepStatus(
          saga.id, 
          stepData.index, 
          SagaStepStatus.COMPENSATED
        );

      } catch (error) {
        this.logger.error(`Compensation failed for step: ${step.stepName}`, {
          sagaId: saga.id,
          stepName: step.stepName,
          error: error.message,
          correlationId,
        });
        
        throw error;
      }
    }
  }

  /**
   * Update saga status
   */
  private async updateSagaStatus(
    sagaId: string, 
    status: SagaStatus, 
    failureReason?: string
  ): Promise<void> {
    const updateData: Partial<Saga> = { status };
    
    if (status === SagaStatus.COMPLETED) {
      updateData.completedAt = new Date();
    } else if (status === SagaStatus.FAILED) {
      updateData.failedAt = new Date();
      updateData.failureReason = failureReason;
    } else if (status === SagaStatus.COMPENSATED) {
      updateData.compensatedAt = new Date();
    }

    await this.sagaRepository.update(sagaId, updateData);
  }

  /**
   * Update step status
   */
  private async updateStepStatus(
    sagaId: string, 
    stepIndex: number, 
    status: SagaStepStatus, 
    data?: any,
    error?: string
  ): Promise<void> {
    const saga = await this.sagaRepository.findOne({ where: { id: sagaId } });
    if (!saga) return;

    saga.stepData[stepIndex].status = status;
    saga.stepData[stepIndex].data = data;
    saga.stepData[stepIndex].error = error;
    
    if (status === SagaStepStatus.COMPLETED) {
      saga.stepData[stepIndex].executedAt = new Date();
    } else if (status === SagaStepStatus.COMPENSATED) {
      saga.stepData[stepIndex].compensatedAt = new Date();
    }

    await this.sagaRepository.save(saga);
  }

  /**
   * Update current step
   */
  private async updateCurrentStep(sagaId: string, currentStep: number): Promise<void> {
    await this.sagaRepository.update(sagaId, { currentStep });
  }

  /**
   * Complete saga
   */
  private async completeSaga(sagaId: string, duration: number, correlationId?: string): Promise<void> {
    await this.updateSagaStatus(sagaId, SagaStatus.COMPLETED);

    // Create completion event
    await this.dataSource.transaction(async manager => {
      const outboxEvent = manager.create(OutboxEvent, {
        type: 'SAGA_COMPLETED',
        aggregateId: sagaId,
        aggregateType: 'Saga',
        data: {
          sagaId,
          duration,
          completedAt: new Date(),
          correlationId,
        },
      });

      await manager.save(outboxEvent);
    });

    this.logger.log(`Saga completed successfully: ${sagaId} in ${duration}ms`, {
      sagaId,
      duration,
      correlationId,
    });
  }

  /**
   * Create timeout promise
   */
  private createTimeoutPromise(timeoutMs: number): Promise<SagaStepResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Step timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Get saga status
   */
  async getSagaStatus(sagaId: string): Promise<Saga | null> {
    return this.sagaRepository.findOne({ where: { id: sagaId } });
  }

  /**
   * Get sagas by aggregate
   */
  async getSagasByAggregate(aggregateId: string, aggregateType: string): Promise<Saga[]> {
    return this.sagaRepository.find({
      where: { aggregateId, aggregateType },
      order: { createdAt: 'DESC' },
    });
  }
} 