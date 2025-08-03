import { Injectable, Logger } from '@nestjs/common';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  timeout: number;
  successThreshold: number;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  private readonly defaultOptions: CircuitBreakerOptions = {
    failureThreshold: 5,
    timeout: 60000, // 1 minute
    successThreshold: 3,
  };

  async execute<T>(
    operation: () => Promise<T>,
    options: Partial<CircuitBreakerOptions> = {}
  ): Promise<T> {
    const config = { ...this.defaultOptions, ...options };

    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset(config.timeout)) {
        this.state = CircuitState.HALF_OPEN;
        this.logger.log('Circuit breaker transitioning to HALF_OPEN');
      } else {
        throw new Error('Circuit breaker is OPEN - operation blocked');
      }
    }

    try {
      const result = await operation();
      this.onSuccess(config);
      return result;
    } catch (error) {
      this.onFailure(config);
      throw error;
    }
  }

  private onSuccess(options: CircuitBreakerOptions): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= options.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        this.logger.log('Circuit breaker transitioning to CLOSED');
      }
    }
  }

  private onFailure(options: CircuitBreakerOptions): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.successCount = 0;
      this.logger.warn('Circuit breaker transitioning to OPEN (from HALF_OPEN)');
    } else if (this.failureCount >= options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.logger.warn('Circuit breaker transitioning to OPEN');
    }
  }

  private shouldAttemptReset(timeout: number): boolean {
    return Date.now() - this.lastFailureTime >= timeout;
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.logger.log('Circuit breaker manually reset');
  }
} 