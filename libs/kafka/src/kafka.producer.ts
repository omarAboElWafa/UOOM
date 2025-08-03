import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Producer, ProducerRecord, RecordMetadata } from 'kafkajs';
import { KafkaClientService } from './kafka.client';

export interface KafkaMessage {
  topic: string;
  key?: string;
  value: string;
  headers?: Record<string, string>;
  partition?: number;
}

export interface PublishResult {
  success: boolean;
  metadata?: RecordMetadata[];
  error?: Error;
  retryCount: number;
}

@Injectable()
export class KafkaProducerService {
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly producer: Producer;
  private readonly maxRetries: number;
  private readonly deadLetterTopic: string;

  constructor(
    private readonly kafkaClient: KafkaClientService,
    private readonly configService: ConfigService,
  ) {
    this.producer = this.kafkaClient.getProducer();
    this.maxRetries = this.configService.get('KAFKA_MAX_RETRIES', 3);
    this.deadLetterTopic = this.configService.get('KAFKA_DEAD_LETTER_TOPIC', 'dead-letter-queue');
  }

  async publishMessage(message: KafkaMessage, retryCount = 0): Promise<PublishResult> {
    try {
      const producerRecord: ProducerRecord = {
        topic: message.topic,
        messages: [{
          key: message.key,
          value: message.value,
          headers: {
            ...message.headers,
            'retry-count': retryCount.toString(),
            'timestamp': new Date().toISOString(),
          },
          partition: message.partition,
        }],
      };

      const metadata = await this.producer.send(producerRecord);
      
      this.logger.log(`Successfully published message to topic: ${message.topic}`, {
        topic: message.topic,
        key: message.key,
        partition: metadata[0]?.partition,
        offset: metadata[0]?.offset,
        retryCount,
      });

      return {
        success: true,
        metadata,
        retryCount,
      };
    } catch (error) {
      this.logger.error(`Failed to publish message to topic: ${message.topic}`, {
        error: error.message,
        topic: message.topic,
        key: message.key,
        retryCount,
      });

      if (retryCount < this.maxRetries) {
        const delay = this.calculateBackoffDelay(retryCount);
        this.logger.log(`Retrying message publish in ${delay}ms`, {
          topic: message.topic,
          retryCount: retryCount + 1,
        });

        await this.sleep(delay);
        return this.publishMessage(message, retryCount + 1);
      } else {
        // Send to dead letter queue
        await this.sendToDeadLetterQueue(message, error, retryCount);
        
        return {
          success: false,
          error,
          retryCount,
        };
      }
    }
  }

  async publishBatch(messages: KafkaMessage[]): Promise<PublishResult[]> {
    const results: PublishResult[] = [];
    
    // Group messages by topic for more efficient publishing
    const messagesByTopic = messages.reduce((acc, message) => {
      if (!acc[message.topic]) {
        acc[message.topic] = [];
      }
      acc[message.topic].push(message);
      return acc;
    }, {} as Record<string, KafkaMessage[]>);

    // Publish messages topic by topic
    for (const [topic, topicMessages] of Object.entries(messagesByTopic)) {
      try {
        const producerRecord: ProducerRecord = {
          topic,
          messages: topicMessages.map(msg => ({
            key: msg.key,
            value: msg.value,
            headers: {
              ...msg.headers,
              'timestamp': new Date().toISOString(),
            },
            partition: msg.partition,
          })),
        };

        const metadata = await this.producer.send(producerRecord);
        
        // Create success results for all messages in this topic
        topicMessages.forEach((_, index) => {
          results.push({
            success: true,
            metadata: [metadata[index]],
            retryCount: 0,
          });
        });

        this.logger.log(`Successfully published batch to topic: ${topic}`, {
          topic,
          messageCount: topicMessages.length,
        });
      } catch (error) {
        this.logger.error(`Failed to publish batch to topic: ${topic}`, {
          error: error.message,
          topic,
          messageCount: topicMessages.length,
        });

        // Create failure results for all messages in this topic
        topicMessages.forEach(() => {
          results.push({
            success: false,
            error,
            retryCount: 0,
          });
        });

        // Send all failed messages to DLQ
        for (const message of topicMessages) {
          await this.sendToDeadLetterQueue(message, error, 0);
        }
      }
    }

    return results;
  }

  private async sendToDeadLetterQueue(
    originalMessage: KafkaMessage,
    error: Error,
    retryCount: number,
  ): Promise<void> {
    try {
      const dlqMessage = {
        topic: this.deadLetterTopic,
        key: originalMessage.key,
        value: JSON.stringify({
          originalTopic: originalMessage.topic,
          originalMessage: {
            key: originalMessage.key,
            value: originalMessage.value,
            headers: originalMessage.headers,
          },
          error: {
            message: error.message,
            stack: error.stack,
          },
          retryCount,
          failedAt: new Date().toISOString(),
        }),
        headers: {
          'original-topic': originalMessage.topic,
          'failed-at': new Date().toISOString(),
          'retry-count': retryCount.toString(),
        },
      };

      await this.producer.send({
        topic: this.deadLetterTopic,
        messages: [{
          key: dlqMessage.key,
          value: dlqMessage.value,
          headers: dlqMessage.headers,
        }],
      });

      this.logger.warn(`Sent message to dead letter queue`, {
        originalTopic: originalMessage.topic,
        key: originalMessage.key,
        retryCount,
      });
    } catch (dlqError) {
      this.logger.error(`Failed to send message to dead letter queue`, {
        originalTopic: originalMessage.topic,
        dlqError: dlqError.message,
        originalError: error.message,
      });
    }
  }

  private calculateBackoffDelay(retryCount: number): number {
    // Exponential backoff with jitter
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
    
    // Add jitter (±20%)
    const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5) * 2;
    return Math.round(exponentialDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getProducerMetrics() {
    // Note: kafkajs doesn't expose detailed metrics by default
    // This would require custom instrumentation or integration with monitoring tools
    return {
      isConnected: true, // We could track this state
      messagesProduced: 0, // Would need custom counter
      errors: 0, // Would need custom counter
    };
  }
} 