import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.getHttpStatus(exception);
    const errorResponse = this.buildErrorResponse(exception, request);

    // Log error details
    this.logger.error('Exception caught by filter', {
      url: request.url,
      method: request.method,
      status,
      correlationId: request.headers['x-correlation-id'],
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      error: exception instanceof Error ? exception.message : 'Unknown error',
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(status).json(errorResponse);
  }

  private getHttpStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    
    // Handle specific error types
    if (exception instanceof Error) {
      const error = exception as any;
      
      if (error.code === 'ETIMEDOUT') {
        return HttpStatus.GATEWAY_TIMEOUT;
      }
      
      if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
        return HttpStatus.SERVICE_UNAVAILABLE;
      }
      
      if (error.circuitBreakerOpen) {
        return HttpStatus.SERVICE_UNAVAILABLE;
      }
    }
    
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private buildErrorResponse(exception: unknown, request: Request): any {
    const timestamp = new Date().toISOString();
    const path = request.url;
    const method = request.method;
    const correlationId = request.headers['x-correlation-id'] as string;

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      
      if (typeof response === 'object') {
        return {
          ...response,
          timestamp,
          path,
          method,
          correlationId,
          gateway: 'UOOP-API-Gateway',
        };
      }
      
      return {
        statusCode: exception.getStatus(),
        message: response,
        error: exception.name,
        timestamp,
        path,
        method,
        correlationId,
        gateway: 'UOOP-API-Gateway',
      };
    }

    // Handle non-HTTP exceptions
    const error = exception as any;
    
    if (error.circuitBreakerOpen) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service Unavailable',
        message: 'Service temporarily unavailable due to circuit breaker',
        details: 'The downstream service is experiencing issues. Please try again later.',
        timestamp,
        path,
        method,
        correlationId,
        gateway: 'UOOP-API-Gateway',
        retry: {
          retryable: true,
          retryAfterSeconds: 60,
          reason: 'Circuit breaker will reset automatically',
        },
      };
    }
    
    if (error.code === 'ETIMEDOUT') {
      return {
        statusCode: HttpStatus.GATEWAY_TIMEOUT,
        error: 'Gateway Timeout',
        message: 'Request timed out',
        details: 'The downstream service did not respond within the timeout period.',
        timestamp,
        path,
        method,
        correlationId,
        gateway: 'UOOP-API-Gateway',
        retry: {
          retryable: true,
          retryAfterSeconds: 5,
          reason: 'Timeout may be temporary',
        },
      };
    }
    
    // Generic error response
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' 
        ? (error.message || 'Unknown error')
        : 'Please contact support if the problem persists',
      timestamp,
      path,
      method,
      correlationId,
      gateway: 'UOOP-API-Gateway',
      ...(process.env.NODE_ENV === 'development' && {
        debug: {
          stack: error.stack,
          name: error.name,
        },
      }),
    };
  }
} 