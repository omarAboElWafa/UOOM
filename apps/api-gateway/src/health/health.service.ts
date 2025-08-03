import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';

import { ServiceDiscoveryService } from '../gateway/services/service-discovery.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly serviceDiscovery: ServiceDiscoveryService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  async checkDownstreamServices(): Promise<HealthIndicatorResult> {
    try {
      const services = this.serviceDiscovery.getAllServices();
      const serviceHealth: Record<string, any> = {};
      let overallHealthy = true;

      for (const [serviceName, endpoints] of Object.entries(services)) {
        const health = this.serviceDiscovery.getServiceHealth(serviceName);
        serviceHealth[serviceName] = {
          healthy: health.healthy,
          total: health.total,
          healthyPercentage: health.total > 0 ? (health.healthy / health.total) * 100 : 0,
        };

        // Service is considered unhealthy if less than 50% of endpoints are healthy
        if (health.total > 0 && health.healthy / health.total < 0.5) {
          overallHealthy = false;
        }
      }

      if (overallHealthy) {
        return {
          downstream_services: {
            status: 'up',
            services: serviceHealth,
          },
        };
      } else {
        throw new HealthCheckError('Downstream services check failed', {
          downstream_services: {
            status: 'down',
            services: serviceHealth,
          },
        });
      }
    } catch (error) {
      throw new HealthCheckError('Downstream services check failed', {
        downstream_services: {
          status: 'down',
          error: error.message,
        },
      });
    }
  }

  async checkCircuitBreakers(): Promise<HealthIndicatorResult> {
    try {
      const allMetrics = this.circuitBreaker.getAllMetrics();
      const circuitBreakerHealth: Record<string, any> = {};
      let hasOpenCircuits = false;

      for (const metrics of allMetrics) {
        circuitBreakerHealth[metrics.serviceName] = {
          state: metrics.state,
          failureCount: metrics.failureCount,
          lastFailureTime: metrics.lastFailureTime,
          lastSuccessTime: metrics.lastSuccessTime,
        };

        if (metrics.state === 'OPEN') {
          hasOpenCircuits = true;
        }
      }

      if (!hasOpenCircuits) {
        return {
          circuit_breakers: {
            status: 'up',
            circuits: circuitBreakerHealth,
          },
        };
      } else {
        // Open circuits are warning, not failure for health check
        return {
          circuit_breakers: {
            status: 'up',
            circuits: circuitBreakerHealth,
            warning: 'Some circuit breakers are open',
          },
        };
      }
    } catch (error) {
      throw new HealthCheckError('Circuit breaker check failed', {
        circuit_breakers: {
          status: 'down',
          error: error.message,
        },
      });
    }
  }

  async checkServiceDiscovery(): Promise<HealthIndicatorResult> {
    try {
      const services = this.serviceDiscovery.getAllServices();
      const serviceCount = Object.keys(services).length;
      
      if (serviceCount === 0) {
        throw new HealthCheckError('No services registered', {
          service_discovery: {
            status: 'down',
            serviceCount: 0,
          },
        });
      }

      return {
        service_discovery: {
          status: 'up',
          serviceCount,
          services: Object.keys(services),
        },
      };
    } catch (error) {
      throw new HealthCheckError('Service discovery check failed', {
        service_discovery: {
          status: 'down',
          error: error.message,
        },
      });
    }
  }
} 