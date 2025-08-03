import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ResponseTransformService {
  private readonly logger = new Logger(ResponseTransformService.name);

  async transformOrderResponse(data: any, correlationId: string): Promise<any> {
    const transformed = {
      ...data,
      // Add gateway metadata
      gateway: {
        correlationId,
        processedAt: new Date().toISOString(),
        version: '1.0.0',
      },
      // Standardize response format
      success: true,
      timestamp: new Date().toISOString(),
    };

    // Remove internal fields that shouldn't be exposed
    this.removeInternalFields(transformed);

    // Format monetary values
    this.formatMonetaryFields(transformed);

    // Add computed fields
    this.addComputedFields(transformed);

    this.logger.debug('Transformed order response', {
      orderId: transformed.id,
      correlationId,
      status: transformed.status,
    });

    return transformed;
  }

  async transformStatusResponse(data: any, correlationId: string): Promise<any> {
    const transformed = {
      id: data.id,
      status: data.status,
      estimatedDeliveryTime: data.estimatedDeliveryTime,
      trackingCode: data.trackingCode,
      lastUpdated: data.updatedAt || new Date().toISOString(),
      
      // Add status metadata
      statusInfo: {
        correlationId,
        retrievedAt: new Date().toISOString(),
        source: 'orchestration-service',
        cached: false, // Will be set by gateway service if from cache
      },
      
      // Add user-friendly status description
      statusDescription: this.getStatusDescription(data.status),
      
      // Add progress indicator
      progress: this.calculateProgress(data.status),
    };

    this.logger.debug('Transformed status response', {
      orderId: transformed.id,
      status: transformed.status,
      correlationId,
    });

    return transformed;
  }

  async transformOptimizationResponse(data: any, correlationId: string): Promise<any> {
    const transformed = {
      ...data,
      // Add transformation metadata
      optimization: {
        correlationId,
        processedAt: new Date().toISOString(),
        algorithm: 'OR-Tools CP-SAT',
        version: '1.0.0',
      },
      // Format performance metrics
      performance: {
        solveTimeMs: data.solve_time_ms || data.solveTimeMs,
        status: data.status,
        totalScore: data.total_score || data.totalScore,
        optimalityGap: this.calculateOptimalityGap(data),
      },
      success: data.status === 'OPTIMAL' || data.status === 'FEASIBLE',
    };

    this.logger.debug('Transformed optimization response', {
      correlationId,
      assignmentsCount: Object.keys(data.assignments || {}).length,
      status: transformed.performance.status,
      solveTime: transformed.performance.solveTimeMs,
    });

    return transformed;
  }

  async transformErrorResponse(error: any, correlationId: string): Promise<any> {
    const statusCode = error.status || error.statusCode || 500;
    
    const transformed = {
      success: false,
      error: {
        code: this.getErrorCode(error),
        message: this.getErrorMessage(error),
        details: error.response?.data || error.message || 'Unknown error',
        correlationId,
        timestamp: new Date().toISOString(),
        service: error.service || 'unknown',
      },
      statusCode,
      // Add retry information for certain errors
      retry: this.getRetryInfo(error),
    };

    // Add helpful error context for different error types
    this.addErrorContext(transformed, error);

    this.logger.warn('Transformed error response', {
      correlationId,
      errorCode: transformed.error.code,
      statusCode,
      service: transformed.error.service,
    });

    return transformed;
  }

  async transformListResponse(data: any, correlationId: string): Promise<any> {
    const items = Array.isArray(data) ? data : data.items || data.data || [];
    
    const transformed = {
      success: true,
      data: items.map(item => this.transformListItem(item)),
      pagination: {
        total: data.total || items.length,
        page: data.page || 1,
        limit: data.limit || items.length,
        hasNext: data.hasNext || false,
        hasPrevious: data.hasPrevious || false,
      },
      metadata: {
        correlationId,
        retrievedAt: new Date().toISOString(),
        itemCount: items.length,
      },
    };

    return transformed;
  }

  private removeInternalFields(data: any): void {
    const internalFields = [
      'internalId',
      'systemMetadata',
      'debugInfo',
      'internalNotes',
      'version',
      '__v',
      '_id',
    ];

    for (const field of internalFields) {
      delete data[field];
    }

    // Remove any field starting with underscore
    for (const key of Object.keys(data)) {
      if (key.startsWith('_') && key !== '_links') {
        delete data[key];
      }
    }
  }

  private formatMonetaryFields(data: any): void {
    const monetaryFields = ['total', 'subtotal', 'tax', 'deliveryFee', 'tip'];
    
    for (const field of monetaryFields) {
      if (data[field] !== undefined) {
        // Ensure monetary values are properly formatted
        data[field] = Math.round(parseFloat(data[field]) * 100) / 100;
      }
    }
  }

  private addComputedFields(data: any): void {
    // Add estimated delivery window
    if (data.estimatedDeliveryTime) {
      const deliveryTime = new Date(data.estimatedDeliveryTime);
      data.estimatedDeliveryWindow = {
        earliest: new Date(deliveryTime.getTime() - 10 * 60000).toISOString(), // -10 minutes
        latest: new Date(deliveryTime.getTime() + 10 * 60000).toISOString(),   // +10 minutes
      };
    }

    // Add time since creation
    if (data.createdAt) {
      const created = new Date(data.createdAt);
      const now = new Date();
      data.ageMinutes = Math.floor((now.getTime() - created.getTime()) / 60000);
    }

    // Add order summary
    if (data.items && Array.isArray(data.items)) {
      data.orderSummary = {
        itemCount: data.items.length,
        totalQuantity: data.items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0),
      };
    }
  }

  private getStatusDescription(status: string): string {
    const descriptions = {
      PENDING: 'Order received and being processed',
      CONFIRMED: 'Order confirmed by restaurant',
      PREPARING: 'Restaurant is preparing your order',
      READY_FOR_PICKUP: 'Order is ready for pickup',
      PICKED_UP: 'Order has been picked up by delivery partner',
      IN_TRANSIT: 'Order is on its way to you',
      DELIVERED: 'Order has been delivered',
      CANCELLED: 'Order has been cancelled',
      FAILED: 'Order processing failed',
    };

    return descriptions[status] || 'Unknown status';
  }

  private calculateProgress(status: string): number {
    const progressMap = {
      PENDING: 10,
      CONFIRMED: 25,
      PREPARING: 40,
      READY_FOR_PICKUP: 60,
      PICKED_UP: 75,
      IN_TRANSIT: 90,
      DELIVERED: 100,
      CANCELLED: 0,
      FAILED: 0,
    };

    return progressMap[status] || 0;
  }

  private calculateOptimalityGap(data: any): number {
    // Calculate how far from optimal the solution is
    if (data.status === 'OPTIMAL') return 0;
    if (data.status === 'FEASIBLE') return 5; // Estimate 5% gap for feasible solutions
    return 100; // No solution found
  }

  private getErrorCode(error: any): string {
    if (error.circuitBreakerOpen) return 'CIRCUIT_BREAKER_OPEN';
    if (error.code === 'ETIMEDOUT') return 'TIMEOUT';
    if (error.code === 'ECONNRESET') return 'CONNECTION_RESET';
    if (error.response?.status === 404) return 'NOT_FOUND';
    if (error.response?.status === 400) return 'BAD_REQUEST';
    if (error.response?.status === 429) return 'RATE_LIMITED';
    if (error.response?.status >= 500) return 'SERVICE_ERROR';
    return 'UNKNOWN_ERROR';
  }

  private getErrorMessage(error: any): string {
    if (error.circuitBreakerOpen) {
      return 'Service temporarily unavailable due to high failure rate';
    }
    if (error.code === 'ETIMEDOUT') {
      return 'Request timed out - please try again';
    }
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    return error.message || 'An unexpected error occurred';
  }

  private getRetryInfo(error: any): any {
    const statusCode = error.status || error.statusCode || 500;
    
    if (error.circuitBreakerOpen) {
      return {
        retryable: true,
        retryAfterSeconds: 60,
        reason: 'Circuit breaker will reset automatically',
      };
    }
    
    if (statusCode === 429) {
      return {
        retryable: true,
        retryAfterSeconds: 60,
        reason: 'Rate limit will reset',
      };
    }
    
    if (statusCode >= 500 && statusCode !== 501) {
      return {
        retryable: true,
        retryAfterSeconds: 5,
        reason: 'Service error may be temporary',
      };
    }
    
    return {
      retryable: false,
      reason: 'Client error - check request and try again',
    };
  }

  private addErrorContext(transformed: any, error: any): void {
    const statusCode = error.status || error.statusCode || 500;
    
    if (statusCode === 404) {
      transformed.help = {
        message: 'The requested resource was not found',
        suggestions: [
          'Check the resource ID is correct',
          'Verify the resource exists',
          'Check your permissions',
        ],
      };
    } else if (statusCode === 400) {
      transformed.help = {
        message: 'The request was invalid',
        suggestions: [
          'Check required fields are provided',
          'Verify data formats are correct',
          'Review the API documentation',
        ],
      };
    } else if (statusCode === 429) {
      transformed.help = {
        message: 'Too many requests',
        suggestions: [
          'Reduce request frequency',
          'Implement exponential backoff',
          'Contact support for rate limit increases',
        ],
      };
    }
  }

  private transformListItem(item: any): any {
    // Apply standard transformations to list items
    const transformed = { ...item };
    this.removeInternalFields(transformed);
    this.formatMonetaryFields(transformed);
    return transformed;
  }
} 