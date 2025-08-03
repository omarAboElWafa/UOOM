import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SagaStatus {
  STARTED = 'STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED = 'COMPENSATED',
}

export enum SagaStepStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  COMPENSATED = 'COMPENSATED',
}

export interface SagaStepData {
  stepName: string;
  status: SagaStepStatus;
  executedAt?: Date;
  compensatedAt?: Date;
  error?: string;
  retryCount: number;
  data?: any;
}

@Entity('sagas')
@Index(['sagaType', 'status'])
@Index(['aggregateId', 'sagaType'])
export class Saga {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'saga_type' })
  sagaType: string;

  @Column({ name: 'aggregate_id' })
  @Index()
  aggregateId: string;

  @Column({ name: 'aggregate_type' })
  aggregateType: string;

  @Column({
    type: 'enum',
    enum: SagaStatus,
    default: SagaStatus.STARTED,
  })
  @Index()
  status: SagaStatus;

  @Column({ type: 'jsonb', name: 'saga_data' })
  sagaData: any;

  @Column({ type: 'jsonb', name: 'step_data' })
  stepData: SagaStepData[];

  @Column({ name: 'current_step', default: 0 })
  currentStep: number;

  @Column({ name: 'total_steps' })
  totalSteps: number;

  @Column({ type: 'text', nullable: true, name: 'failure_reason' })
  failureReason?: string;

  @Column({ type: 'timestamp', nullable: true, name: 'started_at' })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'completed_at' })
  completedAt?: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'failed_at' })
  failedAt?: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'compensated_at' })
  compensatedAt?: Date;

  @Column({ type: 'integer', default: 0, name: 'retry_count' })
  retryCount: number;

  @Column({ type: 'integer', default: 3, name: 'max_retries' })
  maxRetries: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Helper methods
  get isCompleted(): boolean {
    return this.status === SagaStatus.COMPLETED;
  }

  get isFailed(): boolean {
    return this.status === SagaStatus.FAILED;
  }

  get isCompensating(): boolean {
    return this.status === SagaStatus.COMPENSATING;
  }

  get canRetry(): boolean {
    return this.retryCount < this.maxRetries;
  }

  get completedSteps(): SagaStepData[] {
    return this.stepData.filter(step => step.status === SagaStepStatus.COMPLETED);
  }

  get failedSteps(): SagaStepData[] {
    return this.stepData.filter(step => step.status === SagaStepStatus.FAILED);
  }
} 