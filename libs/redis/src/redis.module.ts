import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ChannelRankingService } from './services/channel-ranking.service';
import { RedisHealthIndicator } from './health/redis-health.indicator';
import { RedisClientService } from './services/redis-client.service';
import { RedisSortedSetsService } from './services/redis-sorted-sets.service';

@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        store: 'redis',
        host: configService.get('REDIS_CLUSTER_ENDPOINT'),
        port: configService.get('REDIS_PORT', 6379),
        password: configService.get('REDIS_PASSWORD'),
        db: 0,
        ttl: 3600,
        max: 1000,
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [ChannelRankingService, RedisHealthIndicator, RedisClientService, RedisSortedSetsService],
  exports: [ChannelRankingService, RedisHealthIndicator, RedisClientService, RedisSortedSetsService],
})
export class RedisLibModule {} 