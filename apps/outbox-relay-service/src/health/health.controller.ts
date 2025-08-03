import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { OutboxProcessorService } from '../outbox/outbox-processor.service';

@Controller('health')
@ApiTags('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private outboxProcessor: OutboxProcessorService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check application health' })
  @ApiResponse({ status: 200, description: 'Health check results' })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.checkOutboxProcessor(),
    ]);
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check if application is ready to serve traffic' })
  @ApiResponse({ status: 200, description: 'Readiness check results' })
  async readiness() {
    const processorHealth = this.outboxProcessor.getHealthStatus();
    
    return {
      status: processorHealth.status === 'healthy' ? 'ready' : 'not-ready',
      checks: {
        outboxProcessor: processorHealth,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  @ApiOperation({ summary: 'Check if application is alive' })
  @ApiResponse({ status: 200, description: 'Liveness check results' })
  async liveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }

  private async checkOutboxProcessor() {
    const health = this.outboxProcessor.getHealthStatus();
    
    if (health.status === 'healthy') {
      return {
        outboxProcessor: {
          status: 'up',
          ...health.details,
        },
      };
    } else {
      throw new Error(`Outbox processor is unhealthy: ${JSON.stringify(health.details)}`);
    }
  }
} 