import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { RoutingService } from './routing.service';

@Module({
  imports: [
    CacheModule.register({
      ttl: 300, // 5 minutes
      max: 1000,
    }),
  ],
  providers: [RoutingService],
  exports: [RoutingService],
})
export class RoutingModule {} 