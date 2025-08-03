import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { firstValueFrom, timeout, catchError } from 'rxjs';

import { CircuitBreakerService } from '../../common/circuit-breaker/circuit-breaker.service';
import { ServiceDiscoveryService } from './service-discovery.service';

export interface ProxyRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  service: string;
  path: string;
  data?: any;
  headers?: Record<string, string>;
  timeout?: number;
  cacheTtl?: number;
  retryCount?: number;
}

export interface ProxyResponse {
  data: any;
  status: number;
  headers: Record<string, string>;
  fromCache?: boolean;
}

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);
  
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly serviceDiscovery: ServiceDiscoveryService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async proxyRequest(options: ProxyRequestOptions): Promise<ProxyResponse> {
    const {
      method,
      service,
      path,
      data,
      headers = {},
      timeout: requestTimeout = 10000,
      cacheTtl,
      retryCount = 0,
    } = options;

    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(method, service, path, data);

    try {
      // Check cache for GET requests
      if (method === 'GET' && cacheTtl) {
        const cachedResponse = await this.getCachedResponse(cacheKey);
        if (cachedResponse) {
          this.logger.debug(`Cache HIT for ${service}${path}`, {
            cacheKey,
            processingTime: Date.now() - startTime,
          });
          return { ...cachedResponse, fromCache: true };
        }
      }

      // Get service URL from service discovery
      const serviceUrl = await this.serviceDiscovery.getServiceUrl(service);
      const fullUrl = `${serviceUrl}${path}`;

      this.logger.debug(`Proxying ${method} request to ${service}`, {
        url: fullUrl,
        headers: this.sanitizeHeaders(headers),
      });

      // Execute request with circuit breaker
      const response = await this.circuitBreaker.execute(
        async () => {
          const axiosResponse = await firstValueFrom(
            this.httpService.request({
              method,
              url: fullUrl,
              data,
              headers: {
                ...headers,
                'User-Agent': 'UOOP-API-Gateway/1.0.0',
                'X-Forwarded-By': 'api-gateway',
              },
              timeout: requestTimeout,
              validateStatus: (status) => status < 500, // Don't throw on 4xx errors
            }).pipe(
              timeout(requestTimeout),
              catchError((error) => {
                this.logger.error(`Request failed to ${service}`, {
                  url: fullUrl,
                  error: error.message,
                  status: error.response?.status,
                });
                throw error;
              })
            )
          );

          return axiosResponse;
        },
        {
          serviceName: service,
          timeout: requestTimeout,
        }
      );

      const proxyResponse: ProxyResponse = {
        data: response.data,
        status: response.status,
        headers: this.extractResponseHeaders(response.headers),
      };

      // Cache successful GET responses
      if (method === 'GET' && cacheTtl && response.status === 200) {
        await this.cacheResponse(cacheKey, proxyResponse, cacheTtl);
      }

      const processingTime = Date.now() - startTime;
      this.logger.log(`Request proxied successfully to ${service}`, {
        method,
        path,
        status: response.status,
        processingTime,
      });

      // Track metrics
      this.trackMetrics(service, method, response.status, processingTime);

      return proxyResponse;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error(`Proxy request failed to ${service}`, {
        method,
        path,
        error: error.message,
        processingTime,
        retryCount,
      });

      // Track error metrics
      this.trackMetrics(service, method, error.response?.status || 500, processingTime, true);

      // Retry logic for retriable errors
      if (this.isRetriableError(error) && retryCount < 2) {
        this.logger.warn(`Retrying request to ${service}`, {
          retryAttempt: retryCount + 1,
        });
        
        await this.delay(Math.pow(2, retryCount) * 1000); // Exponential backoff
        
        return this.proxyRequest({
          ...options,
          retryCount: retryCount + 1,
        });
      }

      // Transform error for client
      throw this.transformError(error, service);
    }
  }

  private generateCacheKey(method: string, service: string, path: string, data?: any): string {
    const dataHash = data ? this.hashObject(data) : '';
    return `gateway:${service}:${method}:${path}:${dataHash}`;
  }

  private async getCachedResponse(cacheKey: string): Promise<ProxyResponse | null> {
    try {
      return await this.cacheManager.get<ProxyResponse>(cacheKey);
    } catch (error) {
      this.logger.warn(`Cache retrieval failed`, { cacheKey, error: error.message });
      return null;
    }
  }

  private async cacheResponse(cacheKey: string, response: ProxyResponse, ttl: number): Promise<void> {
    try {
      await this.cacheManager.set(cacheKey, response, ttl * 1000);
      this.logger.debug(`Response cached`, { cacheKey, ttl });
    } catch (error) {
      this.logger.warn(`Cache storage failed`, { cacheKey, error: error.message });
    }
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized = { ...headers };
    // Remove sensitive headers from logs
    if (sanitized.authorization) sanitized.authorization = '[REDACTED]';
    if (sanitized.cookie) sanitized.cookie = '[REDACTED]';
    return sanitized;
  }

  private extractResponseHeaders(headers: any): Record<string, string> {
    // Extract important headers to pass through
    const passThroughHeaders: Record<string, string> = {};
    
    const headerKeys = [
      'content-type',
      'cache-control',
      'etag',
      'x-correlation-id',
      'x-request-id',
    ];

    headerKeys.forEach(key => {
      if (headers[key]) {
        passThroughHeaders[key] = headers[key];
      }
    });

    return passThroughHeaders;
  }

  private isRetriableError(error: any): boolean {
    // Retry on network errors, timeouts, and 5xx errors
    return (
      !error.response || // Network error
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      (error.response.status >= 500 && error.response.status !== 501)
    );
  }

  private transformError(error: any, service: string): HttpException {
    if (error.response) {
      // HTTP error from downstream service
      return new HttpException(
        {
          message: error.response.data?.message || 'Downstream service error',
          error: error.response.data?.error || 'Service Error',
          statusCode: error.response.status,
          service,
          timestamp: new Date().toISOString(),
        },
        error.response.status
      );
    } else if (error.code === 'ETIMEDOUT') {
      // Timeout error
      return new HttpException(
        {
          message: `Request to ${service} timed out`,
          error: 'Gateway Timeout',
          statusCode: 504,
          service,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.GATEWAY_TIMEOUT
      );
    } else {
      // Network or other error
      return new HttpException(
        {
          message: `Service ${service} is unavailable`,
          error: 'Service Unavailable',
          statusCode: 503,
          service,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private hashObject(obj: any): string {
    // Simple hash function for cache keys
    return Buffer.from(JSON.stringify(obj)).toString('base64').slice(0, 16);
  }

  private trackMetrics(
    service: string,
    method: string,
    status: number,
    duration: number,
    isError = false
  ): void {
    // In production, this would send metrics to Prometheus/CloudWatch
    const metric = {
      service,
      method,
      status,
      duration,
      isError,
      timestamp: new Date().toISOString(),
    };

    this.logger.debug('Gateway metrics', metric);

    // Track SLA violations
    if (duration > 2000) {
      this.logger.warn('SLA violation detected', {
        ...metric,
        threshold: '2s',
        violation: 'P99 latency exceeded',
      });
    }
  }
} 