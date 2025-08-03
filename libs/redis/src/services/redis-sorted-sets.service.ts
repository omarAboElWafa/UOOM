import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface ChannelMetrics {
  availableCapacity: number;
  qualityScore: number;
  avgLatency: number;
  costScore: number;
  successRate: number;
}

export interface ChannelWeights {
  capacity: number;
  quality: number;
  latency: number;
  cost: number;
  successRate: number;
}

export interface ChannelScoreEntry {
  channelId: string;
  score: number;
}

@Injectable()
export class RedisSortedSetsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisSortedSetsService.name);
  private redis: Redis;
  private readonly keyPrefix = 'uoop:channels';

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
      
      this.redis = new Redis(redisUrl, {
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        reconnectOnError: (err) => {
          this.logger.warn('Redis connection error, attempting reconnect', { error: err.message });
          return true;
        },
      });

      this.redis.on('connect', () => {
        this.logger.log('Redis connected successfully');
      });

      this.redis.on('error', (error) => {
        this.logger.error('Redis connection error', { error: error.message });
      });

      this.redis.on('close', () => {
        this.logger.warn('Redis connection closed');
      });

      await this.redis.connect();
      
      // Test connection
      await this.redis.ping();
      this.logger.log('Redis sorted sets service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Redis connection', { error: error.message });
      throw error;
    }
  }

  private async disconnect(): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.quit();
        this.logger.log('Redis connection closed');
      }
    } catch (error) {
      this.logger.error('Failed to close Redis connection', { error: error.message });
    }
  }

  /**
   * Update channel metrics in Redis sorted sets using pipeline for atomicity
   */
  async updateChannelMetrics(channelId: string, metrics: ChannelMetrics): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      
      // Store metrics in separate sorted sets for efficient querying
      pipeline.zadd(`${this.keyPrefix}:capacity`, metrics.availableCapacity, channelId);
      pipeline.zadd(`${this.keyPrefix}:quality`, metrics.qualityScore, channelId);
      pipeline.zadd(`${this.keyPrefix}:latency`, metrics.avgLatency, channelId);
      pipeline.zadd(`${this.keyPrefix}:cost`, metrics.costScore, channelId);
      pipeline.zadd(`${this.keyPrefix}:success_rate`, metrics.successRate, channelId);
      
      // Store comprehensive metrics as hash for detailed lookup
      pipeline.hset(`${this.keyPrefix}:metrics:${channelId}`, {
        availableCapacity: metrics.availableCapacity,
        qualityScore: metrics.qualityScore,
        avgLatency: metrics.avgLatency,
        costScore: metrics.costScore,
        successRate: metrics.successRate,
        lastUpdated: Date.now(),
      });

      // Set expiration for metrics (24 hours)
      pipeline.expire(`${this.keyPrefix}:metrics:${channelId}`, 86400);

      await pipeline.exec();

      this.logger.debug('Channel metrics updated', {
        channelId,
        metrics,
      });
    } catch (error) {
      this.logger.error('Failed to update channel metrics', {
        channelId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get optimal channels using weighted intersection of sorted sets
   */
  async getOptimalChannels(weights: ChannelWeights, limit: number = 5): Promise<string[]> {
    try {
      // Create temporary key for weighted intersection
      const tempKey = `${this.keyPrefix}:temp:ranking:${Date.now()}:${Math.random()}`;
      
      // Use ZINTERSTORE with dynamic weights for multi-criteria optimization
      const numKeys = 5;
      await this.redis.zinterstore(
        tempKey,
        numKeys,
        `${this.keyPrefix}:capacity`,
        `${this.keyPrefix}:quality`, 
        `${this.keyPrefix}:latency`,
        `${this.keyPrefix}:cost`,
        `${this.keyPrefix}:success_rate`,
        'WEIGHTS',
        weights.capacity,
        weights.quality,
        weights.latency, 
        weights.cost,
        weights.successRate
      );

      // Get top channels (highest scores first)
      const channels = await this.redis.zrevrange(tempKey, 0, limit - 1);
      
      // Clean up temporary key
      await this.redis.del(tempKey);

      this.logger.debug('Optimal channels retrieved', {
        weights,
        limit,
        channelCount: channels.length,
      });

      return channels;
    } catch (error) {
      this.logger.error('Failed to get optimal channels', {
        weights,
        limit,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get top channels by specific metric
   */
  async getTopChannelsByMetric(metric: keyof ChannelMetrics, limit: number = 10): Promise<ChannelScoreEntry[]> {
    try {
      const key = `${this.keyPrefix}:${metric === 'avgLatency' ? 'latency' : 
                   metric === 'availableCapacity' ? 'capacity' :
                   metric === 'qualityScore' ? 'quality' :
                   metric === 'costScore' ? 'cost' : 'success_rate'}`;

      // For latency, lower is better, so use ZRANGE instead of ZREVRANGE
      const isLowerBetter = metric === 'avgLatency';
      const results = isLowerBetter 
        ? await this.redis.zrange(key, 0, limit - 1, 'WITHSCORES')
        : await this.redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');

      const channels: ChannelScoreEntry[] = [];
      for (let i = 0; i < results.length; i += 2) {
        channels.push({
          channelId: results[i],
          score: parseFloat(results[i + 1]),
        });
      }

      this.logger.debug('Top channels by metric retrieved', {
        metric,
        limit,
        channelCount: channels.length,
      });

      return channels;
    } catch (error) {
      this.logger.error('Failed to get top channels by metric', {
        metric,
        limit,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get channel metrics by ID
   */
  async getChannelMetrics(channelId: string): Promise<ChannelMetrics | null> {
    try {
      const metrics = await this.redis.hgetall(`${this.keyPrefix}:metrics:${channelId}`);
      
      if (!metrics || Object.keys(metrics).length === 0) {
        return null;
      }

      return {
        availableCapacity: parseFloat(metrics.availableCapacity) || 0,
        qualityScore: parseFloat(metrics.qualityScore) || 0,
        avgLatency: parseFloat(metrics.avgLatency) || 0,
        costScore: parseFloat(metrics.costScore) || 0,
        successRate: parseFloat(metrics.successRate) || 0,
      };
    } catch (error) {
      this.logger.error('Failed to get channel metrics', {
        channelId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Remove channel from all sorted sets
   */
  async removeChannel(channelId: string): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      
      // Remove from all sorted sets
      pipeline.zrem(`${this.keyPrefix}:capacity`, channelId);
      pipeline.zrem(`${this.keyPrefix}:quality`, channelId);
      pipeline.zrem(`${this.keyPrefix}:latency`, channelId);
      pipeline.zrem(`${this.keyPrefix}:cost`, channelId);
      pipeline.zrem(`${this.keyPrefix}:success_rate`, channelId);
      
      // Remove metrics hash
      pipeline.del(`${this.keyPrefix}:metrics:${channelId}`);

      await pipeline.exec();

      this.logger.debug('Channel removed from sorted sets', { channelId });
    } catch (error) {
      this.logger.error('Failed to remove channel', {
        channelId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get ranking statistics
   */
  async getRankingStats(): Promise<{
    totalChannels: number;
    metricsCount: { [key: string]: number };
    lastUpdated: number;
  }> {
    try {
      const pipeline = this.redis.pipeline();
      
      pipeline.zcard(`${this.keyPrefix}:capacity`);
      pipeline.zcard(`${this.keyPrefix}:quality`);
      pipeline.zcard(`${this.keyPrefix}:latency`);
      pipeline.zcard(`${this.keyPrefix}:cost`);
      pipeline.zcard(`${this.keyPrefix}:success_rate`);

      const results = await pipeline.exec();
      
      return {
        totalChannels: Math.max(...results.map(([err, result]) => result as number)),
        metricsCount: {
          capacity: results[0][1] as number,
          quality: results[1][1] as number,
          latency: results[2][1] as number,
          cost: results[3][1] as number,
          successRate: results[4][1] as number,
        },
        lastUpdated: Date.now(),
      };
    } catch (error) {
      this.logger.error('Failed to get ranking stats', { error: error.message });
      return {
        totalChannels: 0,
        metricsCount: {},
        lastUpdated: Date.now(),
      };
    }
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<{ status: string; latency: number }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency,
      };
    } catch (error) {
      this.logger.error('Redis health check failed', { error: error.message });
      return {
        status: 'unhealthy',
        latency: -1,
      };
    }
  }
} 