import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ChannelTrackingService {
  private readonly logger = new Logger(ChannelTrackingService.name);

  async getCapacityAnalytics(hours: number = 24) {
    // Simulate capacity analytics data
    const now = new Date();
    const dataPoints = [];
    
    for (let i = hours; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      dataPoints.push({
        timestamp: timestamp.toISOString(),
        totalCapacity: 1250,
        usedCapacity: Math.floor(Math.random() * 400) + 600,
        activeChannels: Math.floor(Math.random() * 3) + 22,
        utilizationPercent: (Math.random() * 30 + 50).toFixed(2),
      });
    }

    const latest = dataPoints[dataPoints.length - 1];
    const oldest = dataPoints[0];
    
    return {
      period: {
        hours,
        startTime: oldest.timestamp,
        endTime: latest.timestamp,
      },
      summary: {
        currentUtilization: latest.utilizationPercent,
        avgUtilization: (dataPoints.reduce((sum, dp) => sum + parseFloat(dp.utilizationPercent), 0) / dataPoints.length).toFixed(2),
        maxUtilization: Math.max(...dataPoints.map(dp => parseFloat(dp.utilizationPercent))).toFixed(2),
        minUtilization: Math.min(...dataPoints.map(dp => parseFloat(dp.utilizationPercent))).toFixed(2),
        avgActiveChannels: Math.round(dataPoints.reduce((sum, dp) => sum + dp.activeChannels, 0) / dataPoints.length),
      },
      trends: {
        utilizationTrend: this.calculateTrend(dataPoints.map(dp => parseFloat(dp.utilizationPercent))),
        capacityTrend: this.calculateTrend(dataPoints.map(dp => dp.usedCapacity)),
      },
      dataPoints: dataPoints.slice(-48), // Return up to 48 hours of data
      timestamp: new Date().toISOString(),
    };
  }

  private calculateTrend(values: number[]): string {
    if (values.length < 2) return 'stable';
    
    const first = values.slice(0, Math.floor(values.length / 3));
    const last = values.slice(-Math.floor(values.length / 3));
    
    const firstAvg = first.reduce((sum, val) => sum + val, 0) / first.length;
    const lastAvg = last.reduce((sum, val) => sum + val, 0) / last.length;
    
    const change = ((lastAvg - firstAvg) / firstAvg) * 100;
    
    if (change > 5) return 'increasing';
    if (change < -5) return 'decreasing';
    return 'stable';
  }
} 