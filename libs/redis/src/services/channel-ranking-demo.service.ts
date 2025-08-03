import { Injectable, Logger } from '@nestjs/common';
import { RedisSortedSetsService, ChannelMetrics, ChannelWeights } from './redis-sorted-sets.service';
import { ChannelRankingService } from './channel-ranking.service';

@Injectable()
export class ChannelRankingDemoService {
  private readonly logger = new Logger(ChannelRankingDemoService.name);

  constructor(
    private readonly redisSortedSets: RedisSortedSetsService,
    private readonly channelRanking: ChannelRankingService,
  ) {}

  /**
   * Demo: Populate Redis with sample channel data
   */
  async populateSampleData(): Promise<void> {
    try {
      const sampleChannels = [
        {
          channelId: 'channel-001',
          metrics: { availableCapacity: 85, qualityScore: 0.92, avgLatency: 18, costScore: 0.78, successRate: 0.95 }
        },
        {
          channelId: 'channel-002', 
          metrics: { availableCapacity: 92, qualityScore: 0.88, avgLatency: 15, costScore: 0.85, successRate: 0.97 }
        },
        {
          channelId: 'channel-003',
          metrics: { availableCapacity: 67, qualityScore: 0.95, avgLatency: 25, costScore: 0.72, successRate: 0.89 }
        },
        {
          channelId: 'channel-004',
          metrics: { availableCapacity: 78, qualityScore: 0.83, avgLatency: 20, costScore: 0.90, successRate: 0.93 }
        },
        {
          channelId: 'channel-005',
          metrics: { availableCapacity: 95, qualityScore: 0.91, avgLatency: 12, costScore: 0.65, successRate: 0.98 }
        },
      ];

      for (const { channelId, metrics } of sampleChannels) {
        await this.redisSortedSets.updateChannelMetrics(channelId, metrics);
      }

      this.logger.log('Sample channel data populated successfully');
    } catch (error) {
      this.logger.error('Failed to populate sample data', { error: error.message });
      throw error;
    }
  }

  /**
   * Demo: Show different ranking scenarios
   */
  async demonstrateRankingScenarios(): Promise<{
    expressDelivery: string[];
    highValueOrder: string[];
    longDistanceDelivery: string[];
    balanced: string[];
  }> {
    try {
      // Express delivery scenario (prioritize latency and capacity)
      const expressWeights: ChannelWeights = {
        capacity: 0.35,
        quality: 0.15,
        latency: 0.35,
        cost: 0.05,
        successRate: 0.1,
      };

      // High-value order scenario (prioritize quality and success rate)
      const highValueWeights: ChannelWeights = {
        capacity: 0.15,
        quality: 0.4,
        latency: 0.15,
        cost: 0.05,
        successRate: 0.25,
      };

      // Long-distance delivery scenario (prioritize cost and capacity)
      const longDistanceWeights: ChannelWeights = {
        capacity: 0.35,
        quality: 0.15,
        latency: 0.15,
        cost: 0.3,
        successRate: 0.05,
      };

      // Balanced scenario
      const balancedWeights: ChannelWeights = {
        capacity: 0.25,
        quality: 0.25,
        latency: 0.2,
        cost: 0.15,
        successRate: 0.15,
      };

      const [expressChannels, highValueChannels, longDistanceChannels, balancedChannels] = await Promise.all([
        this.redisSortedSets.getOptimalChannels(expressWeights, 3),
        this.redisSortedSets.getOptimalChannels(highValueWeights, 3),
        this.redisSortedSets.getOptimalChannels(longDistanceWeights, 3),
        this.redisSortedSets.getOptimalChannels(balancedWeights, 3),
      ]);

      const result = {
        expressDelivery: expressChannels,
        highValueOrder: highValueChannels,
        longDistanceDelivery: longDistanceChannels,
        balanced: balancedChannels,
      };

      this.logger.log('Ranking scenarios demonstrated', result);
      return result;
    } catch (error) {
      this.logger.error('Failed to demonstrate ranking scenarios', { error: error.message });
      throw error;
    }
  }

  /**
   * Demo: Show top channels by specific metrics
   */
  async demonstrateMetricRankings(): Promise<{
    topByCapacity: any[];
    topByQuality: any[];
    topByLatency: any[];
    topByCost: any[];
    topBySuccessRate: any[];
  }> {
    try {
      const [capacity, quality, latency, cost, successRate] = await Promise.all([
        this.redisSortedSets.getTopChannelsByMetric('availableCapacity', 3),
        this.redisSortedSets.getTopChannelsByMetric('qualityScore', 3),
        this.redisSortedSets.getTopChannelsByMetric('avgLatency', 3),
        this.redisSortedSets.getTopChannelsByMetric('costScore', 3),
        this.redisSortedSets.getTopChannelsByMetric('successRate', 3),
      ]);

      const result = {
        topByCapacity: capacity,
        topByQuality: quality,
        topByLatency: latency, // Lower is better for latency
        topByCost: cost,
        topBySuccessRate: successRate,
      };

      this.logger.log('Metric rankings demonstrated', result);
      return result;
    } catch (error) {
      this.logger.error('Failed to demonstrate metric rankings', { error: error.message });
      throw error;
    }
  }

  /**
   * Demo: Get comprehensive stats
   */
  async getComprehensiveStats(): Promise<{
    redisStats: any;
    rankingStats: any;
    topChannels: any[];
  }> {
    try {
      const [redisStats, rankingStats, topChannels] = await Promise.all([
        this.redisSortedSets.getRankingStats(),
        this.channelRanking.getRankingStats(),
        this.channelRanking.getTopChannels(5),
      ]);

      const result = {
        redisStats,
        rankingStats,
        topChannels,
      };

      this.logger.log('Comprehensive stats retrieved', result);
      return result;
    } catch (error) {
      this.logger.error('Failed to get comprehensive stats', { error: error.message });
      throw error;
    }
  }
} 