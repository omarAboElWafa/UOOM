import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CacheInterceptor } from '@nestjs/cache-manager';

import { AuthGuard } from '../../common/guards/auth.guard';
import { EnhancedOrderSagaService } from '../enhanced-order-saga.service';
import { StepFunctionsSagaCoordinatorService } from '../step-functions/step-functions-saga-coordinator.service';

@Controller('saga-monitoring')
@ApiTags('saga-monitoring')
@UseGuards(AuthGuard)
export class SagaMonitoringController {
  constructor(
    private readonly enhancedSagaService: EnhancedOrderSagaService,
    private readonly hybridCoordinator: StepFunctionsSagaCoordinatorService,
  ) {}

  @Get('status/:orderId')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Get comprehensive saga status for an order' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Saga status retrieved' })
  @ApiResponse({ status: 404, description: 'Saga not found' })
  async getSagaStatus(@Param('orderId') orderId: string) {
    return this.enhancedSagaService.getEnhancedOrderSagaStatus(orderId);
  }

  @Get('metrics')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Get saga performance metrics' })
  @ApiQuery({ name: 'hours', required: false, type: 'number', description: 'Timeframe in hours' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved' })
  async getSagaMetrics(@Query('hours') hours?: number) {
    return this.enhancedSagaService.getSagaPerformanceMetrics(hours || 24);
  }

  @Get('executions')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'List running Step Functions executions' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @ApiResponse({ status: 200, description: 'Executions retrieved' })
  async getRunningExecutions(@Query('limit') limit?: number) {
    return this.hybridCoordinator.stepFunctionsService.listSagaExecutions(limit || 50);
  }

  @Get('orders/:orderId/sagas')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Get all sagas for an order with enhanced details' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Order sagas retrieved' })
  async getOrderSagas(@Param('orderId') orderId: string) {
    return this.enhancedSagaService.getOrderSagasWithDetails(orderId);
  }

  @Post('sagas/:sagaId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a running saga' })
  @ApiParam({ name: 'sagaId', description: 'Saga ID' })
  @ApiResponse({ status: 200, description: 'Saga cancelled' })
  @ApiResponse({ status: 404, description: 'Saga not found' })
  async cancelSaga(
    @Param('sagaId') sagaId: string,
    @Body() cancelData: { reason: string; orderId: string }
  ) {
    await this.enhancedSagaService.cancelOrderSaga(cancelData.orderId, cancelData.reason);
    
    return {
      sagaId,
      orderId: cancelData.orderId,
      status: 'cancelled',
      reason: cancelData.reason,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('monitoring/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger Step Functions monitoring sync' })
  @ApiResponse({ status: 200, description: 'Sync triggered' })
  async triggerMonitoringSync() {
    await this.hybridCoordinator.monitorStepFunctionExecutions();
    
    return {
      status: 'completed',
      message: 'Step Functions monitoring sync completed',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Get saga services health status' })
  @ApiResponse({ status: 200, description: 'Health status retrieved' })
  async getHealthStatus() {
    return this.enhancedSagaService.healthCheck();
  }

  @Get('analytics/trends')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Get saga execution trends and analytics' })
  @ApiQuery({ name: 'days', required: false, type: 'number' })
  @ApiResponse({ status: 200, description: 'Trends retrieved' })
  async getSagaTrends(@Query('days') days?: number) {
    const timeframeHours = (days || 7) * 24;
    const metrics = await this.enhancedSagaService.getSagaPerformanceMetrics(timeframeHours);
    
    return {
      timeframe: {
        days: days || 7,
        hours: timeframeHours,
      },
      trends: {
        executionModeDistribution: {
          stepFunctions: metrics.stepFunctionSagas,
          local: metrics.localSagas,
          stepFunctionsPercentage: metrics.totalSagas > 0 
            ? Math.round((metrics.stepFunctionSagas / metrics.totalSagas) * 100) 
            : 0,
        },
        performance: {
          successRate: metrics.successRate,
          averageDuration: metrics.avgDuration,
          totalSagas: metrics.totalSagas,
        },
        failureAnalysis: metrics.failureReasons,
        recommendations: metrics.recommendations,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('step-functions/state-machine')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Get Step Functions state machine health' })
  @ApiResponse({ status: 200, description: 'State machine status retrieved' })
  async getStateMachineStatus() {
    return this.hybridCoordinator.stepFunctionsService.healthCheck();
  }

  @Post('step-functions/state-machine/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update Step Functions state machine definition' })
  @ApiResponse({ status: 200, description: 'State machine updated' })
  async updateStateMachine() {
    await this.hybridCoordinator.stepFunctionsService.createOrUpdateStateMachine();
    
    return {
      status: 'updated',
      message: 'Step Functions state machine definition updated',
      timestamp: new Date().toISOString(),
    };
  }
} 