import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OutboxProcessorService } from '../outbox/outbox-processor.service';

@Controller('metrics')
@ApiTags('metrics')
export class MetricsController {
  constructor(private outboxProcessor: OutboxProcessorService) {}

  @Get()
  @ApiOperation({ summary: 'Get outbox processing metrics' })
  @ApiResponse({ status: 200, description: 'Processing metrics' })
  getMetrics() {
    const metrics = this.outboxProcessor.getProcessingMetrics();
    const healthStatus = this.outboxProcessor.getHealthStatus();
    
    return {
      processing: metrics,
      health: healthStatus,
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('prometheus')
  @ApiOperation({ summary: 'Get metrics in Prometheus format' })
  @ApiResponse({ 
    status: 200, 
    description: 'Metrics in Prometheus format',
    headers: {
      'Content-Type': {
        description: 'text/plain',
        schema: { type: 'string' }
      }
    }
  })
  getPrometheusMetrics() {
    const metrics = this.outboxProcessor.getProcessingMetrics();
    const healthStatus = this.outboxProcessor.getHealthStatus();
    
    const prometheusMetrics = [
      '# HELP outbox_events_processed_total Total number of outbox events processed',
      '# TYPE outbox_events_processed_total counter',
      `outbox_events_processed_total ${metrics.eventsProcessed}`,
      '',
      '# HELP outbox_events_succeeded_total Total number of outbox events successfully processed',
      '# TYPE outbox_events_succeeded_total counter',
      `outbox_events_succeeded_total ${metrics.eventsSucceeded}`,
      '',
      '# HELP outbox_events_failed_total Total number of outbox events that failed processing',
      '# TYPE outbox_events_failed_total counter',
      `outbox_events_failed_total ${metrics.eventsFailed}`,
      '',
      '# HELP outbox_processing_time_avg Average processing time in milliseconds',
      '# TYPE outbox_processing_time_avg gauge',
      `outbox_processing_time_avg ${metrics.averageProcessingTime}`,
      '',
      '# HELP outbox_processor_healthy Whether the outbox processor is healthy (1) or not (0)',
      '# TYPE outbox_processor_healthy gauge',
      `outbox_processor_healthy ${healthStatus.status === 'healthy' ? 1 : 0}`,
      '',
      '# HELP outbox_processor_processing Whether the outbox processor is currently processing (1) or not (0)',
      '# TYPE outbox_processor_processing gauge',
      `outbox_processor_processing ${healthStatus.details.isProcessing ? 1 : 0}`,
      '',
      '# HELP process_uptime_seconds Number of seconds the process has been running',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${process.uptime()}`,
      '',
      '# HELP nodejs_memory_heap_used_bytes Heap used memory in bytes',
      '# TYPE nodejs_memory_heap_used_bytes gauge',
      `nodejs_memory_heap_used_bytes ${process.memoryUsage().heapUsed}`,
      '',
      '# HELP nodejs_memory_heap_total_bytes Heap total memory in bytes',
      '# TYPE nodejs_memory_heap_total_bytes gauge',
      `nodejs_memory_heap_total_bytes ${process.memoryUsage().heapTotal}`,
      '',
    ].join('\n');

    return prometheusMetrics;
  }

  @Get('health-summary')
  @ApiOperation({ summary: 'Get health summary for quick monitoring' })
  @ApiResponse({ status: 200, description: 'Health summary' })
  getHealthSummary() {
    const metrics = this.outboxProcessor.getProcessingMetrics();
    const healthStatus = this.outboxProcessor.getHealthStatus();
    
    const successRate = metrics.eventsProcessed > 0 
      ? (metrics.eventsSucceeded / metrics.eventsProcessed) * 100 
      : 100;

    return {
      overall_status: healthStatus.status,
      success_rate_percent: Number(successRate.toFixed(2)),
      events_processed: metrics.eventsProcessed,
      events_pending: metrics.eventsFailed, // Failed events that will be retried
      last_processed_at: metrics.lastProcessedAt,
      average_processing_time_ms: Number(metrics.averageProcessingTime.toFixed(2)),
      is_currently_processing: healthStatus.details.isProcessing,
      alerts: this.generateAlerts(metrics, healthStatus),
    };
  }

  private generateAlerts(metrics: any, healthStatus: any): string[] {
    const alerts: string[] = [];
    
    // Check success rate
    const successRate = metrics.eventsProcessed > 0 
      ? (metrics.eventsSucceeded / metrics.eventsProcessed) * 100 
      : 100;
    
    if (successRate < 95 && metrics.eventsProcessed > 10) {
      alerts.push(`Low success rate: ${successRate.toFixed(1)}%`);
    }
    
    // Check if processor is stale
    if (healthStatus.status === 'unhealthy') {
      alerts.push('Processor appears to be stale or stuck');
    }
    
    // Check high failure rate
    if (metrics.eventsFailed > 0 && metrics.eventsFailed / metrics.eventsProcessed > 0.1) {
      alerts.push('High failure rate detected');
    }
    
    // Check processing time
    if (metrics.averageProcessingTime > 5000) { // 5 seconds
      alerts.push('High average processing time');
    }
    
    return alerts;
  }
} 