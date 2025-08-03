import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@ApiTags('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ summary: 'Get Prometheus metrics' })
  @ApiResponse({ status: 200, description: 'Metrics in Prometheus format' })
  async getMetrics(): Promise<string> {
    return this.metricsService.getPrometheusMetrics();
  }

  @Get('capacity')
  @ApiOperation({ summary: 'Get capacity metrics summary' })
  @ApiResponse({ status: 200, description: 'Capacity metrics summary' })
  async getCapacityMetrics() {
    return this.metricsService.getCapacityMetrics();
  }

  @Get('channels')
  @ApiOperation({ summary: 'Get channel performance metrics' })
  @ApiResponse({ status: 200, description: 'Channel performance metrics' })
  async getChannelMetrics() {
    return this.metricsService.getChannelMetrics();
  }
} 