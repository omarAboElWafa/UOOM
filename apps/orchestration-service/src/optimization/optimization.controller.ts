import { Controller, Get, Post, Body, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { OptimizationService } from './optimization.service';
import { CreateOrderDto } from '../order/dto/create-order.dto';
import { OptimizationHealthResponse } from './optimization.types';

@ApiTags('Optimization')
@Controller('optimization')
export class OptimizationController {
  private readonly logger = new Logger(OptimizationController.name);

  constructor(private readonly optimizationService: OptimizationService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check optimization service health' })
  @ApiResponse({ 
    status: 200, 
    description: 'Optimization service health status',
    type: OptimizationHealthResponse 
  })
  @ApiResponse({ status: 503, description: 'Optimization service unavailable' })
  async healthCheck(): Promise<OptimizationHealthResponse> {
    try {
      return await this.optimizationService.healthCheck();
    } catch (error) {
      this.logger.error('Health check failed', { error: error.message });
      throw new HttpException(
        'Optimization service unavailable',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get optimization service metrics' })
  @ApiResponse({ status: 200, description: 'Optimization service metrics' })
  @ApiResponse({ status: 503, description: 'Optimization service unavailable' })
  async getMetrics(): Promise<any> {
    try {
      return await this.optimizationService.getMetrics();
    } catch (error) {
      this.logger.error('Failed to get metrics', { error: error.message });
      throw new HttpException(
        'Failed to get optimization metrics',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  @Post('test')
  @ApiOperation({ summary: 'Test optimization with sample data' })
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({ status: 200, description: 'Optimization test result' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 503, description: 'Optimization service unavailable' })
  async testOptimization(@Body() order: CreateOrderDto): Promise<{ channelId: string; processingTime: number }> {
    const startTime = Date.now();
    
    try {
      // Mock channels for testing
      const mockChannels = [
        {
          id: 'channel-1',
          name: 'Express Delivery',
          type: 'express',
          capacity: 10,
          currentLoad: 3,
          availableCapacity: 7,
          costPerOrder: 5.0,
          qualityScore: 95,
          prepTimeMinutes: 25,
          location: {
            latitude: order.deliveryLocation.latitude + 0.01,
            longitude: order.deliveryLocation.longitude + 0.01,
          },
          vehicleType: 'motorcycle',
          maxDistance: 15.0,
          isActive: true,
        },
        {
          id: 'channel-2',
          name: 'Standard Delivery',
          type: 'standard',
          capacity: 20,
          currentLoad: 8,
          availableCapacity: 12,
          costPerOrder: 3.0,
          qualityScore: 88,
          prepTimeMinutes: 30,
          location: {
            latitude: order.deliveryLocation.latitude - 0.01,
            longitude: order.deliveryLocation.longitude - 0.01,
          },
          vehicleType: 'car',
          maxDistance: 30.0,
          isActive: true,
        },
        {
          id: 'channel-3',
          name: 'Premium Delivery',
          type: 'premium',
          capacity: 5,
          currentLoad: 1,
          availableCapacity: 4,
          costPerOrder: 8.0,
          qualityScore: 98,
          prepTimeMinutes: 20,
          location: {
            latitude: order.deliveryLocation.latitude,
            longitude: order.deliveryLocation.longitude,
          },
          vehicleType: 'luxury_car',
          maxDistance: 25.0,
          isActive: true,
        },
      ];

      const channelId = await this.optimizationService.optimize(order, mockChannels);
      const processingTime = Date.now() - startTime;

      this.logger.log('Optimization test completed', {
        orderId: order.customerId,
        channelId,
        processingTime,
      });

      return {
        channelId,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Optimization test failed', {
        orderId: order.customerId,
        processingTime,
        error: error.message,
      });

      throw new HttpException(
        `Optimization test failed: ${error.message}`,
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }
} 