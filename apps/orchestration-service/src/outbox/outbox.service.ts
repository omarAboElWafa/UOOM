import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { OutboxEvent } from '../entities/outbox-event.entity';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
    @InjectQueue('outbox') private outboxQueue: Queue,
  ) {}

  async createEvent(eventData: {
    type: string;
    aggregateId: string;
    aggregateType: string;
    data: Record<string, any>;
  }): Promise<OutboxEvent> {
    const event = this.outboxRepository.create({
      ...eventData,
      processed: false,
      retryCount: 0,
    });

    const savedEvent = await this.outboxRepository.save(event);
    
    this.logger.log(`Created outbox event: ${eventData.type}`, {
      eventId: savedEvent.id,
      aggregateId: eventData.aggregateId,
    });

    // Queue the event for processing
    await this.outboxQueue.add('process-event', {
      eventId: savedEvent.id,
    });

    return savedEvent;
  }

  async getUnprocessedEvents(limit = 100): Promise<OutboxEvent[]> {
    return this.outboxRepository.find({
      where: { processed: false },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  async markEventAsProcessed(eventId: string): Promise<void> {
    await this.outboxRepository.update(eventId, {
      processed: true,
      processedAt: new Date(),
    });

    this.logger.log(`Marked event as processed`, { eventId });
  }

  async markEventAsFailed(eventId: string, error: string): Promise<void> {
    await this.outboxRepository.update(eventId, {
      error,
      retryCount: () => 'retry_count + 1',
    });

    this.logger.error(`Marked event as failed`, { eventId, error });
  }

  async getEventStats(): Promise<any> {
    const [total, processed, failed] = await Promise.all([
      this.outboxRepository.count(),
      this.outboxRepository.count({ where: { processed: true } }),
      this.outboxRepository.count({ where: { error: 'IS NOT NULL' } }),
    ]);

    return {
      total,
      processed,
      failed,
      pending: total - processed,
      successRate: total > 0 ? (processed / total) * 100 : 0,
    };
  }

  async retryFailedEvents(): Promise<number> {
    const failedEvents = await this.outboxRepository
      .createQueryBuilder('event')
      .where('event.processed = :processed', { processed: false })
      .andWhere('event.error IS NOT NULL')
      .andWhere('event.retryCount < :maxRetries', { maxRetries: 3 })
      .getMany();

    let retryCount = 0;
    for (const event of failedEvents) {
      try {
        await this.outboxQueue.add('process-event', {
          eventId: event.id,
        });
        retryCount++;
      } catch (error) {
        this.logger.error(`Failed to queue retry for event ${event.id}`, { error });
      }
    }

    this.logger.log(`Queued ${retryCount} events for retry`);
    return retryCount;
  }
} 