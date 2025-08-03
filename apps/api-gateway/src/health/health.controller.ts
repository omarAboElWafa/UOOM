import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheckService,
  HealthCheck,
  HttpHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';

import { HealthService } from '../health/health.service';

@Controller('health')
@ApiTags('gateway')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private healthService: HealthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'API Gateway health check' })
  @ApiResponse({ status: 200, description: 'Health check passed' })
  @ApiResponse({ status: 503, description: 'Health check failed' })
  @HealthCheck()
  check() {
    return this.health.check([
      // Check API Gateway itself
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024), // 150MB
      () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024), // 300MB
      
      // Check disk usage - use current working directory for cross-platform compatibility
      () => this.disk.checkStorage('storage', { 
        path: process.cwd(), 
        thresholdPercent: 0.9 
      }),
      
      // Check downstream services
      () => this.healthService.checkDownstreamServices(),
      () => this.healthService.checkCircuitBreakers(),
    ]);
  }

  @Get('ready')
  @ApiOperation({ summary: 'API Gateway readiness check' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service is not ready' })
  @HealthCheck()
  readiness() {
    return this.health.check([
      // Check if all critical services are available
      () => this.healthService.checkServiceDiscovery(),
      () => this.healthService.checkDownstreamServices(),
    ]);
  }

  @Get('live')
  @ApiOperation({ summary: 'API Gateway liveness check' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      service: 'api-gateway',
    };
  }
} 