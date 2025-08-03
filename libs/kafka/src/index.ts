// Kafka module
export * from './kafka.module';

// Kafka services
export * from './kafka.client';
export * from './kafka.producer';
export * from './kafka.consumer';

// Types and interfaces
export { KafkaMessage, PublishResult } from './kafka.producer';
export { MessageHandler, ConsumerConfig } from './kafka.consumer'; 