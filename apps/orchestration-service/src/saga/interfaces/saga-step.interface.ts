export interface SagaContext {
  sagaId: string;
  aggregateId: string;
  aggregateType: string;
  sagaData: any;
  stepIndex: number;
  totalSteps: number;
  previousStepData?: any;
  correlationId?: string;
}

export interface SagaStepResult {
  success: boolean;
  data?: any;
  error?: string;
  shouldRetry?: boolean;
}

export abstract class SagaStep {
  abstract readonly stepName: string;
  abstract readonly maxRetries: number;
  abstract readonly timeout: number;

  /**
   * Execute the saga step
   */
  abstract execute(context: SagaContext): Promise<SagaStepResult>;

  /**
   * Compensate/rollback the saga step
   */
  abstract compensate(context: SagaContext): Promise<SagaStepResult>;

  /**
   * Check if this step can be compensated
   */
  canCompensate(context: SagaContext): boolean {
    return true;
  }

  /**
   * Get step timeout in milliseconds
   */
  getTimeout(): number {
    return this.timeout || 5000; // Default 5 seconds
  }

  /**
   * Create step data for tracking
   */
  protected createStepData(stepName: string, status: string, data?: any, error?: string) {
    return {
      stepName,
      status,
      data,
      error,
      executedAt: new Date(),
      retryCount: 0,
    };
  }
} 