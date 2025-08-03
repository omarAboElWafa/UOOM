import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private metrics = new Map<string, number>();

  async getPrometheusMetrics(): Promise<string> {
    const timestamp = Date.now();
    
    // Simulate capacity metrics
    const totalCapacity = 1000;
    const usedCapacity = Math.floor(Math.random() * 800) + 100;
    const availableCapacity = totalCapacity - usedCapacity;
    
    const channelCount = 25;
    const activeChannels = Math.floor(Math.random() * 5) + 20;
    
    return [
      '# HELP capacity_total Total system capacity',
      '# TYPE capacity_total gauge',
      `capacity_total ${totalCapacity} ${timestamp}`,
      '',
      '# HELP capacity_used Currently used capacity',
      '# TYPE capacity_used gauge', 
      `capacity_used ${usedCapacity} ${timestamp}`,
      '',
      '# HELP capacity_available Available capacity',
      '# TYPE capacity_available gauge',
      `capacity_available ${availableCapacity} ${timestamp}`,
      '',
      '# HELP channels_total Total number of channels',
      '# TYPE channels_total gauge',
      `channels_total ${channelCount} ${timestamp}`,
      '',
      '# HELP channels_active Number of active channels',
      '# TYPE channels_active gauge',
      `channels_active ${activeChannels} ${timestamp}`,
      '',
      '# HELP capacity_utilization_percent Capacity utilization percentage',
      '# TYPE capacity_utilization_percent gauge',
      `capacity_utilization_percent ${(usedCapacity / totalCapacity * 100).toFixed(2)} ${timestamp}`,
      '',
    ].join('\n');
  }

  async getCapacityMetrics() {
    const totalCapacity = 1000;
    const usedCapacity = Math.floor(Math.random() * 800) + 100;
    
    return {
      totalCapacity,
      usedCapacity,
      availableCapacity: totalCapacity - usedCapacity,
      utilizationPercent: (usedCapacity / totalCapacity * 100).toFixed(2),
      timestamp: new Date().toISOString(),
    };
  }

  async getChannelMetrics() {
    const channels = [];
    for (let i = 1; i <= 25; i++) {
      channels.push({
        channelId: `channel-${i}`,
        isActive: Math.random() > 0.2,
        capacity: 50,
        currentLoad: Math.floor(Math.random() * 45),
        utilizationPercent: Math.floor(Math.random() * 90),
        avgResponseTime: Math.floor(Math.random() * 200) + 50,
        successRate: (Math.random() * 0.2 + 0.8).toFixed(3),
      });
    }
    
    return {
      channels,
      summary: {
        totalChannels: channels.length,
        activeChannels: channels.filter(c => c.isActive).length,
        avgUtilization: (channels.reduce((sum, c) => sum + c.utilizationPercent, 0) / channels.length).toFixed(2),
        avgResponseTime: (channels.reduce((sum, c) => sum + c.avgResponseTime, 0) / channels.length).toFixed(0),
      },
      timestamp: new Date().toISOString(),
    };
  }

  incrementCounter(name: string, value = 1) {
    const current = this.metrics.get(name) || 0;
    this.metrics.set(name, current + value);
  }

  setGauge(name: string, value: number) {
    this.metrics.set(name, value);
  }

  getMetric(name: string): number | undefined {
    return this.metrics.get(name);
  }
} 