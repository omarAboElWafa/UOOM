import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

import { MetricsService } from './metrics.service';

@Controller('metrics')
@ApiTags('gateway')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all API Gateway metrics' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved successfully' })
  async getMetrics() {
    return this.metricsService.getAllMetrics();
  }

  @Get('performance')
  @ApiOperation({ summary: 'Get performance metrics' })
  @ApiQuery({ name: 'period', required: false, description: 'Time period (1h, 24h, 7d)' })
  @ApiResponse({ status: 200, description: 'Performance metrics retrieved' })
  async getPerformanceMetrics(@Query('period') period = '1h') {
    return this.metricsService.getPerformanceMetrics(period);
  }

  @Get('circuit-breakers')
  @ApiOperation({ summary: 'Get circuit breaker metrics' })
  @ApiResponse({ status: 200, description: 'Circuit breaker metrics retrieved' })
  async getCircuitBreakerMetrics() {
    return this.metricsService.getCircuitBreakerMetrics();
  }

  @Get('services')
  @ApiOperation({ summary: 'Get downstream service metrics' })
  @ApiResponse({ status: 200, description: 'Service metrics retrieved' })
  async getServiceMetrics() {
    return this.metricsService.getServiceMetrics();
  }

  @Get('sla')
  @ApiOperation({ summary: 'Get SLA compliance metrics' })
  @ApiQuery({ name: 'period', required: false, description: 'Time period (1h, 24h, 7d)' })
  @ApiResponse({ status: 200, description: 'SLA metrics retrieved' })
  async getSLAMetrics(@Query('period') period = '24h') {
    return this.metricsService.getSLAMetrics(period);
  }
} 