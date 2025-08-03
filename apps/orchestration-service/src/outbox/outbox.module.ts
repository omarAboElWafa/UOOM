import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { OutboxService } from './outbox.service';
import { OutboxProcessor } from './outbox.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxEvent]),
    BullModule.registerQueue({ name: 'outbox' }),
  ],
  providers: [OutboxService, OutboxProcessor],
  exports: [OutboxService],
})
export class OutboxModule {} 