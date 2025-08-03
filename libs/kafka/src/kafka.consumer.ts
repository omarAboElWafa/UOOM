import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, EachMessagePayload, KafkaMessage as KafkaJSMessage } from 'kafkajs';
import { KafkaClientService } from './kafka.client';

export interface MessageHandler {
  handle(payload: EachMessagePayload): Promise<void>;
}

export interface ConsumerConfig {
  topics: string[];
  groupId?: string;
  fromBeginning?: boolean;
  autoCommit?: boolean;
  autoCommitInterval?: number;
}

@Injectable()
export class KafkaConsumerService {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly consumer: Consumer;
  private readonly messageHandlers = new Map<string, MessageHandler>();
  private isRunning = false;

  constructor(
    private readonly kafkaClient: KafkaClientService,
    private readonly configService: ConfigService,
  ) {
    this.consumer = this.kafkaClient.getConsumer();
  }

  async subscribe(config: ConsumerConfig): Promise<void> {
    try {
      await this.consumer.connect();
      
      for (const topic of config.topics) {
        await this.consumer.subscribe({
          topic,
          fromBeginning: config.fromBeginning ?? false,
        });
      }

      this.logger.log(`Subscribed to topics: ${config.topics.join(', ')}`);
    } catch (error) {
      this.logger.error('Failed to subscribe to topics', error);
      throw error;
    }
  }

  async startConsuming(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Consumer is already running');
      return;
    }

    try {
      await this.consumer.run({
        autoCommit: true,
        autoCommitInterval: 5000,
        eachMessage: async (payload: EachMessagePayload) => {
          await this.processMessage(payload);
        },
      });

      this.isRunning = true;
      this.logger.log('Consumer started successfully');
    } catch (error) {
      this.logger.error('Failed to start consumer', error);
      throw error;
    }
  }

  async stopConsuming(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.consumer.disconnect();
      this.isRunning = false;
      this.logger.log('Consumer stopped successfully');
    } catch (error) {
      this.logger.error('Failed to stop consumer', error);
      throw error;
    }
  }

  registerMessageHandler(topic: string, handler: MessageHandler): void {
    this.messageHandlers.set(topic, handler);
    this.logger.log(`Registered message handler for topic: ${topic}`);
  }

  private async processMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    
    try {
      const handler = this.messageHandlers.get(topic);
      
      if (!handler) {
        this.logger.warn(`No handler registered for topic: ${topic}`);
        return;
      }

      const startTime = Date.now();
      
      await handler.handle(payload);
      
      const processingTime = Date.now() - startTime;
      
      this.logger.log(`Message processed successfully`, {
        topic,
        partition,
        offset: message.offset,
        processingTime,
        key: message.key?.toString(),
      });
    } catch (error) {
      this.logger.error(`Failed to process message`, {
        topic,
        partition,
        offset: message.offset,
        error: error.message,
        key: message.key?.toString(),
      });

      // Depending on the error handling strategy, you might want to:
      // 1. Retry the message
      // 2. Send to a dead letter queue
      // 3. Skip and continue
      // For now, we'll log and continue to avoid blocking the consumer
    }
  }

  async commitOffsets(): Promise<void> {
    try {
      await this.consumer.commitOffsets([]);
      this.logger.debug('Offsets committed successfully');
    } catch (error) {
      this.logger.error('Failed to commit offsets', error);
      throw error;
    }
  }

  async seekToOffset(topic: string, partition: number, offset: string): Promise<void> {
    try {
      await this.consumer.seek({ topic, partition, offset });
      this.logger.log(`Seeked to offset`, { topic, partition, offset });
    } catch (error) {
      this.logger.error('Failed to seek to offset', error);
      throw error;
    }
  }

  isConsumerRunning(): boolean {
    return this.isRunning;
  }

  async getConsumerMetrics() {
    // Note: kafkajs doesn't expose detailed metrics by default
    // This would require custom instrumentation or integration with monitoring tools
    return {
      isRunning: this.isRunning,
      messagesConsumed: 0, // Would need custom counter
      errors: 0, // Would need custom counter
      lag: 0, // Would need custom calculation
    };
  }
} 