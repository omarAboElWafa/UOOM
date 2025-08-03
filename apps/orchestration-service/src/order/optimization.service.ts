import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CreateOrderDto } from './dto/create-order.dto';

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
  ) {
    this.optimizationServiceUrl = this.configService.get<string>(
      'OPTIMIZATION_SERVICE_URL',
      'http://localhost:8001'
    );
  }

  async optimize(order: CreateOrderDto, channels: string[]): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Calculate total from items
      const total = order.items.reduce((sum, item) => sum + item.totalPrice, 0);
      
      const request: OptimizationRequest = {
        order,
        channels,
        constraints: {
          maxDeliveryTime: 45 * 60, // 45 minutes in seconds
          maxCost: total * 1.1, // 10% buffer
          priority: order.priority || 'NORMAL',
        },
      };

      this.logger.debug(`Sending optimization request`, {
        orderId: order.customerId,
        channelsCount: channels.length,
        constraints: request.constraints,
      });

      const response = await firstValueFrom(
        this.httpService.post<OptimizationResponse>(
          `${this.optimizationServiceUrl}/optimize`,
          request,
          {
            timeout: 5000, // 5 second timeout
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'UOOP-Orchestration-Service',
            },
          }
        )
      );

      const processingTime = Date.now() - startTime;
      const responseData = (response as any).data as OptimizationResponse;
      
      this.logger.log(`Optimization completed in ${processingTime}ms`, {
        orderId: order.customerId,
        optimalChannel: responseData.optimalChannel,
        score: responseData.score,
        estimatedDeliveryTime: responseData.estimatedDeliveryTime,
        estimatedCost: responseData.estimatedCost,
        processingTime,
      });

      return responseData.optimalChannel;
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