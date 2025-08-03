import { Injectable, Logger } from '@nestjs/common';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  timeout?: number;
  successThreshold?: number;
  serviceName?: string;
}

interface ServiceStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly serviceStats = new Map<string, ServiceStats>();

  private readonly defaultOptions: Required<Omit<CircuitBreakerOptions, 'serviceName'>> = {
    failureThreshold: 5,
    timeout: 60000, // 1 minute
    successThreshold: 3,
  };

  async execute<T>(
    operation: () => Promise<T>,
    options: CircuitBreakerOptions = {}
  ): Promise<T> {
    const serviceName = options.serviceName || 'default';
    const config = { ...this.defaultOptions, ...options };
    
    const stats = this.getOrCreateStats(serviceName);

    if (stats.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset(stats, config.timeout)) {
        stats.state = CircuitState.HALF_OPEN;
        stats.successCount = 0;
        this.logger.log(`Circuit breaker for ${serviceName} transitioning to HALF_OPEN`);
      } else {
        const error = new Error(`Circuit breaker is OPEN for service ${serviceName}`);
        (error as any).circuitBreakerOpen = true;
        throw error;
      }
    }

    try {
      const result = await operation();
      this.onSuccess(serviceName, config);
      return result;
    } catch (error) {
      this.onFailure(serviceName, config);
      throw error;
    }
  }

  private getOrCreateStats(serviceName: string): ServiceStats {
    if (!this.serviceStats.has(serviceName)) {
      this.serviceStats.set(serviceName, {
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
        lastSuccessTime: 0,
      });
    }
    return this.serviceStats.get(serviceName)!;
  }

  private onSuccess(serviceName: string, options: Required<Omit<CircuitBreakerOptions, 'serviceName'>>): void {
    const stats = this.getOrCreateStats(serviceName);
    
    stats.failureCount = 0;
    stats.lastSuccessTime = Date.now();

    if (stats.state === CircuitState.HALF_OPEN) {
      stats.successCount++;
      if (stats.successCount >= options.successThreshold) {
        stats.state = CircuitState.CLOSED;
        stats.successCount = 0;
        this.logger.log(`Circuit breaker for ${serviceName} transitioning to CLOSED`);
      }
    }
  }

  private onFailure(serviceName: string, options: Required<Omit<CircuitBreakerOptions, 'serviceName'>>): void {
    const stats = this.getOrCreateStats(serviceName);
    
    stats.failureCount++;
    stats.lastFailureTime = Date.now();

    if (stats.state === CircuitState.HALF_OPEN) {
      stats.state = CircuitState.OPEN;
      stats.successCount = 0;
      this.logger.warn(`Circuit breaker for ${serviceName} transitioning to OPEN (from HALF_OPEN)`);
    } else if (stats.failureCount >= options.failureThreshold) {
      stats.state = CircuitState.OPEN;
      this.logger.warn(`Circuit breaker for ${serviceName} transitioning to OPEN (threshold reached)`);
    }
  }

  private shouldAttemptReset(stats: ServiceStats, timeout: number): boolean {
    return Date.now() - stats.lastFailureTime >= timeout;
  }

  getState(serviceName: string = 'default'): CircuitState {
    return this.getOrCreateStats(serviceName).state;
  }

  getMetrics(serviceName: string = 'default') {
    const stats = this.getOrCreateStats(serviceName);
    return {
      serviceName,
      state: stats.state,
      failureCount: stats.failureCount,
      successCount: stats.successCount,
      lastFailureTime: stats.lastFailureTime,
      lastSuccessTime: stats.lastSuccessTime,
    };
  }

  getAllMetrics() {
    const allMetrics: any[] = [];
    for (const [serviceName, stats] of this.serviceStats.entries()) {
      allMetrics.push({
        serviceName,
        state: stats.state,
        failureCount: stats.failureCount,
        successCount: stats.successCount,
        lastFailureTime: stats.lastFailureTime,
        lastSuccessTime: stats.lastSuccessTime,
      });
    }
    return allMetrics;
  }

  reset(serviceName: string = 'default'): void {
    const stats = this.getOrCreateStats(serviceName);
    stats.state = CircuitState.CLOSED;
    stats.failureCount = 0;
    stats.successCount = 0;
    stats.lastFailureTime = 0;
    stats.lastSuccessTime = 0;
    this.logger.log(`Circuit breaker for ${serviceName} manually reset`);
  }

  resetAll(): void {
    for (const serviceName of this.serviceStats.keys()) {
      this.reset(serviceName);
    }
  }
} 