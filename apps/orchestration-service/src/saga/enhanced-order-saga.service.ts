import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OrderSagaService, OrderSagaData } from './order-saga.service';
import { StepFunctionsSagaCoordinatorService, HybridSagaOptions } from './step-functions/step-functions-saga-coordinator.service';

export interface EnhancedSagaResult {
  sagaId: string;
  executionArn?: string;
  executionMode: 'stepfunctions' | 'local';
  estimatedDuration?: number;
  canFallback: boolean;
}

export interface SagaExecutionOptions {
  preferStepFunctions?: boolean;
  allowFallback?: boolean;
  asyncExecution?: boolean;
  priority?: 'high' | 'normal' | 'low';
  timeout?: number;
}

@Injectable()
export class EnhancedOrderSagaService implements OnModuleInit {
  private readonly logger = new Logger(EnhancedOrderSagaService.name);
  private readonly defaultUseStepFunctions: boolean;

  constructor(
    private readonly localOrderSagaService: OrderSagaService,
    private readonly hybridSagaCoordinator: StepFunctionsSagaCoordinatorService,
    private readonly configService: ConfigService,
  ) {
    this.defaultUseStepFunctions = this.configService.get('USE_STEP_FUNCTIONS_DEFAULT', 'true') === 'true';
  }

  onModuleInit() {
    this.logger.log('Enhanced Order Saga Service initialized', {
      defaultUseStepFunctions: this.defaultUseStepFunctions,
    });
  }

  /**
   * Start order processing saga with intelligent orchestration selection
   */
  async startOrderProcessingSaga(
    orderId: string,
    sagaData: OrderSagaData,
    correlationId?: string,
    options: SagaExecutionOptions = {}
  ): Promise<EnhancedSagaResult> {
    const startTime = Date.now();
    
    this.logger.log('Starting enhanced order processing saga', {
      orderId,
      correlationId,
      options,
    });

    // Determine execution strategy
    const executionStrategy = this.determineExecutionStrategy(sagaData, options);
    
    try {
      if (executionStrategy.useStepFunctions) {
        // Use hybrid coordinator for Step Functions execution
        const result = await this.hybridSagaCoordinator.startHybridSaga({
          sagaType: 'ORDER_PROCESSING',
          aggregateId: orderId,
          aggregateType: 'Order',
          sagaData: {
            ...sagaData,
            orderId,
          },
          correlationId,
        }, {
          useStepFunctions: true,
          fallbackToLocal: options.allowFallback ?? true,
          asyncExecution: options.asyncExecution ?? false,
        });

        const duration = Date.now() - startTime;
        
        this.logger.log('Enhanced saga started', {
          sagaId: result.sagaId,
          executionArn: result.executionArn,
          executionMode: result.executionMode,
          duration,
          orderId,
          correlationId,
        });

        return {
          sagaId: result.sagaId,
          executionArn: result.executionArn,
          executionMode: result.executionMode,
          estimatedDuration: this.estimateSagaDuration(sagaData, result.executionMode),
          canFallback: options.allowFallback ?? true,
        };
      } else {
        // Use local saga execution
        const sagaId = await this.localOrderSagaService.startOrderProcessingSaga(
          orderId,
          sagaData,
          correlationId
        );

        const duration = Date.now() - startTime;
        
        this.logger.log('Local saga started', {
          sagaId,
          duration,
          orderId,
          correlationId,
        });

        return {
          sagaId,
          executionMode: 'local',
          estimatedDuration: this.estimateSagaDuration(sagaData, 'local'),
          canFallback: false,
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Failed to start enhanced saga', {
        orderId,
        error: error.message,
        duration,
        correlationId,
        executionStrategy,
      });
      
      throw error;
    }
  }

  /**
   * Get comprehensive saga status with Step Functions integration
   */
  async getEnhancedOrderSagaStatus(orderId: string) {
    const localSagaStatus = await this.localOrderSagaService.getOrderSagaStatus(orderId);
    
    if (!localSagaStatus) {
      return null;
    }

    // Get hybrid status if saga has Step Functions execution
    const hybridStatus = await this.hybridSagaCoordinator.getHybridSagaStatus(localSagaStatus.id);
    
    return {
      orderId,
      saga: localSagaStatus,
      hybridExecution: hybridStatus,
      executionMode: hybridStatus.executionMode,
      overallStatus: hybridStatus.overallStatus,
      stepFunctionExecution: hybridStatus.stepFunctionExecution,
      canRetry: localSagaStatus.canRetry,
      completedSteps: localSagaStatus.completedSteps,
      failedSteps: localSagaStatus.failedSteps,
    };
  }

  /**
   * Cancel order saga with hybrid support
   */
  async cancelOrderSaga(orderId: string, reason: string): Promise<void> {
    const sagaStatus = await this.getEnhancedOrderSagaStatus(orderId);
    
    if (!sagaStatus) {
      throw new Error(`No saga found for order ${orderId}`);
    }

    if (sagaStatus.executionMode === 'stepfunctions') {
      await this.hybridSagaCoordinator.cancelHybridSaga(sagaStatus.saga.id, reason);
    } else {
      // For local sagas, we need to implement cancellation logic
      // This would involve stopping the current execution and running compensation
      this.logger.warn('Local saga cancellation not yet implemented', {
        orderId,
        sagaId: sagaStatus.saga.id,
        reason,
      });
    }
  }

  /**
   * Get saga performance metrics
   */
  async getSagaPerformanceMetrics(timeframeHours = 24) {
    const hybridMetrics = await this.hybridSagaCoordinator.getSagaMetrics(timeframeHours);
    
    return {
      ...hybridMetrics,
      recommendations: this.generatePerformanceRecommendations(hybridMetrics),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get all sagas for an order with enhanced details
   */
  async getOrderSagasWithDetails(orderId: string) {
    const localSagas = await this.localOrderSagaService.getOrderSagas(orderId);
    
    const detailedSagas = await Promise.all(
      localSagas.map(async (saga) => {
        const hybridStatus = await this.hybridSagaCoordinator.getHybridSagaStatus(saga.id);
        return {
          ...saga,
          hybridStatus,
          executionMode: hybridStatus.executionMode,
          stepFunctionExecution: hybridStatus.stepFunctionExecution,
        };
      })
    );

    return detailedSagas;
  }

  /**
   * Health check for enhanced saga services
   */
  async healthCheck() {
    const checks = await Promise.allSettled([
      this.hybridSagaCoordinator.stepFunctionsService.healthCheck(),
      // Local saga coordinator health (if available)
      Promise.resolve({ status: 'healthy', details: { type: 'local' } }),
    ]);

    return {
      stepFunctions: checks[0].status === 'fulfilled' ? checks[0].value : { status: 'unhealthy' },
      localSaga: checks[1].status === 'fulfilled' ? checks[1].value : { status: 'unhealthy' },
      overall: checks.every(check => 
        check.status === 'fulfilled' && 
        (check.value as any).status === 'healthy'
      ) ? 'healthy' : 'degraded',
    };
  }

  private determineExecutionStrategy(
    sagaData: OrderSagaData, 
    options: SagaExecutionOptions
  ): { useStepFunctions: boolean; reason: string } {
    // Priority-based decision making
    if (options.preferStepFunctions === false) {
      return { useStepFunctions: false, reason: 'explicitly_disabled' };
    }

    if (options.preferStepFunctions === true) {
      return { useStepFunctions: true, reason: 'explicitly_enabled' };
    }

    // Intelligent decision based on order characteristics
    const orderValue = sagaData.totalAmount;
    const isHighPriority = options.priority === 'high';
    const hasComplexRequirements = sagaData.items.length > 5;
    
    // Use Step Functions for:
    // 1. High-value orders (better reliability & monitoring)
    // 2. High-priority orders (better observability)
    // 3. Complex orders (better error handling)
    // 4. Default configuration
    
    if (orderValue > 100 || isHighPriority || hasComplexRequirements) {
      return { useStepFunctions: true, reason: 'order_characteristics' };
    }

    return { 
      useStepFunctions: this.defaultUseStepFunctions, 
      reason: 'default_configuration' 
    };
  }

  private estimateSagaDuration(sagaData: OrderSagaData, executionMode: 'stepfunctions' | 'local'): number {
    // Base duration estimates (in milliseconds)
    const baseDuration = 5000; // 5 seconds
    const stepFunctionsOverhead = 2000; // 2 seconds additional for Step Functions
    const itemComplexityFactor = sagaData.items.length * 100; // 100ms per item
    
    let estimatedDuration = baseDuration + itemComplexityFactor;
    
    if (executionMode === 'stepfunctions') {
      estimatedDuration += stepFunctionsOverhead;
    }
    
    return estimatedDuration;
  }

  private generatePerformanceRecommendations(metrics: any): string[] {
    const recommendations: string[] = [];
    
    if (metrics.successRate < 95) {
      recommendations.push('Consider reviewing saga step implementations to improve success rate');
    }
    
    if (metrics.avgDuration > 30000) {
      recommendations.push('Saga execution time is high, consider optimizing step implementations');
    }
    
    const stepFunctionRatio = metrics.stepFunctionSagas / metrics.totalSagas;
    if (stepFunctionRatio < 0.5) {
      recommendations.push('Consider using Step Functions for more sagas to improve observability');
    }
    
    if (Object.keys(metrics.failureReasons).length > 3) {
      recommendations.push('Multiple failure patterns detected, review error handling strategies');
    }
    
    return recommendations;
  }
} 