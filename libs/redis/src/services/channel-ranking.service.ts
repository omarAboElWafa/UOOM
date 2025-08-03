import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

// Define FulfillmentChannel interface locally since it's not exported from shared
export interface FulfillmentChannel {
  id: string;
  name: string;
  type: string;
  capacity: number;
  currentLoad: number;
  availableCapacity: number;
  costPerOrder: number;
  qualityScore: number;
  prepTimeMinutes: number;
  location: {
    latitude: number;
    longitude: number;
  };
  vehicleType: string;
  maxDistance: number;
  isActive: boolean;
}

export interface ChannelRanking {
  channelId: string;
  score: number;
  rank: number;
  lastUpdated: number;
  metrics: {
    successRate: number;
    avgDeliveryTime: number;
    costEfficiency: number;
    customerSatisfaction: number;
  };
}

export interface ChannelPerformance {
  channelId: string;
  totalOrders: number;
  successfulOrders: number;
  failedOrders: number;
  avgDeliveryTime: number;
  avgCost: number;
  customerRating: number;
  lastActivity: number;
}

@Injectable()
export class ChannelRankingService {
  private readonly logger = new Logger(ChannelRankingService.name);
  private readonly CHANNEL_RANKING_KEY = 'channel:ranking';
  private readonly CHANNEL_PERFORMANCE_KEY = 'channel:performance';
  private readonly CHANNEL_CACHE_TTL = 3600; // 1 hour

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async updateChannelRanking(channelId: string, metrics: Partial<ChannelRanking['metrics']>): Promise<void> {
    try {
      const key = `${this.CHANNEL_RANKING_KEY}:${channelId}`;
      const timestamp = Date.now();
      
      // Get existing ranking data
      const existing = await this.cacheManager.get<ChannelRanking>(key);
      
      // Calculate new score based on metrics
      const score = this.calculateScore(metrics);
      
      const rankingData: ChannelRanking = {
        channelId,
        score,
        rank: 0, // Will be updated by recalculateRankings
        lastUpdated: timestamp,
        metrics: {
          successRate: metrics.successRate ?? existing?.metrics?.successRate ?? 0,
          avgDeliveryTime: metrics.avgDeliveryTime ?? existing?.metrics?.avgDeliveryTime ?? 0,
          costEfficiency: metrics.costEfficiency ?? existing?.metrics?.costEfficiency ?? 0,
          customerSatisfaction: metrics.customerSatisfaction ?? existing?.metrics?.customerSatisfaction ?? 0,
        },
      };

      // Store ranking data
      await this.cacheManager.set(key, rankingData, this.CHANNEL_CACHE_TTL * 1000);

      this.logger.debug('Channel ranking updated', {
        channelId,
        score,
        metrics: rankingData.metrics,
      });
    } catch (error) {
      this.logger.error('Failed to update channel ranking', {
        channelId,
        error: error.message,
      });
      throw error;
    }
  }

  async getChannelRanking(channelId: string): Promise<ChannelRanking | null> {
    try {
      const key = `${this.CHANNEL_RANKING_KEY}:${channelId}`;
      const ranking = await this.cacheManager.get<ChannelRanking>(key);
      
      if (!ranking) {
        return null;
      }

      return ranking;
    } catch (error) {
      this.logger.error('Failed to get channel ranking', {
        channelId,
        error: error.message,
      });
      return null;
    }
  }

  async getTopChannels(limit: number = 10): Promise<ChannelRanking[]> {
    try {
      // Note: Cache manager doesn't support sorted sets like Redis
      // This is a simplified implementation that would need to be enhanced
      // for production use with a proper Redis implementation
      
      this.logger.warn('getTopChannels is simplified - requires Redis implementation for full functionality');
      
      return [];
    } catch (error) {
      this.logger.error('Failed to get top channels', {
        limit,
        error: error.message,
      });
      return [];
    }
  }

  async updateChannelPerformance(performance: ChannelPerformance): Promise<void> {
    try {
      const key = `${this.CHANNEL_PERFORMANCE_KEY}:${performance.channelId}`;
      
      await this.cacheManager.set(key, performance, this.CHANNEL_CACHE_TTL * 1000);

      // Update ranking metrics based on performance
      const successRate = performance.totalOrders > 0 
        ? performance.successfulOrders / performance.totalOrders 
        : 0;

      await this.updateChannelRanking(performance.channelId, {
        successRate,
        avgDeliveryTime: performance.avgDeliveryTime,
        costEfficiency: this.calculateCostEfficiency(performance.avgCost),
        customerSatisfaction: performance.customerRating,
      });

      this.logger.debug('Channel performance updated', {
        channelId: performance.channelId,
        successRate,
        avgDeliveryTime: performance.avgDeliveryTime,
      });
    } catch (error) {
      this.logger.error('Failed to update channel performance', {
        channelId: performance.channelId,
        error: error.message,
      });
      throw error;
    }
  }

  async getChannelPerformance(channelId: string): Promise<ChannelPerformance | null> {
    try {
      const key = `${this.CHANNEL_PERFORMANCE_KEY}:${channelId}`;
      return await this.cacheManager.get<ChannelPerformance>(key) || null;
    } catch (error) {
      this.logger.error('Failed to get channel performance', {
        channelId,
        error: error.message,
      });
      return null;
    }
  }

  async getRecommendedChannels(
    orderValue: number,
    deliveryDistance: number,
    priority: string,
    limit: number = 5
  ): Promise<FulfillmentChannel[]> {
    try {
      // Simplified implementation - would need Redis for full functionality
      this.logger.warn('getRecommendedChannels is simplified - requires Redis implementation for full functionality');
      
      return [];
    } catch (error) {
      this.logger.error('Failed to get recommended channels', {
        orderValue,
        deliveryDistance,
        priority,
        error: error.message,
      });
      return [];
    }
  }

  async clearChannelData(channelId: string): Promise<void> {
    try {
      const rankingKey = `${this.CHANNEL_RANKING_KEY}:${channelId}`;
      const performanceKey = `${this.CHANNEL_PERFORMANCE_KEY}:${channelId}`;
      
      await Promise.all([
        this.cacheManager.del(rankingKey),
        this.cacheManager.del(performanceKey),
      ]);

      this.logger.debug('Channel data cleared', { channelId });
    } catch (error) {
      this.logger.error('Failed to clear channel data', {
        channelId,
        error: error.message,
      });
      throw error;
    }
  }

  async getRankingStats(): Promise<{
    totalChannels: number;
    avgScore: number;
    topScore: number;
    lastUpdated: number;
  }> {
    try {
      // Simplified implementation - would need Redis for full functionality
      this.logger.warn('getRankingStats is simplified - requires Redis implementation for full functionality');
      
      return {
        totalChannels: 0,
        avgScore: 0,
        topScore: 0,
        lastUpdated: Date.now(),
      };
    } catch (error) {
      this.logger.error('Failed to get ranking stats', { error: error.message });
      return {
        totalChannels: 0,
        avgScore: 0,
        topScore: 0,
        lastUpdated: Date.now(),
      };
    }
  }

  private calculateScore(metrics: Partial<ChannelRanking['metrics']>): number {
    const {
      successRate = 0,
      avgDeliveryTime = 0,
      costEfficiency = 0,
      customerSatisfaction = 0,
    } = metrics;

    // Weighted scoring algorithm
    const weights = {
      successRate: 0.3,
      deliveryTime: 0.25,
      costEfficiency: 0.25,
      customerSatisfaction: 0.2,
    };

    // Normalize delivery time (lower is better)
    const normalizedDeliveryTime = Math.max(0, 1 - (avgDeliveryTime / 60));

    const score = (
      successRate * weights.successRate +
      normalizedDeliveryTime * weights.deliveryTime +
      costEfficiency * weights.costEfficiency +
      (customerSatisfaction / 5) * weights.customerSatisfaction
    ) * 100;

    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }

  private calculateCostEfficiency(avgCost: number): number {
    // Normalize cost efficiency (lower cost is better)
    // Assuming average cost is around $10, scale accordingly
    return Math.max(0, 1 - (avgCost / 15));
  }
} 