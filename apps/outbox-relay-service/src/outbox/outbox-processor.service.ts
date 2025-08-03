import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { KafkaProducerService, KafkaMessage } from '@calo/kafka';
import { OutboxEvent } from '../entities/outbox-event.entity';

export interface ProcessingMetrics {
  eventsProcessed: number;
  eventsSucceeded: number;
  eventsFailed: number;
  averageProcessingTime: number;
  lastProcessedAt: Date;
}

@Injectable()
export class OutboxProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private isProcessing = false;
  private processingMetrics: ProcessingMetrics = {
    eventsProcessed: 0,
    eventsSucceeded: 0,
    eventsFailed: 0,
    averageProcessingTime: 0,
    lastProcessedAt: new Date(),
  };

  private readonly batchSize: number;
  private readonly maxRetries: number;
  private readonly processingIntervalMs: number;
  private readonly staleEventThresholdMs: number;

  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
    private kafkaProducer: KafkaProducerService,
    private configService: ConfigService,
  ) {
    this.batchSize = this.configService.get('OUTBOX_BATCH_SIZE', 100);
    this.maxRetries = this.configService.get('OUTBOX_MAX_RETRIES', 3);
    this.processingIntervalMs = this.configService.get('OUTBOX_PROCESSING_INTERVAL_MS', 5000);
    this.staleEventThresholdMs = this.configService.get('OUTBOX_STALE_EVENT_THRESHOLD_MS', 300000); // 5 minutes
  }

  async onModuleInit() {
    this.logger.log('Outbox Processor Service initialized');
    // Start processing immediately on startup
    await this.processOutboxEvents();
  }

  async onModuleDestroy() {
    this.logger.log('Outbox Processor Service shutting down');
  }

  /**
   * Scheduled task to process outbox events every 5 seconds
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async processOutboxEvents(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug('Processing already in progress, skipping this cycle');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      const events = await this.getUnprocessedEvents();
      
      if (events.length === 0) {
        this.logger.debug('No unprocessed events found');
        return;
      }

      this.logger.log(`Processing ${events.length} outbox events`);
      
      const results = await this.processEventBatch(events);
      
      // Update metrics
      this.updateProcessingMetrics(results, Date.now() - startTime);
      
      this.logger.log(`Processed batch: ${results.succeeded} succeeded, ${results.failed} failed`);
    } catch (error) {
      this.logger.error('Failed to process outbox events', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Retry failed events that haven't exceeded max retry count
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async retryFailedEvents(): Promise<void> {
    try {
      const failedEvents = await this.getRetryableFailedEvents();
      
      if (failedEvents.length === 0) {
        return;
      }

      this.logger.log(`Retrying ${failedEvents.length} failed events`);
      
      const results = await this.processEventBatch(failedEvents);
      
      this.logger.log(`Retry batch: ${results.succeeded} succeeded, ${results.failed} failed`);
    } catch (error) {
      this.logger.error('Failed to retry failed events', error);
    }
  }

  /**
   * Clean up old processed events and events that exceed max retries
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOldEvents(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      
      // Delete old processed events
      const processedResult = await this.outboxRepository.delete({
        processed: true,
        processedAt: LessThan(cutoffDate),
      });

      // Delete events that exceeded max retries
      const maxRetriesResult = await this.outboxRepository.delete({
        retryCount: LessThan(this.maxRetries),
        createdAt: LessThan(cutoffDate),
      });

      const totalDeleted = (processedResult.affected || 0) + (maxRetriesResult.affected || 0);
      
      if (totalDeleted > 0) {
        this.logger.log(`Cleaned up ${totalDeleted} old outbox events`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old events', error);
    }
  }

  private async getUnprocessedEvents(): Promise<OutboxEvent[]> {
    return this.outboxRepository.find({
      where: [
        { processed: false, error: IsNull() },
        { 
          processed: false, 
          scheduledAt: LessThan(new Date()),
          retryCount: LessThan(this.maxRetries)
        }
      ],
      order: { createdAt: 'ASC' },
      take: this.batchSize,
    });
  }

  private async getRetryableFailedEvents(): Promise<OutboxEvent[]> {
    const retryThreshold = new Date(Date.now() - this.staleEventThresholdMs);
    
    return this.outboxRepository.find({
      where: {
        processed: false,
        error: IsNull(),
        retryCount: LessThan(this.maxRetries),
        createdAt: LessThan(retryThreshold),
      },
      order: { createdAt: 'ASC' },
      take: this.batchSize,
    });
  }

  private async processEventBatch(events: OutboxEvent[]): Promise<{ succeeded: number; failed: number }> {
    let succeeded = 0;
    let failed = 0;

    // Process events in parallel with concurrency limit
    const concurrencyLimit = this.configService.get('OUTBOX_CONCURRENCY_LIMIT', 10);
    const chunks = this.chunkArray(events, concurrencyLimit);

    for (const chunk of chunks) {
      const promises = chunk.map(event => this.processEvent(event));
      const results = await Promise.allSettled(promises);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          succeeded++;
        } else {
          failed++;
          this.logger.error(`Failed to process event ${chunk[index].id}`, 
            result.status === 'rejected' ? result.reason : 'Unknown error'
          );
        }
      });
    }

    return { succeeded, failed };
  }

  private async processEvent(event: OutboxEvent): Promise<boolean> {
    try {
      // Create Kafka message from outbox event
      const kafkaMessage: KafkaMessage = {
        topic: this.getTopicForEventType(event.type),
        key: event.aggregateId,
        value: JSON.stringify({
          id: event.id,
          type: event.type,
          aggregateId: event.aggregateId,
          aggregateType: event.aggregateType,
          data: event.data,
          timestamp: event.createdAt.toISOString(),
          version: 1,
        }),
        headers: {
          'event-type': event.type,
          'aggregate-type': event.aggregateType,
          'aggregate-id': event.aggregateId,
          'event-id': event.id,
          'created-at': event.createdAt.toISOString(),
        },
      };

      // Publish to Kafka
      const result = await this.kafkaProducer.publishMessage(kafkaMessage);
      
      if (result.success) {
        // Mark as processed
        await this.markEventAsProcessed(event.id);
        
        this.logger.debug(`Successfully processed event ${event.id}`, {
          eventId: event.id,
          type: event.type,
          topic: kafkaMessage.topic,
          aggregateId: event.aggregateId,
        });
        
        return true;
      } else {
        // Mark as failed and increment retry count
        await this.markEventAsFailed(event.id, result.error?.message || 'Unknown error');
        return false;
      }
    } catch (error) {
      this.logger.error(`Error processing event ${event.id}`, error);
      await this.markEventAsFailed(event.id, error.message);
      return false;
    }
  }

  private getTopicForEventType(eventType: string): string {
    // Map event types to Kafka topics
    const topicMap: Record<string, string> = {
      // Order events
      'ORDER_CREATED': 'orders',
      'ORDER_CONFIRMED': 'orders',
      'ORDER_PREPARING': 'orders',
      'ORDER_READY_FOR_PICKUP': 'orders',
      'ORDER_PICKED_UP': 'orders',
      'ORDER_IN_TRANSIT': 'orders',
      'ORDER_DELIVERED': 'orders',
      'ORDER_CANCELLED': 'orders',
      'ORDER_FAILED': 'orders',
      'ORDER_ASSIGNED_TO_DRIVER': 'orders',
      'ORDER_ESTIMATED_DELIVERY_UPDATED': 'orders',

      // Capacity events
      'CAPACITY_UPDATED': 'capacity',
      'CAPACITY_THRESHOLD_EXCEEDED': 'capacity',
      'CAPACITY_RECOVERED': 'capacity',
      'DRIVER_AVAILABLE': 'capacity',
      'DRIVER_BUSY': 'capacity',
      'RESTAURANT_CAPACITY_CHANGED': 'capacity',
      'ZONE_CAPACITY_CHANGED': 'capacity',

      // Optimization events
      'OPTIMIZATION_REQUESTED': 'optimization',
      'OPTIMIZATION_STARTED': 'optimization',
      'OPTIMIZATION_COMPLETED': 'optimization',
      'OPTIMIZATION_FAILED': 'optimization',
      'OPTIMIZATION_TIMEOUT': 'optimization',
      'ROUTE_ASSIGNED': 'optimization',
      'DRIVER_ASSIGNED': 'optimization',
    };

    return topicMap[eventType] || 'default-events';
  }

  private async markEventAsProcessed(eventId: string): Promise<void> {
    await this.outboxRepository.update(eventId, {
      processed: true,
      processedAt: new Date(),
      error: null,
    });
  }

  private async markEventAsFailed(eventId: string, error: string): Promise<void> {
    const retryDelay = this.calculateRetryDelay();
    
    await this.outboxRepository.update(eventId, {
      error,
      retryCount: () => 'retry_count + 1',
      scheduledAt: new Date(Date.now() + retryDelay),
    });
  }

  private calculateRetryDelay(): number {
    // Exponential backoff: 30s, 60s, 120s
    return 30000; // Start with 30 seconds, can be made more sophisticated
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private updateProcessingMetrics(results: { succeeded: number; failed: number }, processingTime: number): void {
    this.processingMetrics.eventsProcessed += results.succeeded + results.failed;
    this.processingMetrics.eventsSucceeded += results.succeeded;
    this.processingMetrics.eventsFailed += results.failed;
    this.processingMetrics.lastProcessedAt = new Date();
    
    // Update rolling average processing time
    const alpha = 0.1; // Smoothing factor for exponential moving average
    this.processingMetrics.averageProcessingTime = 
      alpha * processingTime + (1 - alpha) * this.processingMetrics.averageProcessingTime;
  }

  /**
   * Get current processing metrics for monitoring
   */
  getProcessingMetrics(): ProcessingMetrics {
    return { ...this.processingMetrics };
  }

  /**
   * Get health status of the processor
   */
  getHealthStatus(): { status: 'healthy' | 'unhealthy', details: any } {
    const now = Date.now();
    const lastProcessedMs = now - this.processingMetrics.lastProcessedAt.getTime();
    const isStale = lastProcessedMs > this.processingIntervalMs * 3; // 3x the processing interval
    
    return {
      status: isStale ? 'unhealthy' : 'healthy',
      details: {
        isProcessing: this.isProcessing,
        lastProcessedAt: this.processingMetrics.lastProcessedAt,
        timeSinceLastProcessing: lastProcessedMs,
        metrics: this.processingMetrics,
      },
    };
  }
} 