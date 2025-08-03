import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaClientService } from './kafka.client';
import { KafkaProducerService } from './kafka.producer';
import { KafkaConsumerService } from './kafka.consumer';

@Module({
  imports: [ConfigModule],
  providers: [
    KafkaClientService,
    KafkaProducerService,
    KafkaConsumerService,
  ],
  exports: [
    KafkaClientService,
    KafkaProducerService,
    KafkaConsumerService,
  ],
})
export class KafkaModule {} 