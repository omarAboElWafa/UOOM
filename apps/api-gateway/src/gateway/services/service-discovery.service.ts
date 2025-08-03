import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ServiceEndpoint {
  url: string;
  healthy: boolean;
  lastCheck: number;
}

@Injectable()
export class ServiceDiscoveryService {
  private readonly logger = new Logger(ServiceDiscoveryService.name);
  private readonly serviceEndpoints = new Map<string, ServiceEndpoint[]>();
  private readonly healthCheckInterval = 30000; // 30 seconds

  constructor(private readonly configService: ConfigService) {
    this.initializeServices();
    this.startHealthChecks();
  }

  private initializeServices(): void {
    const services = {
      'orchestration-service': this.configService.get<string>(
        'ORCHESTRATION_SERVICE_URL',
        'http://orchestration-service:3000'
      ),
      'optimization-service': this.configService.get<string>(
        'OPTIMIZATION_SERVICE_URL', 
        'http://optimization-service:3001'
      ),
      'capacity-service': this.configService.get<string>(
        'CAPACITY_SERVICE_URL',
        'http://capacity-service:3003'
      ),
      'outbox-relay-service': this.configService.get<string>(
        'OUTBOX_RELAY_SERVICE_URL',
        'http://outbox-relay-service:3002'
      ),
    };

    for (const [serviceName, serviceUrl] of Object.entries(services)) {
      this.serviceEndpoints.set(serviceName, [{
        url: serviceUrl,
        healthy: true,
        lastCheck: Date.now(),
      }]);
    }

    this.logger.log('Service discovery initialized', {
      services: Object.keys(services),
    });
  }

  async getServiceUrl(serviceName: string): Promise<string> {
    const endpoints = this.serviceEndpoints.get(serviceName);
    
    if (!endpoints || endpoints.length === 0) {
      throw new Error(`No endpoints found for service: ${serviceName}`);
    }

    // Find healthy endpoints
    const healthyEndpoints = endpoints.filter(endpoint => endpoint.healthy);
    
    if (healthyEndpoints.length === 0) {
      this.logger.warn(`No healthy endpoints for service: ${serviceName}, using first available`);
      return endpoints[0].url;
    }

    // Simple round-robin for now
    const selectedEndpoint = healthyEndpoints[Math.floor(Math.random() * healthyEndpoints.length)];
    
    this.logger.debug(`Selected endpoint for ${serviceName}`, {
      url: selectedEndpoint.url,
      healthy: selectedEndpoint.healthy,
    });

    return selectedEndpoint.url;
  }

  async addServiceEndpoint(serviceName: string, url: string): Promise<void> {
    const endpoints = this.serviceEndpoints.get(serviceName) || [];
    
    // Check if endpoint already exists
    const existing = endpoints.find(endpoint => endpoint.url === url);
    if (existing) {
      this.logger.warn(`Endpoint already exists for ${serviceName}: ${url}`);
      return;
    }

    endpoints.push({
      url,
      healthy: true,
      lastCheck: Date.now(),
    });

    this.serviceEndpoints.set(serviceName, endpoints);
    
    this.logger.log(`Added endpoint for ${serviceName}`, { url });
  }

  async removeServiceEndpoint(serviceName: string, url: string): Promise<void> {
    const endpoints = this.serviceEndpoints.get(serviceName) || [];
    const filtered = endpoints.filter(endpoint => endpoint.url !== url);
    
    this.serviceEndpoints.set(serviceName, filtered);
    
    this.logger.log(`Removed endpoint for ${serviceName}`, { url });
  }

  getAllServices(): Record<string, ServiceEndpoint[]> {
    const result: Record<string, ServiceEndpoint[]> = {};
    
    for (const [serviceName, endpoints] of this.serviceEndpoints.entries()) {
      result[serviceName] = [...endpoints];
    }
    
    return result;
  }

  getServiceHealth(serviceName: string): { healthy: number; total: number } {
    const endpoints = this.serviceEndpoints.get(serviceName) || [];
    const healthy = endpoints.filter(endpoint => endpoint.healthy).length;
    
    return {
      healthy,
      total: endpoints.length,
    };
  }

  private startHealthChecks(): void {
    setInterval(async () => {
      await this.performHealthChecks();
    }, this.healthCheckInterval);

    this.logger.debug('Health checks started', {
      interval: this.healthCheckInterval,
    });
  }

  private async performHealthChecks(): Promise<void> {
    for (const [serviceName, endpoints] of this.serviceEndpoints.entries()) {
      for (const endpoint of endpoints) {
        try {
          await this.checkEndpointHealth(endpoint);
          
          if (!endpoint.healthy) {
            endpoint.healthy = true;
            this.logger.log(`Service ${serviceName} endpoint recovered`, {
              url: endpoint.url,
            });
          }
        } catch (error) {
          if (endpoint.healthy) {
            endpoint.healthy = false;
            this.logger.warn(`Service ${serviceName} endpoint unhealthy`, {
              url: endpoint.url,
              error: error.message,
            });
          }
        }
        
        endpoint.lastCheck = Date.now();
      }
    }
  }

  private async checkEndpointHealth(endpoint: ServiceEndpoint): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const response = await fetch(`${endpoint.url}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'UOOP-API-Gateway-HealthCheck/1.0.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Health check failed with status: ${response.status}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
} 