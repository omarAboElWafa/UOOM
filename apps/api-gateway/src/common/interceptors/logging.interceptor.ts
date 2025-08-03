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
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    const { method, url, headers, body, ip } = request;
    const correlationId = headers['x-correlation-id'] as string;
    const requestId = headers['x-request-id'] as string;
    const userAgent = headers['user-agent'] as string;
    
    const startTime = Date.now();

    // Log incoming request
    this.logger.log('Incoming request', {
      method,
      url,
      correlationId,
      requestId,
      userAgent,
      ip,
      bodySize: body ? JSON.stringify(body).length : 0,
      headers: this.sanitizeHeaders(headers),
    });

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startTime;
        const { statusCode } = response;
        
        this.logger.log('Request completed', {
          method,
          url,
          statusCode,
          duration,
          correlationId,
          requestId,
          responseSize: data ? JSON.stringify(data).length : 0,
        });

        // Track performance metrics
        if (duration > 2000) {
          this.logger.warn('Slow request detected', {
            method,
            url,
            duration,
            correlationId,
            threshold: 2000,
          });
        }
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        const statusCode = error.status || error.statusCode || 500;
        
        this.logger.error('Request failed', {
          method,
          url,
          statusCode,
          duration,
          correlationId,
          requestId,
          error: error.message,
          errorCode: error.code,
          circuitBreakerOpen: error.circuitBreakerOpen,
        });

        throw error;
      }),
    );
  }

  private sanitizeHeaders(headers: any): Record<string, string> {
    const sanitized = { ...headers };
    
    // Remove sensitive headers from logs
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
      'set-cookie',
    ];

    for (const header of sensitiveHeaders) {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    }

    // Keep only relevant headers
    const relevantHeaders = [
      'content-type',
      'accept',
      'user-agent',
      'x-correlation-id',
      'x-request-id',
      'x-forwarded-for',
      'x-real-ip',
      'authorization', // Already redacted above
    ];

    const filtered: Record<string, string> = {};
    for (const header of relevantHeaders) {
      if (sanitized[header]) {
        filtered[header] = sanitized[header];
      }
    }

    return filtered;
  }
} 