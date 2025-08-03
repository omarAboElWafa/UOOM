import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CreateOrderDto } from './dto/create-order.dto';
import { OptimizationService as NewOptimizationService } from '../optimization/optimization.service';
import { FulfillmentChannel } from '../optimization/optimization.types';

// Legacy interfaces for backward compatibility
export interface OptimizationRequest {
  order: CreateOrderDto;
  channels: string[];
  constraints: {
    maxDeliveryTime: number;
    maxCost: number;
    priority: string;
  };
}

export interface OptimizationResponse {
  optimalChannel: string;
  score: number;
  reasoning: string;
  estimatedDeliveryTime: number;
  estimatedCost: number;
}

@Injectable()
export class OptimizationService {
  private readonly logger = new Logger(OptimizationService.name);
  private readonly optimizationServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly newOptimizationService: NewOptimizationService,
  ) {
    this.optimizationServiceUrl = this.configService.get<string>(
      'OPTIMIZATION_SERVICE_URL',
      'http://localhost:8000'
    );
  }

  async optimize(order: CreateOrderDto, channels: string[]): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Convert string channels to FulfillmentChannel objects for the new service
      const fulfillmentChannels: FulfillmentChannel[] = channels.map((channelId, index) => ({
        id: channelId,
        name: `Channel ${index + 1}`,
        type: 'standard',
        capacity: 10,
        currentLoad: 0,
        availableCapacity: 10,
        costPerOrder: 5.0,
        qualityScore: 85,
        prepTimeMinutes: 30,
        location: {
          latitude: order.deliveryLocation.latitude + (index * 0.01),
          longitude: order.deliveryLocation.longitude + (index * 0.01),
        },
        vehicleType: 'car',
        maxDistance: 25.0,
        isActive: true,
      }));

      // Use the new optimization service
      const result = await this.newOptimizationService.optimize(order, fulfillmentChannels);
      
      const processingTime = Date.now() - startTime;
      
      this.logger.log(`Optimization completed in ${processingTime}ms`, {
        orderId: order.customerId,
        optimalChannel: result,
        processingTime,
      });

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error(`Optimization failed: ${error.message}`, {
        orderId: order.customerId,
        channelsCount: channels.length,
        processingTime,
        error: error.response?.data || error.message,
      });

      // Fallback to first available channel
      if (channels.length > 0) {
        this.logger.warn(`Using fallback channel: ${channels[0]}`, {
          orderId: order.customerId,
        });
        return channels[0];
      }

      throw new Error(`Optimization failed and no fallback channels available: ${error.message}`);
    }
  }

  async getOptimizationMetrics(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.optimizationServiceUrl}/metrics`)
      );
      return (response as any).data;
    } catch (error) {
      this.logger.error(`Failed to get optimization metrics: ${error.message}`);
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.optimizationServiceUrl}/health`, {
          timeout: 2000,
        })
      );
      return (response as any).status === 200;
    } catch (error) {
      this.logger.error(`Optimization service health check failed: ${error.message}`);
      return false;
    }
  }
} 