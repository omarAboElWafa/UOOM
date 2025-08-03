import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MetricsInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    const startTime = Date.now();
    const { method, url } = request;

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        const { statusCode } = response;
        
        // Track API Gateway metrics
        this.trackMetrics({
          method,
          endpoint: this.normalizeEndpoint(url),
          statusCode,
          duration,
          success: true,
          timestamp: new Date().toISOString(),
        });

        // Log performance metrics in structured format
        this.logger.debug('Request metrics', {
          metric_type: 'api_gateway_request',
          method,
          endpoint: this.normalizeEndpoint(url),
          status_code: statusCode,
          duration_ms: duration,
          success: true,
        });
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        const statusCode = error.status || error.statusCode || 500;
        
        // Track error metrics
        this.trackMetrics({
          method,
          endpoint: this.normalizeEndpoint(url),
          statusCode,
          duration,
          success: false,
          errorType: this.getErrorType(error),
          timestamp: new Date().toISOString(),
        });

        this.logger.warn('Request error metrics', {
          metric_type: 'api_gateway_error',
          method,
          endpoint: this.normalizeEndpoint(url),
          status_code: statusCode,
          duration_ms: duration,
          error_type: this.getErrorType(error),
          circuit_breaker_open: error.circuitBreakerOpen || false,
        });

        throw error;
      }),
    );
  }

  private trackMetrics(metrics: any): void {
    // In production, this would send metrics to:
    // - Prometheus via @willsoto/nestjs-prometheus
    // - CloudWatch via AWS SDK
    // - Custom metrics backend
    
    // For now, emit structured logs that can be ingested by log aggregators
    console.log('METRICS:', JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'api-gateway',
      version: '1.0.0',
      ...metrics,
    }));

    // Track SLA violations
    if (metrics.duration > 2000) {
      this.logger.warn('SLA_VIOLATION', {
        metric_type: 'sla_violation',
        violation_type: 'latency',
        threshold_ms: 2000,
        actual_ms: metrics.duration,
        endpoint: metrics.endpoint,
        method: metrics.method,
      });
    }

    // Track circuit breaker events
    if (metrics.errorType === 'CIRCUIT_BREAKER_OPEN') {
      this.logger.warn('CIRCUIT_BREAKER_OPEN', {
        metric_type: 'circuit_breaker',
        state: 'open',
        endpoint: metrics.endpoint,
        method: metrics.method,
      });
    }
  }

  private normalizeEndpoint(url: string): string {
    // Normalize URLs to group similar endpoints for metrics
    // Replace dynamic segments with placeholders
    
    return url
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '/:id') // UUIDs
      .replace(/\/\d+/g, '/:id') // Numeric IDs
      .replace(/\?.*/, '') // Remove query parameters
      .toLowerCase();
  }

  private getErrorType(error: any): string {
    if (error.circuitBreakerOpen) return 'CIRCUIT_BREAKER_OPEN';
    if (error.code === 'ETIMEDOUT') return 'TIMEOUT';
    if (error.code === 'ECONNRESET') return 'CONNECTION_RESET';
    if (error.code === 'ECONNREFUSED') return 'CONNECTION_REFUSED';
    
    const status = error.status || error.statusCode;
    if (status >= 400 && status < 500) return 'CLIENT_ERROR';
    if (status >= 500) return 'SERVER_ERROR';
    
    return 'UNKNOWN_ERROR';
  }
} 