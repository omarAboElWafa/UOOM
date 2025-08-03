import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { SagaCoordinatorService } from '../saga-coordinator.service';
import { StepFunctionsService, StepFunctionExecutionInput } from './step-functions.service';
import { Saga, SagaStatus } from '../../entities/saga.entity';
import { OutboxEvent } from '../../entities/outbox-event.entity';

export interface HybridSagaOptions {
  useStepFunctions?: boolean;
  fallbackToLocal?: boolean;
  asyncExecution?: boolean;
}

@Injectable()
export class StepFunctionsSagaCoordinatorService {
  private readonly logger = new Logger(StepFunctionsSagaCoordinatorService.name);
  private readonly useStepFunctionsByDefault: boolean;

  constructor(
    private readonly localSagaCoordinator: SagaCoordinatorService,
    public readonly stepFunctionsService: StepFunctionsService,
    private readonly configService: ConfigService,
    @InjectRepository(Saga)
    private sagaRepository: Repository<Saga>,
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
    private dataSource: DataSource,
  ) {
    this.useStepFunctionsByDefault = this.configService.get('USE_STEP_FUNCTIONS', 'true') === 'true';
  }

  /**
   * Start saga with hybrid orchestration (Step Functions + local fallback)
   */
  async startHybridSaga(
    options: {
      sagaType: string;
      aggregateId: string;
      aggregateType: string;
      sagaData: any;
      correlationId?: string;
    },
    hybridOptions: HybridSagaOptions = {}
  ): Promise<{ sagaId: string; executionArn?: string; executionMode: 'stepfunctions' | 'local' }> {
    const useStepFunctions = hybridOptions.useStepFunctions ?? this.useStepFunctionsByDefault;
    
    // Always create saga record for tracking
    const sagaId = await this.localSagaCoordinator.startSaga(options);
    
    let executionArn: string | undefined;
    let executionMode: 'stepfunctions' | 'local' = 'local';

    if (useStepFunctions) {
      try {
        // Attempt Step Functions execution
        const stepFunctionInput: StepFunctionExecutionInput = {
          orderId: options.aggregateId,
          sagaId,
          sagaData: options.sagaData,
          correlationId: options.correlationId,
        };

        executionArn = await this.stepFunctionsService.startSagaExecution(stepFunctionInput);
        executionMode = 'stepfunctions';

        // Update saga with Step Functions execution ARN
        await this.updateSagaWithExecutionArn(sagaId, executionArn);

        this.logger.log('Saga started with Step Functions', {
          sagaId,
          executionArn,
          sagaType: options.sagaType,
          correlationId: options.correlationId,
        });

      } catch (error) {
        this.logger.error('Step Functions execution failed, falling back to local execution', {
          sagaId,
          error: error.message,
          correlationId: options.correlationId,
        });

        if (hybridOptions.fallbackToLocal !== false) {
          // Fallback to local execution
          await this.executeLocalSaga(sagaId, options.correlationId);
        } else {
          // Mark saga as failed if no fallback
          await this.markSagaAsFailed(sagaId, `Step Functions execution failed: ${error.message}`);
          throw error;
        }
      }
    } else {
      // Use local execution
      await this.executeLocalSaga(sagaId, options.correlationId);
    }

    return {
      sagaId,
      executionArn,
      executionMode,
    };
  }

  /**
   * Execute saga locally using the existing coordinator
   */
  private async executeLocalSaga(sagaId: string, correlationId?: string): Promise<void> {
    try {
      await this.localSagaCoordinator.executeSaga(sagaId, correlationId);
    } catch (error) {
      this.logger.error('Local saga execution failed', {
        sagaId,
        error: error.message,
        correlationId,
      });
      throw error;
    }
  }

  /**
   * Get comprehensive saga status (local + Step Functions)
   */
  async getHybridSagaStatus(sagaId: string): Promise<{
    localSaga: Saga | null;
    stepFunctionExecution?: any;
    overallStatus: string;
    executionMode: 'stepfunctions' | 'local' | 'unknown';
  }> {
    const localSaga = await this.sagaRepository.findOne({ where: { id: sagaId } });
    
    if (!localSaga) {
      return {
        localSaga: null,
        overallStatus: 'NOT_FOUND',
        executionMode: 'unknown',
      };
    }

    // Check if this saga has Step Functions execution
    const executionArn = localSaga.metadata?.stepFunctionExecutionArn;
    let stepFunctionExecution;
    let executionMode: 'stepfunctions' | 'local' = 'local';

    if (executionArn) {
      try {
        stepFunctionExecution = await this.stepFunctionsService.getExecutionStatus(executionArn);
        executionMode = 'stepfunctions';
      } catch (error) {
        this.logger.warn('Failed to get Step Functions status', {
          sagaId,
          executionArn,
          error: error.message,
        });
      }
    }

    // Determine overall status
    let overallStatus = localSaga.status;
    if (stepFunctionExecution) {
      // Sync Step Functions status with local saga status
      overallStatus = this.mapStepFunctionStatusToSagaStatus(stepFunctionExecution.status);
      
      // Update local saga if status differs
      if (overallStatus !== localSaga.status) {
        await this.syncSagaStatusFromStepFunctions(sagaId, overallStatus, stepFunctionExecution);
      }
    }

    return {
      localSaga,
      stepFunctionExecution,
      overallStatus,
      executionMode,
    };
  }

  /**
   * Cancel/Stop saga execution
   */
  async cancelHybridSaga(sagaId: string, reason: string): Promise<void> {
    const saga = await this.sagaRepository.findOne({ where: { id: sagaId } });
    
    if (!saga) {
      throw new Error(`Saga not found: ${sagaId}`);
    }

    const executionArn = saga.metadata?.stepFunctionExecutionArn;
    
    if (executionArn) {
      // Stop Step Functions execution
      try {
        await this.stepFunctionsService.stopSagaExecution(executionArn, reason);
        this.logger.log('Step Functions execution stopped', {
          sagaId,
          executionArn,
          reason,
        });
      } catch (error) {
        this.logger.error('Failed to stop Step Functions execution', {
          sagaId,
          executionArn,
          error: error.message,
        });
      }
    }

    // Update local saga status
    await this.sagaRepository.update(sagaId, {
      status: SagaStatus.CANCELLED,
      failureReason: reason,
      failedAt: new Date(),
    });

    // Emit cancellation event
    await this.emitSagaEvent(sagaId, 'SAGA_CANCELLED', { reason });
  }

  /**
   * Monitor and sync Step Functions executions
   */
  async monitorStepFunctionExecutions(): Promise<void> {
    try {
      const runningExecutions = await this.stepFunctionsService.listSagaExecutions();
      
      for (const execution of runningExecutions) {
        // Find corresponding local saga
        const inputData = JSON.parse(execution.input);
        const sagaId = inputData.sagaId;
        
        if (sagaId) {
          const status = await this.stepFunctionsService.getExecutionStatus(execution.executionArn);
          const mappedStatus = this.mapStepFunctionStatusToSagaStatus(status.status);
          
          await this.syncSagaStatusFromStepFunctions(sagaId, mappedStatus, status);
        }
      }
    } catch (error) {
      this.logger.error('Failed to monitor Step Functions executions', {
        error: error.message,
      });
    }
  }

  /**
   * Get saga performance metrics
   */
  async getSagaMetrics(timeframeHours = 24): Promise<{
    totalSagas: number;
    stepFunctionSagas: number;
    localSagas: number;
    successRate: number;
    avgDuration: number;
    failureReasons: Record<string, number>;
  }> {
    const since = new Date(Date.now() - timeframeHours * 60 * 60 * 1000);
    
    const sagas = await this.sagaRepository
      .createQueryBuilder('saga')
      .where('saga.createdAt >= :since', { since })
      .getMany();

    const totalSagas = sagas.length;
    const stepFunctionSagas = sagas.filter(s => s.metadata?.stepFunctionExecutionArn).length;
    const localSagas = totalSagas - stepFunctionSagas;
    const completedSagas = sagas.filter(s => s.status === SagaStatus.COMPLETED).length;
    const successRate = totalSagas > 0 ? (completedSagas / totalSagas) * 100 : 0;
    
    const durationsMs = sagas
      .filter(s => s.completedAt && s.startedAt)
      .map(s => s.completedAt!.getTime() - s.startedAt.getTime());
    
    const avgDuration = durationsMs.length > 0 
      ? durationsMs.reduce((sum, d) => sum + d, 0) / durationsMs.length 
      : 0;

    const failureReasons: Record<string, number> = {};
    sagas
      .filter(s => s.status === SagaStatus.FAILED && s.failureReason)
      .forEach(s => {
        const reason = s.failureReason!;
        failureReasons[reason] = (failureReasons[reason] || 0) + 1;
      });

    return {
      totalSagas,
      stepFunctionSagas,
      localSagas,
      successRate: Math.round(successRate * 100) / 100,
      avgDuration: Math.round(avgDuration),
      failureReasons,
    };
  }

  private async updateSagaWithExecutionArn(sagaId: string, executionArn: string): Promise<void> {
    const saga = await this.sagaRepository.findOne({ where: { id: sagaId } });
    if (saga) {
      saga.metadata = { stepFunctionExecutionArn: executionArn };
      await this.sagaRepository.save(saga);
    }
  }

  private async markSagaAsFailed(sagaId: string, reason: string): Promise<void> {
    await this.sagaRepository.update(sagaId, {
      status: SagaStatus.FAILED,
      failureReason: reason,
      failedAt: new Date(),
    });

    await this.emitSagaEvent(sagaId, 'SAGA_FAILED', { reason });
  }

  private mapStepFunctionStatusToSagaStatus(stepFunctionStatus: string): SagaStatus {
    const statusMap: Record<string, SagaStatus> = {
      'RUNNING': SagaStatus.IN_PROGRESS,
      'SUCCEEDED': SagaStatus.COMPLETED,
      'FAILED': SagaStatus.FAILED,
      'ABORTED': SagaStatus.CANCELLED,
      'TIMED_OUT': SagaStatus.FAILED,
    };

    return statusMap[stepFunctionStatus] || SagaStatus.FAILED;
  }

  private async syncSagaStatusFromStepFunctions(
    sagaId: string, 
    status: SagaStatus, 
    execution: any
  ): Promise<void> {
    const updateData: Partial<Saga> = { status };

    if (status === SagaStatus.COMPLETED) {
      updateData.completedAt = new Date();
    } else if (status === SagaStatus.FAILED) {
      updateData.failedAt = new Date();
      updateData.failureReason = execution.error || 'Step Functions execution failed';
    }

    await this.sagaRepository.update(sagaId, updateData);
  }

  private async emitSagaEvent(sagaId: string, eventType: string, data: any): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const outboxEvent = manager.create(OutboxEvent, {
        type: eventType,
        aggregateId: sagaId,
        aggregateType: 'Saga',
        data,
      });

      await manager.save(outboxEvent);
    });
  }
} 