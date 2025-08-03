import { Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { CreateOrderDto } from '../order/dto/create-order.dto';

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getTopChannels(orderDto: CreateOrderDto): Promise<string[]> {
    const startTime = Date.now();
    
    try {
      // Generate cache key based on order characteristics
      const cacheKey = this.generateCacheKey(orderDto);
      
      // Try to get from cache first
      const cachedChannels = await this.cacheManager.get<string[]>(cacheKey);
      if (cachedChannels) {
        this.logger.debug(`Retrieved channels from cache`, {
          orderId: orderDto.customerId,
          channelCount: cachedChannels.length,
        });
        return cachedChannels;
      }

      // Simulate Redis sorted set query for top channels
      // In production, this would query Redis with ZREVRANGE
      const topChannels = await this.queryTopChannels(orderDto);
      
      // Cache the result for 5 minutes
      await this.cacheManager.set(cacheKey, topChannels, 300);
      
      const processingTime = Date.now() - startTime;
      this.logger.log(`Retrieved ${topChannels.length} top channels in ${processingTime}ms`, {
        orderId: orderDto.customerId,
        processingTime,
      });

      return topChannels;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Failed to get top channels: ${error.message}`, {
        orderId: orderDto.customerId,
        processingTime,
        error,
      });
      
      // Return fallback channels
      return ['channel-1', 'channel-2', 'channel-3'];
    }
  }

  private generateCacheKey(orderDto: CreateOrderDto): string {
    const location = orderDto.deliveryLocation;
    const locationKey = `${location.latitude.toFixed(2)}_${location.longitude.toFixed(2)}`;
    const priority = orderDto.priority || 'NORMAL';
    
    return `channels:${locationKey}:${priority}`;
  }

  private async queryTopChannels(orderDto: CreateOrderDto): Promise<string[]> {
    // Simulate Redis sorted set query
    // In production, this would use Redis client to query ZREVRANGE
    const mockChannels = [
      { id: 'channel-1', score: 95 },
      { id: 'channel-2', score: 87 },
      { id: 'channel-3', score: 82 },
      { id: 'channel-4', score: 78 },
      { id: 'channel-5', score: 75 },
    ];

    // Sort by score and return top 3
    return mockChannels
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(channel => channel.id);
  }

  async updateChannelScore(channelId: string, score: number): Promise<void> {
    try {
      // In production, this would update Redis sorted set
      this.logger.debug(`Updated channel score`, {
        channelId,
        score,
      });
    } catch (error) {
      this.logger.error(`Failed to update channel score: ${error.message}`, {
        channelId,
        score,
        error,
      });
    }
  }

  async getChannelMetrics(): Promise<any> {
    try {
      // In production, this would return Redis metrics
      return {
        totalChannels: 5,
        averageScore: 85,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get channel metrics: ${error.message}`);
      return null;
    }
  }
} 