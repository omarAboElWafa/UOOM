import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DynamoDBClientService } from './dynamodb-client.service';
import { OrderCacheService } from './order-cache.service';

@Module({
  imports: [ConfigModule],
  providers: [
    DynamoDBClientService,
    OrderCacheService,
  ],
  exports: [
    DynamoDBClientService,
    OrderCacheService,
  ],
})
export class DynamoDBModule {} 