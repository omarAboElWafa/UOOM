import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, catchError, timeout } from 'rxjs';
import { CreateOrderDto } from '../order/dto/create-order.dto';
import {
  OptimizationRequest,
  OptimizationResponse,
  OptimizationOrder,
  OptimizationChannel,
  OptimizationWeights,
  OptimizationHealthResponse,
  FulfillmentChannel,
  OptimizationServiceException,
  NoAvailableChannelsException,
  OptimizationTimeoutException,
} from './optimization.types';

@Injectable()
export class OptimizationService {
  private readonly logger = new Logger(OptimizationService.name);
  private readonly optimizationServiceUrl: string;
  private readonly defaultTimeout: number;
  private readonly maxTimeout: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.optimizationServiceUrl = this.configService.get<string>(
      'OPTIMIZATION_SERVICE_URL',
      'http://localhost:8000'
    );
    this.defaultTimeout = this.configService.get<number>('OPTIMIZATION_TIMEOUT_MS', 150);
    this.maxTimeout = this.configService.get<number>('OPTIMIZATION_MAX_TIMEOUT_MS', 1000);
  }

  async optimize(
    order: CreateOrderDto,
    channels: FulfillmentChannel[]
  ): Promise<string> {
    const startTime = Date.now();
    const correlationId = order.correlationId || `order-${Date.now()}`;
    
    try {
      this.logger.debug('Starting optimization request', {
        orderId: order.customerId,
        channelsCount: channels.length,
        correlationId,
      });

      const request: OptimizationRequest = {
        orders: [this.mapOrderToOptimizationFormat(order)],
        channels: channels.map(this.mapChannelToOptimizationFormat),
        constraints: this.buildConstraints(order),
        weights: this.calculateWeights(order),
        timeout_seconds: this.defaultTimeout / 1000, // Convert to seconds
      };

      const response = await firstValueFrom(
        this.httpService.post<OptimizationResponse>(
          `${this.optimizationServiceUrl}/optimize`,
          request,
          {
            timeout: this.defaultTimeout + 50, // Add buffer for network overhead
            headers: {
              'Content-Type': 'application/json',
              'X-Correlation-ID': correlationId,
              'User-Agent': 'UOOM-Orchestration-Service',
            },
          }
        ).pipe(
          timeout(this.maxTimeout),
          catchError((error) => {
            this.logger.error('Optimization service error', {
              error: error.message,
              status: error.response?.status,
              data: error.response?.data,
              correlationId,
            });
            
            if (error.code === 'ECONNABORTED' || error.name === 'TimeoutError') {
              throw new OptimizationTimeoutException();
            }
            
            throw new OptimizationServiceException(
              error.response?.data?.detail || error.message
            );
          })
        )
      );

      const processingTime = Date.now() - startTime;
      
      this.logger.log('Optimization completed successfully', {
        orderId: order.customerId,
        correlationId,
        processingTime,
        solverTime: response.data.solve_time_ms,
        status: response.data.status,
        totalScore: response.data.total_score,
        assignmentsCount: Object.keys(response.data.assignments).length,
      });

      const assignedChannel = response.data.assignments[order.customerId];
      if (!assignedChannel) {
        throw new OptimizationServiceException('No channel assigned for order');
      }

      return assignedChannel;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Optimization failed, using fallback', {
        orderId: order.customerId,
        correlationId,
        processingTime,
        error: error.message,
      });

      return this.fallbackRouting(order, channels);
    }
  }

  async optimizeBatch(
    orders: CreateOrderDto[],
    channels: FulfillmentChannel[]
  ): Promise<Record<string, string>> {
    const startTime = Date.now();
    const correlationId = `batch-${Date.now()}`;
    
    try {
      this.logger.debug('Starting batch optimization request', {
        ordersCount: orders.length,
        channelsCount: channels.length,
        correlationId,
      });

      const request: OptimizationRequest = {
        orders: orders.map(this.mapOrderToOptimizationFormat),
        channels: channels.map(this.mapChannelToOptimizationFormat),
        constraints: this.buildBatchConstraints(orders),
        weights: this.calculateBatchWeights(orders),
        timeout_seconds: Math.min(this.defaultTimeout / 1000 * orders.length, 5), // Scale timeout with order count
      };

      const response = await firstValueFrom(
        this.httpService.post<OptimizationResponse>(
          `${this.optimizationServiceUrl}/optimize`,
          request,
          {
            timeout: this.maxTimeout,
            headers: {
              'Content-Type': 'application/json',
              'X-Correlation-ID': correlationId,
              'User-Agent': 'UOOM-Orchestration-Service',
            },
          }
        ).pipe(
          timeout(this.maxTimeout),
          catchError((error) => {
            this.logger.error('Batch optimization service error', {
              error: error.message,
              status: error.response?.status,
              data: error.response?.data,
              correlationId,
            });
            
            if (error.code === 'ECONNABORTED' || error.name === 'TimeoutError') {
              throw new OptimizationTimeoutException();
            }
            
            throw new OptimizationServiceException(
              error.response?.data?.detail || error.message
            );
          })
        )
      );

      const processingTime = Date.now() - startTime;
      
      this.logger.log('Batch optimization completed successfully', {
        ordersCount: orders.length,
        correlationId,
        processingTime,
        solverTime: response.data.solve_time_ms,
        status: response.data.status,
        totalScore: response.data.total_score,
        assignmentsCount: Object.keys(response.data.assignments).length,
      });

      return response.data.assignments;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Batch optimization failed, using fallback', {
        ordersCount: orders.length,
        correlationId,
        processingTime,
        error: error.message,
      });

      return this.fallbackBatchRouting(orders, channels);
    }
  }

  async healthCheck(): Promise<OptimizationHealthResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<OptimizationHealthResponse>(
          `${this.optimizationServiceUrl}/health`,
          {
            timeout: 2000,
            headers: {
              'User-Agent': 'UOOM-Orchestration-Service',
            },
          }
        ).pipe(
          catchError((error) => {
            this.logger.error('Optimization service health check failed', {
              error: error.message,
              status: error.response?.status,
            });
            throw new OptimizationServiceException('Health check failed');
          })
        )
      );

      return response.data;
    } catch (error) {
      throw new OptimizationServiceException(
        `Health check failed: ${error.message}`
      );
    }
  }

  async getMetrics(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.optimizationServiceUrl}/metrics`, {
          timeout: 5000,
          headers: {
            'User-Agent': 'UOOM-Orchestration-Service',
          },
        }).pipe(
          catchError((error) => {
            this.logger.error('Failed to get optimization metrics', {
              error: error.message,
            });
            throw new OptimizationServiceException('Failed to get metrics');
          })
        )
      );

      return response.data;
    } catch (error) {
      throw new OptimizationServiceException(
        `Failed to get metrics: ${error.message}`
      );
    }
  }

  private mapOrderToOptimizationFormat(order: CreateOrderDto): OptimizationOrder {
    // Calculate total weight from items (simplified calculation)
    const totalWeight = order.items.reduce((sum, item) => sum + (item.quantity * 0.5), 0);
    
    // Calculate total value for priority determination
    const totalValue = order.items.reduce((sum, item) => sum + item.totalPrice, 0);
    
    // Determine priority based on order value and explicit priority
    const priority = order.priority ? this.mapPriorityToNumber(order.priority) : 
                    totalValue > 100 ? 8 : totalValue > 50 ? 6 : 4;

    return {
      id: order.customerId,
      pickup_location: {
        lat: order.deliveryLocation.latitude, // Assuming restaurant location is same as pickup
        lng: order.deliveryLocation.longitude,
      },
      delivery_location: {
        lat: order.deliveryLocation.latitude,
        lng: order.deliveryLocation.longitude,
      },
      priority,
      max_delivery_time: 45, // 45 minutes default
      weight: Math.max(totalWeight, 0.5), // Minimum 0.5kg
      special_requirements: this.extractSpecialRequirements(order),
    };
  }

  private mapChannelToOptimizationFormat(channel: FulfillmentChannel): OptimizationChannel {
    return {
      id: channel.id,
      capacity: channel.capacity,
      current_load: channel.currentLoad,
      cost_per_order: channel.costPerOrder,
      quality_score: channel.qualityScore,
      prep_time_minutes: channel.prepTimeMinutes,
      location: {
        lat: channel.location.latitude,
        lng: channel.location.longitude,
      },
      vehicle_type: channel.vehicleType,
      max_distance: channel.maxDistance,
    };
  }

  private buildConstraints(order: CreateOrderDto): Record<string, any> {
    const totalValue = order.items.reduce((sum, item) => sum + item.totalPrice, 0);
    
    return {
      max_total_cost: totalValue * 1.1, // 10% buffer
      max_delivery_time: 45, // 45 minutes
      max_order_weight: 20, // 20kg max
      priority_boost: order.priority ? this.mapPriorityToNumber(order.priority) : 5,
    };
  }

  private buildBatchConstraints(orders: CreateOrderDto[]): Record<string, any> {
    const totalValue = orders.reduce((sum, order) => 
      sum + order.items.reduce((itemSum, item) => itemSum + item.totalPrice, 0), 0
    );
    
    return {
      max_total_cost: totalValue * 1.1,
      max_delivery_time: 60, // Longer for batch
      max_order_weight: 50, // Higher for batch
      batch_optimization: true,
    };
  }

  private calculateWeights(order: CreateOrderDto): OptimizationWeights {
    const totalValue = order.items.reduce((sum, item) => sum + item.totalPrice, 0);
    
    // Adjust weights based on order value and priority
    if (order.priority === 'HIGH' || totalValue > 100) {
      return {
        delivery_time: 0.7,
        cost: 0.2,
        quality: 0.1,
      };
    } else if (order.priority === 'LOW' || totalValue < 30) {
      return {
        delivery_time: 0.3,
        cost: 0.5,
        quality: 0.2,
      };
    } else {
      return {
        delivery_time: 0.5,
        cost: 0.3,
        quality: 0.2,
      };
    }
  }

  private calculateBatchWeights(orders: CreateOrderDto[]): OptimizationWeights {
    const avgValue = orders.reduce((sum, order) => 
      sum + order.items.reduce((itemSum, item) => itemSum + item.totalPrice, 0), 0
    ) / orders.length;
    
    if (avgValue > 75) {
      return {
        delivery_time: 0.6,
        cost: 0.25,
        quality: 0.15,
      };
    } else {
      return {
        delivery_time: 0.4,
        cost: 0.4,
        quality: 0.2,
      };
    }
  }

  private mapPriorityToNumber(priority: string): number {
    switch (priority) {
      case 'HIGH':
        return 9;
      case 'NORMAL':
        return 5;
      case 'LOW':
        return 2;
      default:
        return 5;
    }
  }

  private extractSpecialRequirements(order: CreateOrderDto): string[] {
    const requirements: string[] = [];
    
    if (order.specialInstructions) {
      requirements.push(order.specialInstructions);
    }
    
    // Check for fragile items
    const hasFragileItems = order.items.some(item => 
      item.specialInstructions?.toLowerCase().includes('fragile') ||
      item.name.toLowerCase().includes('glass') ||
      item.name.toLowerCase().includes('ceramic')
    );
    
    if (hasFragileItems) {
      requirements.push('fragile');
    }
    
    // Check for temperature-sensitive items
    const hasTemperatureSensitiveItems = order.items.some(item => 
      item.name.toLowerCase().includes('ice cream') ||
      item.name.toLowerCase().includes('frozen') ||
      item.name.toLowerCase().includes('hot')
    );
    
    if (hasTemperatureSensitiveItems) {
      requirements.push('temperature_controlled');
    }
    
    return requirements;
  }

  private fallbackRouting(order: CreateOrderDto, channels: FulfillmentChannel[]): string {
    this.logger.warn('Using fallback routing', {
      orderId: order.customerId,
      channelsCount: channels.length,
    });

    // Filter active channels with available capacity
    const availableChannels = channels.filter(c => 
      c.isActive && c.availableCapacity > 0
    );

    if (availableChannels.length === 0) {
      throw new NoAvailableChannelsException();
    }

    // Sort by available capacity (highest first) and quality score
    const sortedChannels = availableChannels.sort((a, b) => {
      const capacityDiff = b.availableCapacity - a.availableCapacity;
      if (Math.abs(capacityDiff) > 2) {
        return capacityDiff;
      }
      return b.qualityScore - a.qualityScore;
    });

    const selectedChannel = sortedChannels[0];
    
    this.logger.log('Fallback channel selected', {
      orderId: order.customerId,
      channelId: selectedChannel.id,
      availableCapacity: selectedChannel.availableCapacity,
      qualityScore: selectedChannel.qualityScore,
    });

    return selectedChannel.id;
  }

  private fallbackBatchRouting(
    orders: CreateOrderDto[],
    channels: FulfillmentChannel[]
  ): Record<string, string> {
    this.logger.warn('Using fallback batch routing', {
      ordersCount: orders.length,
      channelsCount: channels.length,
    });

    const assignments: Record<string, string> = {};
    const availableChannels = channels.filter(c => c.isActive && c.availableCapacity > 0);

    if (availableChannels.length === 0) {
      throw new NoAvailableChannelsException();
    }

    // Simple round-robin assignment with capacity checking
    let channelIndex = 0;
    const channelLoads = new Map<string, number>();
    
    for (const order of orders) {
      let assigned = false;
      let attempts = 0;
      
      while (!assigned && attempts < availableChannels.length) {
        const channel = availableChannels[channelIndex % availableChannels.length];
        const currentLoad = channelLoads.get(channel.id) || channel.currentLoad;
        
        if (currentLoad < channel.capacity) {
          assignments[order.customerId] = channel.id;
          channelLoads.set(channel.id, currentLoad + 1);
          assigned = true;
        }
        
        channelIndex++;
        attempts++;
      }
      
      if (!assigned) {
        // If no channel available, assign to first channel
        assignments[order.customerId] = availableChannels[0].id;
      }
    }

    this.logger.log('Fallback batch assignments completed', {
      ordersCount: orders.length,
      assignmentsCount: Object.keys(assignments).length,
    });

    return assignments;
  }
} 