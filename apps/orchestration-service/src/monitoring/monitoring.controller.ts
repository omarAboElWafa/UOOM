import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';

@Controller('metrics')
@ApiTags('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get()
  @ApiOperation({ summary: 'Get service metrics' })
  @ApiResponse({ status: 200, description: 'Service metrics' })
  async getMetrics() {
    return this.monitoringService.getMetrics();
  }

  @Get('prometheus')
  @ApiOperation({ summary: 'Get Prometheus metrics' })
  @ApiResponse({ status: 200, description: 'Prometheus format metrics' })
  async getPrometheusMetrics() {
    return this.monitoringService.getPrometheusMetrics();
  }

  @Get('performance')
  @ApiOperation({ summary: 'Get performance metrics' })
  @ApiResponse({ status: 200, description: 'Performance metrics' })
  async getPerformanceMetrics() {
    return this.monitoringService.getPerformanceMetrics();
  }
} 