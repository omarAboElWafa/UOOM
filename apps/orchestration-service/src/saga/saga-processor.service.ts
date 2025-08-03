import { Processor, Process } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { SagaCoordinatorService } from './saga-coordinator.service';

export interface SagaExecutionJob {
  sagaId: string;
  correlationId?: string;
}

@Processor('saga-execution')
@Injectable()
export class SagaProcessorService {
  private readonly logger = new Logger(SagaProcessorService.name);

  constructor(
    private sagaCoordinator: SagaCoordinatorService,
  ) {}

  @Process('execute-saga')
  async handleSagaExecution(job: Job<SagaExecutionJob>) {
    const { sagaId, correlationId } = job.data;
    
    this.logger.debug(`Processing saga execution job`, {
      sagaId,
      correlationId,
      jobId: job.id,
    });

    const startTime = Date.now();

    try {
      await this.sagaCoordinator.executeSaga(sagaId, correlationId);
      
      const duration = Date.now() - startTime;
      this.logger.log(`Saga execution completed successfully`, {
        sagaId,
        duration,
        correlationId,
        jobId: job.id,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Saga execution failed`, {
        sagaId,
        error: error.message,
        duration,
        correlationId,
        jobId: job.id,
      });
      
      // Re-throw to allow Bull to handle retries
      throw error;
    }
  }

  @Process('retry-saga')
  async handleSagaRetry(job: Job<SagaExecutionJob>) {
    const { sagaId, correlationId } = job.data;
    
    this.logger.warn(`Retrying saga execution`, {
      sagaId,
      correlationId,
      jobId: job.id,
      attempt: job.attemptsMade,
    });

    // Use the same logic as execute-saga
    await this.handleSagaExecution(job);
  }
} 