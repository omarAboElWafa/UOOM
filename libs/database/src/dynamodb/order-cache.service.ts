import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClientService } from './dynamodb-client.service';
import { OrderStatus } from '@calo/shared';

export interface OrderStatusCache {
  orderId: string;
  status: OrderStatus;
  estimatedDeliveryTime?: string; // ISO string for DynamoDB
  trackingCode?: string;
  customerId: string;
  restaurantId: string;
  channelId: string;
  totalAmount: number;
  updatedAt: string; // ISO string
  ttl: number; // Unix timestamp for DynamoDB TTL
}

export interface OrderStatusResponse {
  id: string;
  status: OrderStatus;
  estimatedDeliveryTime?: Date;
  trackingCode?: string;
  updatedAt: Date;
}

export interface OrderDetailCache extends OrderStatusCache {
  // Additional fields for full order caching
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  deliveryLocation: {
    latitude: number;
    longitude: number;
    address: string;
  };
  specialInstructions?: string;
  createdAt: string;
}

@Injectable()
export class OrderCacheService {
  private readonly logger = new Logger(OrderCacheService.name);
  private readonly statusTableName = 'order-status';
  private readonly detailTableName = 'order-details';
  private readonly ttlHours: number;

  constructor(
    private readonly dynamoService: DynamoDBClientService,
    private readonly configService: ConfigService,
  ) {
    this.ttlHours = this.configService.get('ORDER_CACHE_TTL_HOURS', 72); // 3 days default
  }

  /**
   * Get order status from cache (optimized for <5ms response)
   */
  async getOrderStatus(orderId: string): Promise<OrderStatusResponse | null> {
    try {
      const startTime = Date.now();
      
      const cached = await this.dynamoService.getItem<OrderStatusCache>(
        this.statusTableName,
        { orderId },
        true, // Use DAX cache if available
      );

      const duration = Date.now() - startTime;
      
      if (!cached) {
        this.logger.debug(`Order status cache miss`, { orderId, duration });
        return null;
      }

      // Check TTL (DynamoDB handles deletion, but we can double-check)
      if (cached.ttl && cached.ttl < Math.floor(Date.now() / 1000)) {
        this.logger.debug(`Order status cache expired`, { orderId, ttl: cached.ttl });
        return null;
      }

      this.logger.debug(`Order status cache hit in ${duration}ms`, { orderId });

      return this.mapToStatusResponse(cached);
    } catch (error) {
      this.logger.error(`Failed to get order status from cache`, {
        orderId,
        error: error.message,
      });
      return null; // Graceful degradation
    }
  }

  /**
   * Cache order status for fast retrieval
   */
  async cacheOrderStatus(
    orderId: string,
    status: OrderStatus,
    customerId: string,
    restaurantId: string,
    channelId: string,
    totalAmount: number,
    estimatedDeliveryTime?: Date,
    trackingCode?: string,
  ): Promise<void> {
    try {
      const now = new Date();
      const ttl = Math.floor(now.getTime() / 1000) + (this.ttlHours * 3600);

      const cacheItem: OrderStatusCache = {
        orderId,
        status,
        customerId,
        restaurantId,
        channelId,
        totalAmount,
        estimatedDeliveryTime: estimatedDeliveryTime?.toISOString(),
        trackingCode,
        updatedAt: now.toISOString(),
        ttl,
      };

      const startTime = Date.now();
      
      await this.dynamoService.putItem(this.statusTableName, cacheItem);
      
      const duration = Date.now() - startTime;
      
      this.logger.debug(`Order status cached in ${duration}ms`, {
        orderId,
        status,
        ttl: new Date(ttl * 1000).toISOString(),
      });
    } catch (error) {
      this.logger.error(`Failed to cache order status`, {
        orderId,
        status,
        error: error.message,
      });
      // Don't throw - caching is not critical for order processing
    }
  }

  /**
   * Update order status in cache
   */
  async updateOrderStatus(
    orderId: string,
    updates: {
      status?: OrderStatus;
      estimatedDeliveryTime?: Date | null;
      trackingCode?: string;
    },
  ): Promise<void> {
    try {
      const updateExpressions: string[] = [];
      const attributeNames: Record<string, string> = {};
      const attributeValues: Record<string, any> = {};

      if (updates.status !== undefined) {
        updateExpressions.push('#status = :status');
        attributeNames['#status'] = 'status';
        attributeValues[':status'] = updates.status;
      }

      if (updates.estimatedDeliveryTime !== undefined) {
        if (updates.estimatedDeliveryTime === null) {
          updateExpressions.push('REMOVE estimatedDeliveryTime');
        } else {
          updateExpressions.push('#estimatedDeliveryTime = :estimatedDeliveryTime');
          attributeNames['#estimatedDeliveryTime'] = 'estimatedDeliveryTime';
          attributeValues[':estimatedDeliveryTime'] = updates.estimatedDeliveryTime.toISOString();
        }
      }

      if (updates.trackingCode !== undefined) {
        updateExpressions.push('#trackingCode = :trackingCode');
        attributeNames['#trackingCode'] = 'trackingCode';
        attributeValues[':trackingCode'] = updates.trackingCode;
      }

      // Always update timestamp and TTL
      updateExpressions.push('#updatedAt = :updatedAt, #ttl = :ttl');
      attributeNames['#updatedAt'] = 'updatedAt';
      attributeNames['#ttl'] = 'ttl';
      attributeValues[':updatedAt'] = new Date().toISOString();
      attributeValues[':ttl'] = Math.floor(Date.now() / 1000) + (this.ttlHours * 3600);

      const updateExpression = `SET ${updateExpressions.join(', ')}`;

      const startTime = Date.now();
      
      await this.dynamoService.updateItem(
        this.statusTableName,
        { orderId },
        updateExpression,
        attributeNames,
        attributeValues,
        'attribute_exists(orderId)', // Only update if item exists
      );
      
      const duration = Date.now() - startTime;
      
      this.logger.debug(`Order status updated in cache in ${duration}ms`, {
        orderId,
        updates: Object.keys(updates),
      });
    } catch (error) {
      this.logger.error(`Failed to update order status in cache`, {
        orderId,
        updates,
        error: error.message,
      });
      // Don't throw - caching failures shouldn't affect core functionality
    }
  }

  /**
   * Cache full order details for comprehensive reads
   */
  async cacheOrderDetails(orderDetails: Omit<OrderDetailCache, 'ttl'>): Promise<void> {
    try {
      const ttl = Math.floor(Date.now() / 1000) + (this.ttlHours * 3600);
      
      const cacheItem: OrderDetailCache = {
        ...orderDetails,
        ttl,
      };

      await this.dynamoService.putItem(this.detailTableName, cacheItem);
      
      this.logger.debug(`Order details cached`, {
        orderId: orderDetails.orderId,
        ttl: new Date(ttl * 1000).toISOString(),
      });
    } catch (error) {
      this.logger.error(`Failed to cache order details`, {
        orderId: orderDetails.orderId,
        error: error.message,
      });
    }
  }

  /**
   * Get full order details from cache
   */
  async getOrderDetails(orderId: string): Promise<OrderDetailCache | null> {
    try {
      const cached = await this.dynamoService.getItem<OrderDetailCache>(
        this.detailTableName,
        { orderId },
        true, // Use DAX cache
      );

      if (!cached) {
        return null;
      }

      // Check TTL
      if (cached.ttl && cached.ttl < Math.floor(Date.now() / 1000)) {
        return null;
      }

      return cached;
    } catch (error) {
      this.logger.error(`Failed to get order details from cache`, {
        orderId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Remove order from cache (on cancellation or completion)
   */
  async removeOrderFromCache(orderId: string): Promise<void> {
    try {
      await Promise.all([
        this.dynamoService.deleteItem(this.statusTableName, { orderId }),
        this.dynamoService.deleteItem(this.detailTableName, { orderId }),
      ]);

      this.logger.debug(`Order removed from cache`, { orderId });
    } catch (error) {
      this.logger.error(`Failed to remove order from cache`, {
        orderId,
        error: error.message,
      });
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats(): Promise<{
    statusCacheHealth: any;
    detailCacheHealth: any;
  }> {
    const [statusHealth, detailHealth] = await Promise.all([
      this.dynamoService.getHealthStatus(),
      this.dynamoService.getHealthStatus(), // Would check different tables in real implementation
    ]);

    return {
      statusCacheHealth: statusHealth,
      detailCacheHealth: detailHealth,
    };
  }

  /**
   * Batch get order statuses for multiple orders
   */
  async batchGetOrderStatuses(orderIds: string[]): Promise<Record<string, OrderStatusResponse>> {
    try {
      if (orderIds.length === 0) {
        return {};
      }

      const keys = orderIds.map(orderId => ({ orderId }));
      const result = await this.dynamoService.batchGetItems([
        { tableName: this.statusTableName, keys },
      ]);

      const statusCaches = result[this.statusTableName] as OrderStatusCache[] || [];
      const responses: Record<string, OrderStatusResponse> = {};

      statusCaches.forEach(cache => {
        // Check TTL
        if (!cache.ttl || cache.ttl >= Math.floor(Date.now() / 1000)) {
          responses[cache.orderId] = this.mapToStatusResponse(cache);
        }
      });

      this.logger.debug(`Batch retrieved ${Object.keys(responses).length}/${orderIds.length} order statuses`);
      
      return responses;
    } catch (error) {
      this.logger.error(`Failed to batch get order statuses`, {
        orderIds,
        error: error.message,
      });
      return {};
    }
  }

  private mapToStatusResponse(cache: OrderStatusCache): OrderStatusResponse {
    return {
      id: cache.orderId,
      status: cache.status,
      estimatedDeliveryTime: cache.estimatedDeliveryTime 
        ? new Date(cache.estimatedDeliveryTime) 
        : undefined,
      trackingCode: cache.trackingCode,
      updatedAt: new Date(cache.updatedAt),
    };
  }
} 