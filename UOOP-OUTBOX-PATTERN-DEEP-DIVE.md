# UOOP Outbox Pattern - Deep Dive

## Executive Summary

The Outbox Pattern is a critical component of the UOOP platform that ensures reliable event delivery in distributed systems. This document provides a detailed technical analysis of how the pattern guarantees at-least-once delivery, handles failures gracefully, and maintains data consistency across microservices.

## Problem Statement

### Distributed Event Delivery Challenges
In a microservices architecture, reliable event delivery faces several challenges:
1. **Network Failures**: Events may be lost during transmission
2. **Service Outages**: Downstream services may be unavailable
3. **Data Consistency**: Events must be delivered exactly once
4. **Ordering**: Events may arrive out of order
5. **Scalability**: High-volume event processing requirements

### Traditional Approaches and Their Limitations
- **Direct HTTP Calls**: Prone to network failures and timeouts
- **Message Queues**: Can lose messages if not properly configured
- **Database Triggers**: Limited scalability and complex error handling
- **Event Sourcing**: Complex implementation and storage requirements

## Outbox Pattern Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATION SERVICE                              │
│                                                                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│  │   Order         │  │   Outbox        │  │   Event         │           │
│  │   Processing    │  │   Service       │  │   Publisher     │           │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘           │
│           │                     │                     │                   │
│           ▼                     ▼                     ▼                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│  │   Database      │  │   Outbox        │  │   Event Bus     │           │
│  │   Transaction   │  │   Table         │  │   (Kafka/MSK)   │           │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OUTBOX RELAY SERVICE                               │
│                                                                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│  │   Event         │  │   Retry         │  │   Dead Letter   │           │
│  │   Processor     │  │   Engine        │  │   Queue         │           │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘           │
│           │                     │                     │                   │
│           ▼                     ▼                     ▼                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│  │   Schema        │  │   Exponential   │  │   Alert         │           │
│  │   Validation    │  │   Backoff       │  │   Service       │           │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DOWNSTREAM SERVICES                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Payment   │  │   Inventory │  │   Logistics │  │   Analytics │     │
│  │   Service   │  │   Service   │  │   Service   │  │   Service   │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Implementation

### 1. Outbox Entity Design

```typescript
@Entity('outbox_events')
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  eventType: string;

  @Column({ type: 'varchar', length: 100 })
  aggregateType: string;

  @Column({ type: 'varchar', length: 100 })
  aggregateId: string;

  @Column({ type: 'jsonb' })
  payload: any;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @Column({ type: 'enum', enum: OutboxEventStatus })
  status: OutboxEventStatus = OutboxEventStatus.PENDING;

  @Column({ type: 'int', default: 0 })
  retryCount: number = 0;

  @Column({ type: 'timestamp', nullable: true })
  nextRetryAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'timestamp' })
  createdAt: Date = new Date();

  @Column({ type: 'timestamp' })
  updatedAt: Date = new Date();

  @BeforeUpdate()
  updateTimestamp() {
    this.updatedAt = new Date();
  }
}

export enum OutboxEventStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER'
}
```

### 2. Outbox Service Implementation

```typescript
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly maxRetries = 5;
  private readonly retryDelays = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,
    private readonly dataSource: DataSource,
    private readonly eventBus: EventBus,
    private readonly configService: ConfigService
  ) {}

  /**
   * Publishes an event using the outbox pattern
   * Ensures atomic transaction with business logic
   */
  async publishEvent<T>(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: T,
    metadata?: any
  ): Promise<string> {
    const outboxEvent = new OutboxEvent({
      eventType,
      aggregateType,
      aggregateId,
      payload,
      metadata,
      status: OutboxEventStatus.PENDING
    });

    // Save to outbox table within the current transaction
    await this.outboxRepository.save(outboxEvent);
    
    this.logger.log('Event saved to outbox', {
      eventId: outboxEvent.id,
      eventType,
      aggregateId
    });

    return outboxEvent.id;
  }

  /**
   * Processes pending outbox events
   * Called by the outbox relay service
   */
  async processPendingEvents(batchSize: number = 100): Promise<ProcessResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Select events for processing with row-level locking
      const events = await queryRunner.manager
        .createQueryBuilder(OutboxEvent, 'event')
        .where('event.status = :status', { status: OutboxEventStatus.PENDING })
        .andWhere('(event.nextRetryAt IS NULL OR event.nextRetryAt <= :now)', { 
          now: new Date() 
        })
        .andWhere('event.retryCount < :maxRetries', { maxRetries: this.maxRetries })
        .orderBy('event.createdAt', 'ASC')
        .limit(batchSize)
        .setLock('pessimistic_write')
        .getMany();

      let processedCount = 0;
      let failedCount = 0;

      for (const event of events) {
        try {
          // Mark as processing
          event.status = OutboxEventStatus.PROCESSING;
          await queryRunner.manager.save(event);

          // Publish to event bus
          await this.publishToEventBus(event);

          // Mark as completed
          event.status = OutboxEventStatus.COMPLETED;
          event.processedAt = new Date();
          await queryRunner.manager.save(event);

          processedCount++;
          
          this.logger.log('Event processed successfully', {
            eventId: event.id,
            eventType: event.eventType
          });

        } catch (error) {
          await this.handleEventFailure(event, error, queryRunner);
          failedCount++;
        }
      }

      await queryRunner.commitTransaction();

      return {
        processed: processedCount,
        failed: failedCount,
        total: events.length
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Publishes event to the event bus (Kafka/MSK)
   */
  private async publishToEventBus(event: OutboxEvent): Promise<void> {
    const message = {
      id: event.id,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      metadata: event.metadata,
      timestamp: event.createdAt,
      version: 1
    };

    // Validate event schema
    await this.validateEventSchema(message);

    // Publish to Kafka/MSK
    await this.eventBus.publish(event.eventType, message);

    this.logger.log('Event published to event bus', {
      eventId: event.id,
      eventType: event.eventType,
      topic: event.eventType
    });
  }

  /**
   * Handles event processing failures with retry logic
   */
  private async handleEventFailure(
    event: OutboxEvent, 
    error: Error, 
    queryRunner: QueryRunner
  ): Promise<void> {
    event.retryCount++;
    event.errorMessage = error.message;

    if (event.retryCount >= this.maxRetries) {
      event.status = OutboxEventStatus.DEAD_LETTER;
      this.logger.error('Event moved to dead letter queue', {
        eventId: event.id,
        eventType: event.eventType,
        error: error.message,
        retryCount: event.retryCount
      });

      // Send alert for manual intervention
      await this.sendDeadLetterAlert(event, error);

    } else {
      event.status = OutboxEventStatus.PENDING;
      event.nextRetryAt = this.calculateNextRetryTime(event.retryCount);
      
      this.logger.warn('Event scheduled for retry', {
        eventId: event.id,
        eventType: event.eventType,
        retryCount: event.retryCount,
        nextRetryAt: event.nextRetryAt
      });
    }

    await queryRunner.manager.save(event);
  }

  /**
   * Calculates next retry time using exponential backoff
   */
  private calculateNextRetryTime(retryCount: number): Date {
    const delay = this.retryDelays[Math.min(retryCount - 1, this.retryDelays.length - 1)];
    const nextRetry = new Date();
    nextRetry.setMilliseconds(nextRetry.getMilliseconds() + delay);
    return nextRetry;
  }

  /**
   * Validates event schema before publishing
   */
  private async validateEventSchema(message: any): Promise<void> {
    const schema = await this.getEventSchema(message.eventType);
    if (schema) {
      const validation = await this.validateSchema(message, schema);
      if (!validation.valid) {
        throw new EventValidationError(
          `Event validation failed: ${validation.errors.join(', ')}`
        );
      }
    }
  }

  /**
   * Sends alert for events in dead letter queue
   */
  private async sendDeadLetterAlert(event: OutboxEvent, error: Error): Promise<void> {
    const alert = {
      type: 'DEAD_LETTER_EVENT',
      severity: 'HIGH',
      data: {
        eventId: event.id,
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        error: error.message,
        retryCount: event.retryCount,
        createdAt: event.createdAt
      }
    };

    await this.alertService.sendAlert(alert);
  }
}
```

### 3. Outbox Relay Service

```typescript
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly processingInterval = 1000; // 1 second
  private isProcessing = false;

  constructor(
    private readonly outboxService: OutboxService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService
  ) {}

  /**
   * Starts the outbox relay service
   */
  async start(): Promise<void> {
    this.logger.log('Starting outbox relay service');
    
    // Process events continuously
    setInterval(async () => {
      if (!this.isProcessing) {
        await this.processEvents();
      }
    }, this.processingInterval);
  }

  /**
   * Processes outbox events in batches
   */
  private async processEvents(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      const result = await this.outboxService.processPendingEvents(100);
      
      // Record metrics
      this.metricsService.recordOutboxProcessing({
        processed: result.processed,
        failed: result.failed,
        duration: Date.now() - startTime
      });

      if (result.processed > 0 || result.failed > 0) {
        this.logger.log('Outbox processing completed', {
          processed: result.processed,
          failed: result.failed,
          duration: Date.now() - startTime
        });
      }

    } catch (error) {
      this.logger.error('Outbox processing failed', {
        error: error.message,
        duration: Date.now() - startTime
      });
      
      // Record error metrics
      this.metricsService.recordOutboxError(error);
      
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Health check for the outbox relay service
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      const pendingCount = await this.getPendingEventCount();
      const deadLetterCount = await this.getDeadLetterCount();
      
      return {
        status: 'healthy',
        details: {
          pendingEvents: pendingCount,
          deadLetterEvents: deadLetterCount,
          isProcessing: this.isProcessing
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Gets count of pending events
   */
  private async getPendingEventCount(): Promise<number> {
    return this.outboxService.getPendingEventCount();
  }

  /**
   * Gets count of dead letter events
   */
  private async getDeadLetterCount(): Promise<number> {
    return this.outboxService.getDeadLetterCount();
  }
}
```

## Integration with Business Logic

### 1. Order Processing with Outbox Pattern

```typescript
@Injectable()
export class OrderService {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Processes an order with atomic event publishing
   */
  async processOrder(createOrderDto: CreateOrderDto): Promise<OrderResponse> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create order entity
      const order = new Order({
        customerId: createOrderDto.customerId,
        items: createOrderDto.items,
        deliveryLocation: createOrderDto.deliveryLocation,
        totalAmount: this.calculateTotal(createOrderDto.items),
        status: OrderStatus.PENDING
      });

      // Save order
      const savedOrder = await queryRunner.manager.save(order);

      // Publish events using outbox pattern (atomic with order creation)
      await this.outboxService.publishEvent(
        'OrderCreated',
        'Order',
        savedOrder.id,
        {
          orderId: savedOrder.id,
          customerId: savedOrder.customerId,
          items: savedOrder.items,
          totalAmount: savedOrder.totalAmount,
          deliveryLocation: savedOrder.deliveryLocation
        },
        {
          correlationId: createOrderDto.correlationId,
          source: 'order-service'
        }
      );

      await this.outboxService.publishEvent(
        'InventoryReservationRequested',
        'Order',
        savedOrder.id,
        {
          orderId: savedOrder.id,
          items: savedOrder.items,
          channelId: createOrderDto.channelId
        }
      );

      await queryRunner.commitTransaction();

      return this.mapToResponseDto(savedOrder);

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Updates order status with event publishing
   */
  async updateOrderStatus(
    orderId: string, 
    newStatus: OrderStatus, 
    metadata?: any
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await queryRunner.manager.findOne(Order, { 
        where: { id: orderId } 
      });

      if (!order) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }

      const previousStatus = order.status;
      order.status = newStatus;
      order.updatedAt = new Date();

      await queryRunner.manager.save(order);

      // Publish status change event
      await this.outboxService.publishEvent(
        'OrderStatusChanged',
        'Order',
        orderId,
        {
          orderId,
          previousStatus,
          newStatus,
          changedAt: order.updatedAt
        },
        metadata
      );

      await queryRunner.commitTransaction();

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
```

## Event Schema Management

### 1. Event Schema Registry

```typescript
@Injectable()
export class EventSchemaRegistry {
  private readonly schemas = new Map<string, JSONSchema>();

  constructor() {
    this.registerSchemas();
  }

  /**
   * Registers event schemas
   */
  private registerSchemas(): void {
    // OrderCreated event schema
    this.schemas.set('OrderCreated', {
      type: 'object',
      required: ['orderId', 'customerId', 'items', 'totalAmount'],
      properties: {
        orderId: { type: 'string', format: 'uuid' },
        customerId: { type: 'string', format: 'uuid' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['itemId', 'name', 'quantity', 'unitPrice'],
            properties: {
              itemId: { type: 'string' },
              name: { type: 'string' },
              quantity: { type: 'number', minimum: 1 },
              unitPrice: { type: 'number', minimum: 0 }
            }
          }
        },
        totalAmount: { type: 'number', minimum: 0 },
        deliveryLocation: {
          type: 'object',
          required: ['latitude', 'longitude', 'address'],
          properties: {
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
            address: { type: 'string' }
          }
        }
      }
    });

    // OrderStatusChanged event schema
    this.schemas.set('OrderStatusChanged', {
      type: 'object',
      required: ['orderId', 'previousStatus', 'newStatus', 'changedAt'],
      properties: {
        orderId: { type: 'string', format: 'uuid' },
        previousStatus: { type: 'string', enum: Object.values(OrderStatus) },
        newStatus: { type: 'string', enum: Object.values(OrderStatus) },
        changedAt: { type: 'string', format: 'date-time' }
      }
    });
  }

  /**
   * Gets schema for event type
   */
  getSchema(eventType: string): JSONSchema | undefined {
    return this.schemas.get(eventType);
  }

  /**
   * Validates event against schema
   */
  validateEvent(eventType: string, payload: any): ValidationResult {
    const schema = this.getSchema(eventType);
    if (!schema) {
      return { valid: true }; // No schema means no validation required
    }

    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    const valid = validate(payload);

    return {
      valid,
      errors: validate.errors?.map(e => `${e.instancePath} ${e.message}`) || []
    };
  }
}
```

## Performance Optimization

### 1. Batch Processing

```typescript
@Injectable()
export class OutboxBatchProcessor {
  private readonly batchSize = 100;
  private readonly processingInterval = 1000; // 1 second

  async processBatch(): Promise<BatchResult> {
    const events = await this.getPendingEvents(this.batchSize);
    
    if (events.length === 0) {
      return { processed: 0, failed: 0 };
    }

    // Process events in parallel with concurrency limit
    const concurrencyLimit = 10;
    const chunks = this.chunkArray(events, concurrencyLimit);
    
    let processed = 0;
    let failed = 0;

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(event => this.processEvent(event))
      );

      results.forEach(result => {
        if (result.status === 'fulfilled') {
          processed++;
        } else {
          failed++;
        }
      });
    }

    return { processed, failed };
  }

  /**
   * Processes a single event
   */
  private async processEvent(event: OutboxEvent): Promise<void> {
    try {
      await this.publishToEventBus(event);
      await this.markAsProcessed(event);
    } catch (error) {
      await this.handleFailure(event, error);
      throw error;
    }
  }
}
```

### 2. Database Optimization

```sql
-- Indexes for optimal query performance
CREATE INDEX idx_outbox_events_status_created_at 
ON outbox_events(status, created_at);

CREATE INDEX idx_outbox_events_next_retry_at 
ON outbox_events(next_retry_at) 
WHERE status = 'PENDING';

CREATE INDEX idx_outbox_events_aggregate_id 
ON outbox_events(aggregate_type, aggregate_id);

-- Partitioning for large tables
CREATE TABLE outbox_events_partitioned (
  LIKE outbox_events INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Create partitions for each month
CREATE TABLE outbox_events_2024_01 
PARTITION OF outbox_events_partitioned 
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Cleanup old events
CREATE OR REPLACE FUNCTION cleanup_old_events()
RETURNS void AS $$
BEGIN
  DELETE FROM outbox_events 
  WHERE status = 'COMPLETED' 
  AND created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup job
SELECT cron.schedule('cleanup-outbox-events', '0 2 * * *', 'SELECT cleanup_old_events();');
```

## Monitoring & Observability

### 1. Metrics Collection

```typescript
@Injectable()
export class OutboxMetricsService {
  private readonly eventProcessingDuration = new Histogram({
    name: 'outbox_event_processing_duration',
    help: 'Time taken to process outbox events',
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
  });

  private readonly eventProcessingSuccess = new Counter({
    name: 'outbox_events_processed_total',
    help: 'Total number of events processed successfully',
    labelNames: ['event_type']
  });

  private readonly eventProcessingFailure = new Counter({
    name: 'outbox_events_failed_total',
    help: 'Total number of events that failed processing',
    labelNames: ['event_type', 'error_type']
  });

  private readonly deadLetterEvents = new Gauge({
    name: 'outbox_dead_letter_events',
    help: 'Number of events in dead letter queue',
    labelNames: ['event_type']
  });

  recordEventProcessing(duration: number, eventType: string): void {
    this.eventProcessingDuration.observe(duration);
    this.eventProcessingSuccess.inc({ event_type: eventType });
  }

  recordEventFailure(eventType: string, errorType: string): void {
    this.eventProcessingFailure.inc({ 
      event_type: eventType, 
      error_type: errorType 
    });
  }

  recordDeadLetterEvent(eventType: string): void {
    this.deadLetterEvents.inc({ event_type: eventType });
  }
}
```

### 2. Health Checks

```typescript
@Injectable()
export class OutboxHealthIndicator implements HealthIndicator {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly metricsService: OutboxMetricsService
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const pendingCount = await this.outboxService.getPendingEventCount();
      const deadLetterCount = await this.outboxService.getDeadLetterCount();
      
      const isHealthy = pendingCount < 1000 && deadLetterCount < 100;
      
      return {
        [key]: {
          status: isHealthy ? 'up' : 'down',
          pendingEvents: pendingCount,
          deadLetterEvents: deadLetterCount,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      return {
        [key]: {
          status: 'down',
          error: error.message,
          timestamp: Date.now()
        }
      };
    }
  }
}
```

## Error Handling & Recovery

### 1. Dead Letter Queue Management

```typescript
@Injectable()
export class DeadLetterQueueService {
  async processDeadLetterEvents(): Promise<void> {
    const deadLetterEvents = await this.getDeadLetterEvents();
    
    for (const event of deadLetterEvents) {
      try {
        // Attempt to reprocess with manual intervention
        await this.reprocessEvent(event);
        
        this.logger.log('Dead letter event reprocessed successfully', {
          eventId: event.id,
          eventType: event.eventType
        });
        
      } catch (error) {
        this.logger.error('Failed to reprocess dead letter event', {
          eventId: event.id,
          eventType: event.eventType,
          error: error.message
        });
        
        // Send alert for manual intervention
        await this.sendManualInterventionAlert(event, error);
      }
    }
  }

  async reprocessEvent(event: OutboxEvent): Promise<void> {
    // Reset event for reprocessing
    event.status = OutboxEventStatus.PENDING;
    event.retryCount = 0;
    event.nextRetryAt = null;
    event.errorMessage = null;
    
    await this.outboxRepository.save(event);
  }
}
```

### 2. Circuit Breaker for Event Publishing

```typescript
@Injectable()
export class EventPublishingCircuitBreaker {
  private readonly circuitBreaker = new CircuitBreaker({
    failureThreshold: 10,
    recoveryTimeout: 60000, // 1 minute
    monitorInterval: 10000
  });

  async publishEvent(event: OutboxEvent): Promise<void> {
    return this.circuitBreaker.fire(
      async () => {
        await this.eventBus.publish(event.eventType, event.payload);
      },
      async () => {
        // Fallback: store in local cache for later retry
        await this.cacheFailedEvent(event);
      }
    );
  }
}
```

## Testing Strategy

### 1. Unit Tests

```typescript
describe('OutboxService', () => {
  let outboxService: OutboxService;
  let outboxRepository: Repository<OutboxEvent>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OutboxService,
        {
          provide: getRepositoryToken(OutboxEvent),
          useClass: Repository
        }
      ]
    }).compile();

    outboxService = module.get<OutboxService>(OutboxService);
    outboxRepository = module.get<Repository<OutboxEvent>>(getRepositoryToken(OutboxEvent));
  });

  it('should publish event to outbox', async () => {
    const eventData = {
      eventType: 'OrderCreated',
      aggregateType: 'Order',
      aggregateId: 'order-123',
      payload: { orderId: 'order-123' }
    };

    const eventId = await outboxService.publishEvent(
      eventData.eventType,
      eventData.aggregateType,
      eventData.aggregateId,
      eventData.payload
    );

    expect(eventId).toBeDefined();
    
    const savedEvent = await outboxRepository.findOne({ where: { id: eventId } });
    expect(savedEvent.status).toBe(OutboxEventStatus.PENDING);
    expect(savedEvent.eventType).toBe(eventData.eventType);
  });
});
```

### 2. Integration Tests

```typescript
describe('OutboxPattern Integration', () => {
  it('should ensure atomic transaction with event publishing', async () => {
    const orderData = createOrderDto();
    
    // Process order (should create order and publish events atomically)
    const order = await orderService.processOrder(orderData);
    
    // Verify order was created
    expect(order.id).toBeDefined();
    
    // Verify events were published to outbox
    const outboxEvents = await outboxRepository.find({
      where: { aggregateId: order.id }
    });
    
    expect(outboxEvents).toHaveLength(2); // OrderCreated + InventoryReservationRequested
    expect(outboxEvents[0].status).toBe(OutboxEventStatus.PENDING);
  });

  it('should handle database transaction rollback', async () => {
    // Mock database failure
    jest.spyOn(orderRepository, 'save').mockRejectedValue(new Error('Database error'));
    
    const orderData = createOrderDto();
    
    // Should throw error and rollback transaction
    await expect(orderService.processOrder(orderData)).rejects.toThrow('Database error');
    
    // Verify no events were published
    const outboxEvents = await outboxRepository.find({
      where: { eventType: 'OrderCreated' }
    });
    
    expect(outboxEvents).toHaveLength(0);
  });
});
```

## Performance Benchmarks

### 1. Throughput Testing

```typescript
describe('Outbox Performance Tests', () => {
  it('should handle 10,000 events per second', async () => {
    const startTime = Date.now();
    const eventCount = 10000;
    
    const promises = Array.from({ length: eventCount }, (_, i) =>
      outboxService.publishEvent(
        'TestEvent',
        'Test',
        `test-${i}`,
        { data: `test-data-${i}` }
      )
    );
    
    await Promise.all(promises);
    
    const duration = Date.now() - startTime;
    const throughput = eventCount / (duration / 1000);
    
    expect(throughput).toBeGreaterThan(10000); // 10k events per second
  });
});
```

### 2. Latency Testing

```typescript
it('should process events with sub-100ms latency', async () => {
  const latencies: number[] = [];
  
  for (let i = 0; i < 100; i++) {
    const startTime = Date.now();
    
    await outboxService.publishEvent(
      'TestEvent',
      'Test',
      `test-${i}`,
      { data: `test-data-${i}` }
    );
    
    const latency = Date.now() - startTime;
    latencies.push(latency);
  }
  
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
  
  expect(avgLatency).toBeLessThan(50); // Average < 50ms
  expect(p95Latency).toBeLessThan(100); // P95 < 100ms
});
```

## Conclusion

The Outbox Pattern implementation in the UOOP platform provides:

1. **Reliability**: At-least-once delivery guarantee
2. **Consistency**: Atomic transactions with business logic
3. **Scalability**: Batch processing and parallel execution
4. **Observability**: Comprehensive monitoring and metrics
5. **Fault Tolerance**: Retry logic and dead letter queues
6. **Performance**: Optimized database queries and caching

This pattern is crucial for maintaining data consistency and reliable event delivery in the distributed UOOP architecture, ensuring that all downstream services receive the events they need to maintain their state and provide accurate information to customers. 