import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, KafkaConfig, Consumer, Producer } from 'kafkajs';

@Injectable()
export class KafkaClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaClientService.name);
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;

  constructor(private readonly configService: ConfigService) {
    const kafkaConfig: KafkaConfig = {
      clientId: this.configService.get('KAFKA_CLIENT_ID', 'uoom-platform'),
      brokers: this.configService.get('KAFKA_BROKERS', 'localhost:9092').split(','),
      retry: {
        initialRetryTime: 300,
        retries: 5,
        maxRetryTime: 30000,
        factor: 2,
      },
      connectionTimeout: 10000,
      requestTimeout: 30000,
    };

    this.kafka = new Kafka(kafkaConfig);
    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
    });

    this.consumer = this.kafka.consumer({
      groupId: this.configService.get('KAFKA_CONSUMER_GROUP_ID', 'outbox-relay-service'),
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
      this.logger.log('Kafka producer connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect Kafka producer', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await Promise.all([
        this.producer.disconnect(),
        this.consumer.disconnect(),
      ]);
      this.logger.log('Kafka client disconnected successfully');
    } catch (error) {
      this.logger.error('Error disconnecting Kafka client', error);
    }
  }

  getProducer(): Producer {
    return this.producer;
  }

  getConsumer(): Consumer {
    return this.consumer;
  }

  getKafka(): Kafka {
    return this.kafka;
  }

  async createTopicsIfNotExist(topics: string[]): Promise<void> {
    const admin = this.kafka.admin();
    
    try {
      await admin.connect();
      
      const existingTopics = await admin.listTopics();
      const topicsToCreate = topics.filter(topic => !existingTopics.includes(topic));
      
      if (topicsToCreate.length > 0) {
        await admin.createTopics({
          topics: topicsToCreate.map(topic => ({
            topic,
            numPartitions: 3,
            replicationFactor: 1,
            configEntries: [
              { name: 'cleanup.policy', value: 'delete' },
              { name: 'retention.ms', value: '604800000' }, // 7 days
            ],
          })),
        });
        
        this.logger.log(`Created topics: ${topicsToCreate.join(', ')}`);
      }
    } catch (error) {
      this.logger.error('Failed to create topics', error);
      throw error;
    } finally {
      await admin.disconnect();
    }
  }
} 