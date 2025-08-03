import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

import { Order } from '../entities/order.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { DynamoDBModule } from '@calo/database';

import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OptimizationService } from './optimization.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OutboxEvent]),
    BullModule.registerQueue({
      name: 'optimization',
    }),
    DynamoDBModule, // Add DynamoDB module for order caching
  ],
  controllers: [OrderController],
  providers: [
    OrderService,
    OptimizationService,
  ],
  exports: [OrderService],
})
export class OrderModule {} 