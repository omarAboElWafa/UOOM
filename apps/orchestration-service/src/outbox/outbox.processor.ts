import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { OutboxService } from './outbox.service';

@Processor('outbox')
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);

  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
    private outboxService: OutboxService,
  ) {}

  @Process('process-event')
  async handleProcessEvent(job: Job<{ eventId: string }>) {
    const { eventId } = job.data;
    
    try {
      this.logger.log(`Processing outbox event: ${eventId}`);
      
      const event = await this.outboxRepository.findOne({
        where: { id: eventId },
      });

      if (!event) {
        throw new Error(`Event ${eventId} not found`);
      }

      if (event.processed) {
        this.logger.log(`Event ${eventId} already processed`);
        return;
      }

      // Process the event based on its type
      await this.processEvent(event);
      
      // Mark as processed
      await this.outboxService.markEventAsProcessed(eventId);
      
      this.logger.log(`Successfully processed event: ${eventId}`);
    } catch (error) {
      this.logger.error(`Failed to process event ${eventId}: ${error.message}`, {
        eventId,
        error,
      });
      
      await this.outboxService.markEventAsFailed(eventId, error.message);
      throw error;
    }
  }

  private async processEvent(event: OutboxEvent): Promise<void> {
    switch (event.type) {
      case 'OrderCreated':
        await this.handleOrderCreated(event);
        break;
      case 'OrderRouted':
        await this.handleOrderRouted(event);
        break;
      case 'OrderUpdated':
        await this.handleOrderUpdated(event);
        break;
      case 'OrderCancelled':
        await this.handleOrderCancelled(event);
        break;
      default:
        this.logger.warn(`Unknown event type: ${event.type}`);
    }
  }

  private async handleOrderCreated(event: OutboxEvent): Promise<void> {
    // In production, this would publish to Kafka/EventBridge
    this.logger.log(`Handling OrderCreated event`, {
      eventId: event.id,
      orderId: event.aggregateId,
      data: event.data,
    });
    
    // Simulate external service call
    await this.simulateExternalCall('order-created', event.data);
  }

  private async handleOrderRouted(event: OutboxEvent): Promise<void> {
    // In production, this would notify routing service
    this.logger.log(`Handling OrderRouted event`, {
      eventId: event.id,
      orderId: event.aggregateId,
      data: event.data,
    });
    
    // Simulate external service call
    await this.simulateExternalCall('order-routed', event.data);
  }

  private async handleOrderUpdated(event: OutboxEvent): Promise<void> {
    // In production, this would update downstream services
    this.logger.log(`Handling OrderUpdated event`, {
      eventId: event.id,
      orderId: event.aggregateId,
      data: event.data,
    });
    
    // Simulate external service call
    await this.simulateExternalCall('order-updated', event.data);
  }

  private async handleOrderCancelled(event: OutboxEvent): Promise<void> {
    // In production, this would notify cancellation to all services
    this.logger.log(`Handling OrderCancelled event`, {
      eventId: event.id,
      orderId: event.aggregateId,
      data: event.data,
    });
    
    // Simulate external service call
    await this.simulateExternalCall('order-cancelled', event.data);
  }

  private async simulateExternalCall(service: string, data: any): Promise<void> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate occasional failures
    if (Math.random() < 0.05) { // 5% failure rate
      throw new Error(`Simulated failure in ${service} service`);
    }
  }
} 