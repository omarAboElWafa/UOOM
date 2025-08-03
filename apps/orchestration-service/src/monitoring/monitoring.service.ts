import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private requestCount = 0;
  private errorCount = 0;
  private startTime = Date.now();

  incrementRequestCount(): void {
    this.requestCount++;
  }

  incrementErrorCount(): void {
    this.errorCount++;
  }

  async getMetrics(): Promise<any> {
    const uptime = Date.now() - this.startTime;
    
    return {
      service: 'orchestration-service',
      uptime: uptime,
      requests: {
        total: this.requestCount,
        errors: this.errorCount,
        success: this.requestCount - this.errorCount,
        successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0,
      },
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      timestamp: new Date().toISOString(),
    };
  }

  async getPrometheusMetrics(): Promise<string> {
    const uptime = Date.now() - this.startTime;
    const successRate = this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0;
    
    return `# HELP uoop_requests_total Total number of requests
# TYPE uoop_requests_total counter
uoop_requests_total ${this.requestCount}

# HELP uoop_errors_total Total number of errors
# TYPE uoop_errors_total counter
uoop_errors_total ${this.errorCount}

# HELP uoop_success_rate Success rate percentage
# TYPE uoop_success_rate gauge
uoop_success_rate ${successRate}

# HELP uoop_uptime_seconds Service uptime in seconds
# TYPE uoop_uptime_seconds gauge
uoop_uptime_seconds ${uptime / 1000}`;
  }

  async getPerformanceMetrics(): Promise<any> {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      performance: {
        requestCount: this.requestCount,
        errorCount: this.errorCount,
        successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0,
      },
    };
  }
} 