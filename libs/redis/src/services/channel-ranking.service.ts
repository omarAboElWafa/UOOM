import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RedisSortedSetsService, ChannelMetrics, ChannelWeights } from './redis-sorted-sets.service';

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
    private readonly redisSortedSets: RedisSortedSetsService,
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
      // Use Redis sorted sets for optimal channel ranking
      const defaultWeights: ChannelWeights = {
        capacity: 0.25,
        quality: 0.25,
        latency: 0.2,
        cost: 0.15,
        successRate: 0.15,
      };

      const optimalChannels = await this.redisSortedSets.getOptimalChannels(defaultWeights, limit);
      
      const rankings: ChannelRanking[] = [];
      for (let i = 0; i < optimalChannels.length; i++) {
        const channelId = optimalChannels[i];
        const metrics = await this.redisSortedSets.getChannelMetrics(channelId);
        
        if (metrics) {
          rankings.push({
            channelId,
            score: this.calculateScore({
              successRate: metrics.successRate,
              avgDeliveryTime: metrics.avgLatency,
              costEfficiency: metrics.costScore,
              customerSatisfaction: metrics.qualityScore,
            }),
            rank: i + 1,
            lastUpdated: Date.now(),
            metrics: {
              successRate: metrics.successRate,
              avgDeliveryTime: metrics.avgLatency,
              costEfficiency: metrics.costScore,
              customerSatisfaction: metrics.qualityScore,
            },
          });
        }
      }

      this.logger.debug('Top channels retrieved using Redis sorted sets', {
        limit,
        channelCount: rankings.length,
      });

      return rankings;
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

      const costEfficiency = this.calculateCostEfficiency(performance.avgCost);

      // Update Redis sorted sets with new metrics
      const channelMetrics: ChannelMetrics = {
        availableCapacity: 100 - (performance.totalOrders / 100) * 100, // Simplified capacity calculation
        qualityScore: performance.customerRating / 5, // Normalize to 0-1
        avgLatency: performance.avgDeliveryTime,
        costScore: costEfficiency,
        successRate,
      };

      await this.redisSortedSets.updateChannelMetrics(performance.channelId, channelMetrics);

      await this.updateChannelRanking(performance.channelId, {
        successRate,
        avgDeliveryTime: performance.avgDeliveryTime,
        costEfficiency,
        customerSatisfaction: performance.customerRating,
      });

      this.logger.debug('Channel performance updated with Redis sorted sets', {
        channelId: performance.channelId,
        successRate,
        avgDeliveryTime: performance.avgDeliveryTime,
        channelMetrics,
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
      // Dynamic weight calculation based on order characteristics
      const weights = this.calculateDynamicWeights(orderValue, deliveryDistance, priority);
      
      const optimalChannels = await this.redisSortedSets.getOptimalChannels(weights, limit);
      
      // Convert channel IDs to FulfillmentChannel objects
      // In a real implementation, this would fetch from a database
      const channels: FulfillmentChannel[] = optimalChannels.map((channelId, index) => ({
        id: channelId,
        name: `Channel ${channelId}`,
        type: priority === 'express' ? 'express_delivery' : 'standard_delivery',
        capacity: 100,
        currentLoad: Math.floor(Math.random() * 80),
        availableCapacity: 100 - Math.floor(Math.random() * 80),
        costPerOrder: orderValue * 0.1 + deliveryDistance * 0.5,
        qualityScore: 0.8 + Math.random() * 0.2,
        prepTimeMinutes: priority === 'express' ? 15 : 30,
        location: {
          latitude: 25.276987 + (Math.random() - 0.5) * 0.1,
          longitude: 55.296249 + (Math.random() - 0.5) * 0.1,
        },
        vehicleType: priority === 'express' ? 'motorcycle' : 'car',
        maxDistance: priority === 'express' ? 10 : 20,
        isActive: true,
      }));

      this.logger.debug('Recommended channels retrieved using Redis sorted sets', {
        orderValue,
        deliveryDistance,
        priority,
        weights,
        channelCount: channels.length,
      });

      return channels;
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
      // Use Redis sorted sets for real ranking stats
      const stats = await this.redisSortedSets.getRankingStats();
      const topChannels = await this.getTopChannels(10);
      
      const scores = topChannels.map(c => c.score);
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const topScore = scores.length > 0 ? Math.max(...scores) : 0;

      this.logger.debug('Ranking stats retrieved using Redis sorted sets', {
        totalChannels: stats.totalChannels,
        avgScore,
        topScore,
      });

      return {
        totalChannels: stats.totalChannels,
        avgScore: Math.round(avgScore * 100) / 100,
        topScore: Math.round(topScore * 100) / 100,
        lastUpdated: stats.lastUpdated,
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

  private calculateDynamicWeights(orderValue: number, deliveryDistance: number, priority: string): ChannelWeights {
    // Base weights
    let weights: ChannelWeights = {
      capacity: 0.25,
      quality: 0.25,
      latency: 0.2,
      cost: 0.15,
      successRate: 0.15,
    };

    // Adjust weights based on order characteristics
    if (priority === 'express') {
      // Prioritize latency and capacity for express orders
      weights.latency = 0.35;
      weights.capacity = 0.3;
      weights.cost = 0.1;
    } else if (orderValue > 100) {
      // Prioritize quality and success rate for high-value orders
      weights.quality = 0.35;
      weights.successRate = 0.25;
      weights.cost = 0.1;
    } else if (deliveryDistance > 15) {
      // Prioritize cost efficiency for long-distance orders
      weights.cost = 0.3;
      weights.capacity = 0.3;
      weights.latency = 0.15;
    }

    return weights;
  }
} 