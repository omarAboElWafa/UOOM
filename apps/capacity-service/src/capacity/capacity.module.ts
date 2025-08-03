import { Module } from '@nestjs/common';
import { CapacityController } from './capacity.controller';
import { CapacityService } from './capacity.service';
import { ChannelTrackingService } from './channel-tracking.service';

@Module({
  controllers: [CapacityController],
  providers: [CapacityService, ChannelTrackingService],
  exports: [CapacityService, ChannelTrackingService],
})
export class CapacityModule {} 