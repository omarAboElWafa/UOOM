import { Injectable } from '@nestjs/common';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';
import { ServiceDiscoveryService } from '../gateway/services/service-discovery.service';

@Injectable()
export class MetricsService {
  constructor(
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly serviceDiscovery: ServiceDiscoveryService,
  ) {}

  async getAllMetrics() {
    const timestamp = new Date().toISOString();
    
    return {
      timestamp,
      service: 'api-gateway',
      version: '1.0.0',
      uptime: process.uptime(),
      performance: await this.getPerformanceMetrics('1h'),
      circuitBreakers: await this.getCircuitBreakerMetrics(),
      services: await this.getServiceMetrics(),
      sla: await this.getSLAMetrics('24h'),
    };
  }

  async getPerformanceMetrics(period: string) {
    // In production, this would query actual metrics storage
    // For now, return simulated metrics based on current state
    
    return {
      period,
      timestamp: new Date().toISOString(),
      requestCount: this.getSimulatedRequestCount(period),
      averageLatency: this.getSimulatedLatency(),
      p95Latency: this.getSimulatedLatency() * 1.5,
      p99Latency: this.getSimulatedLatency() * 2,
      errorRate: this.getSimulatedErrorRate(),
      throughput: this.getSimulatedThroughput(period),
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      cpu: {
        usage: this.getSimulatedCpuUsage(),
      },
    };
  }

  async getCircuitBreakerMetrics() {
    const allMetrics = this.circuitBreaker.getAllMetrics();
    
    return {
      timestamp: new Date().toISOString(),
      circuits: allMetrics.map(metric => ({
        serviceName: metric.serviceName,
        state: metric.state,
        failureCount: metric.failureCount,
        successCount: metric.successCount,
        lastFailureTime: metric.lastFailureTime 
          ? new Date(metric.lastFailureTime).toISOString() 
          : null,
        lastSuccessTime: metric.lastSuccessTime 
          ? new Date(metric.lastSuccessTime).toISOString() 
          : null,
        healthStatus: this.getCircuitHealthStatus(metric.state, metric.failureCount),
      })),
      summary: {
        totalCircuits: allMetrics.length,
        openCircuits: allMetrics.filter(m => m.state === 'OPEN').length,
        halfOpenCircuits: allMetrics.filter(m => m.state === 'HALF_OPEN').length,
        closedCircuits: allMetrics.filter(m => m.state === 'CLOSED').length,
      },
    };
  }

  async getServiceMetrics() {
    const services = this.serviceDiscovery.getAllServices();
    
    const serviceMetrics = Object.entries(services).map(([serviceName, endpoints]) => {
      const health = this.serviceDiscovery.getServiceHealth(serviceName);
      
      return {
        serviceName,
        endpointCount: endpoints.length,
        healthyEndpoints: health.healthy,
        unhealthyEndpoints: health.total - health.healthy,
        healthPercentage: health.total > 0 ? (health.healthy / health.total) * 100 : 0,
        endpoints: endpoints.map(endpoint => ({
          url: endpoint.url,
          healthy: endpoint.healthy,
          lastCheck: new Date(endpoint.lastCheck).toISOString(),
        })),
        status: this.getServiceStatus(health.healthy, health.total),
      };
    });

    return {
      timestamp: new Date().toISOString(),
      services: serviceMetrics,
      summary: {
        totalServices: serviceMetrics.length,
        healthyServices: serviceMetrics.filter(s => s.status === 'healthy').length,
        degradedServices: serviceMetrics.filter(s => s.status === 'degraded').length,
        unhealthyServices: serviceMetrics.filter(s => s.status === 'unhealthy').length,
      },
    };
  }

  async getSLAMetrics(period: string) {
    // SLA targets for UOOP platform
    const slaTargets = {
      latencyP99Ms: 2000, // P99 ≤ 2s
      availabilityPercent: 99.9, // 99.9% availability
      eventDeliveryLatencyMs: 5000, // Event delivery ≤ 5s
    };

    // In production, calculate from actual metrics
    const currentMetrics = {
      latencyP99Ms: this.getSimulatedLatency() * 2,
      availabilityPercent: this.getSimulatedAvailability(),
      eventDeliveryLatencyMs: this.getSimulatedEventLatency(),
    };

    return {
      period,
      timestamp: new Date().toISOString(),
      targets: slaTargets,
      current: currentMetrics,
      compliance: {
        latency: {
          compliant: currentMetrics.latencyP99Ms <= slaTargets.latencyP99Ms,
          currentValue: currentMetrics.latencyP99Ms,
          targetValue: slaTargets.latencyP99Ms,
          violationPercentage: Math.max(0, 
            ((currentMetrics.latencyP99Ms - slaTargets.latencyP99Ms) / slaTargets.latencyP99Ms) * 100
          ),
        },
        availability: {
          compliant: currentMetrics.availabilityPercent >= slaTargets.availabilityPercent,
          currentValue: currentMetrics.availabilityPercent,
          targetValue: slaTargets.availabilityPercent,
          violationPercentage: Math.max(0, 
            ((slaTargets.availabilityPercent - currentMetrics.availabilityPercent) / slaTargets.availabilityPercent) * 100
          ),
        },
        eventDelivery: {
          compliant: currentMetrics.eventDeliveryLatencyMs <= slaTargets.eventDeliveryLatencyMs,
          currentValue: currentMetrics.eventDeliveryLatencyMs,
          targetValue: slaTargets.eventDeliveryLatencyMs,
          violationPercentage: Math.max(0, 
            ((currentMetrics.eventDeliveryLatencyMs - slaTargets.eventDeliveryLatencyMs) / slaTargets.eventDeliveryLatencyMs) * 100
          ),
        },
      },
      overallCompliance: {
        score: this.calculateOverallSLAScore(currentMetrics, slaTargets),
        status: this.getSLAStatus(currentMetrics, slaTargets),
      },
    };
  }

  private getSimulatedRequestCount(period: string): number {
    const multipliers = { '1h': 1000, '24h': 24000, '7d': 168000 };
    return multipliers[period] || 1000;
  }

  private getSimulatedLatency(): number {
    // Simulate latency between 100-500ms
    return Math.floor(Math.random() * 400) + 100;
  }

  private getSimulatedErrorRate(): number {
    // Simulate error rate between 0.1% - 2%
    return Math.random() * 1.9 + 0.1;
  }

  private getSimulatedThroughput(period: string): number {
    const multipliers = { '1h': 278, '24h': 278, '7d': 278 }; // requests per second
    return multipliers[period] || 278;
  }

  private getSimulatedCpuUsage(): number {
    // Simulate CPU usage between 10% - 60%
    return Math.floor(Math.random() * 50) + 10;
  }

  private getSimulatedAvailability(): number {
    // Simulate availability between 99.5% - 99.99%
    return 99.5 + Math.random() * 0.49;
  }

  private getSimulatedEventLatency(): number {
    // Simulate event delivery latency between 1s - 3s
    return Math.floor(Math.random() * 2000) + 1000;
  }

  private getCircuitHealthStatus(state: string, failureCount: number): string {
    if (state === 'OPEN') return 'unhealthy';
    if (state === 'HALF_OPEN') return 'degraded';
    if (failureCount > 2) return 'warning';
    return 'healthy';
  }

  private getServiceStatus(healthy: number, total: number): string {
    if (total === 0) return 'unknown';
    const healthPercentage = (healthy / total) * 100;
    
    if (healthPercentage === 100) return 'healthy';
    if (healthPercentage >= 50) return 'degraded';
    return 'unhealthy';
  }

  private calculateOverallSLAScore(current: any, targets: any): number {
    const latencyScore = Math.min(100, (targets.latencyP99Ms / current.latencyP99Ms) * 100);
    const availabilityScore = (current.availabilityPercent / targets.availabilityPercent) * 100;
    const eventScore = Math.min(100, (targets.eventDeliveryLatencyMs / current.eventDeliveryLatencyMs) * 100);
    
    return Math.round((latencyScore + availabilityScore + eventScore) / 3);
  }

  private getSLAStatus(current: any, targets: any): string {
    const score = this.calculateOverallSLAScore(current, targets);
    
    if (score >= 95) return 'excellent';
    if (score >= 90) return 'good';
    if (score >= 80) return 'warning';
    return 'critical';
  }
} 