import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum OutboxEventStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
}

@Entity('outbox_events')
@Index(['status', 'createdAt'])
@Index(['aggregateId'])
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 255 })
  @Index()
  aggregateId: string;

  @Column('varchar', { length: 100 })
  eventType: string;

  @Column('jsonb')
  eventData: any;

  @Column({
    type: 'enum',
    enum: OutboxEventStatus,
    default: OutboxEventStatus.PENDING,
  })
  @Index()
  status: OutboxEventStatus;

  @Column('int', { default: 0 })
  retryCount: number;

  @Column('timestamp', { nullable: true })
  processedAt: Date;

  @Column('timestamp', { nullable: true })
  nextRetryAt: Date;

  @Column('text', { nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;
} 