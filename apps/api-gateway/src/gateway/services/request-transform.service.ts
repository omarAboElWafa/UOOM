import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class RequestTransformService {
  private readonly logger = new Logger(RequestTransformService.name);

  async transformCreateOrder(
    orderData: any,
    headers: Record<string, string>,
    req: Request
  ): Promise<any> {
    const transformed = {
      ...orderData,
      // Add metadata
      metadata: {
        ...orderData.metadata,
        gateway: {
          requestId: headers['x-gateway-request-id'],
          correlationId: headers['x-correlation-id'],
          userAgent: req.headers['user-agent'],
          ip: req.ip || req.connection?.remoteAddress,
          timestamp: new Date().toISOString(),
          version: '1.0.0',
        },
        originalHeaders: this.sanitizeHeaders(headers),
      },
    };

    // Validate required fields
    this.validateOrderData(transformed);

    // Apply business rules
    transformed.priority = this.determinePriority(transformed);
    transformed.estimatedValue = this.calculateEstimatedValue(transformed);

    this.logger.debug('Transformed create order request', {
      originalItemsCount: orderData.items?.length || 0,
      transformedItemsCount: transformed.items?.length || 0,
      priority: transformed.priority,
      estimatedValue: transformed.estimatedValue,
    });

    return transformed;
  }

  async transformUpdateOrder(
    updateData: any,
    headers: Record<string, string>,
    req: Request
  ): Promise<any> {
    const transformed = {
      ...updateData,
      // Add update metadata
      updateMetadata: {
        updatedBy: 'api-gateway',
        requestId: headers['x-gateway-request-id'],
        correlationId: headers['x-correlation-id'],
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection?.remoteAddress,
      },
    };

    // Validate update permissions
    this.validateUpdatePermissions(transformed);

    this.logger.debug('Transformed update order request', {
      fieldsUpdated: Object.keys(updateData).length,
      correlationId: headers['x-correlation-id'],
    });

    return transformed;
  }

  async transformOptimizationRequest(
    optimizationData: any,
    headers: Record<string, string>
  ): Promise<any> {
    const transformed = {
      ...optimizationData,
      // Add optimization context
      context: {
        ...optimizationData.context,
        requestSource: 'api-gateway',
        requestId: headers['x-gateway-request-id'],
        correlationId: headers['x-correlation-id'],
        timestamp: new Date().toISOString(),
        timeoutMs: 100, // OR-Tools timeout
      },
      // Ensure proper weights
      weights: this.normalizeWeights(optimizationData.weights),
    };

    this.logger.debug('Transformed optimization request', {
      ordersCount: optimizationData.orders?.length || 0,
      channelsCount: optimizationData.channels?.length || 0,
      weights: transformed.weights,
    });

    return transformed;
  }

  private validateOrderData(orderData: any): void {
    const required = ['customerId', 'restaurantId', 'items', 'deliveryLocation'];
    
    for (const field of required) {
      if (!orderData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
      throw new Error('Order must contain at least one item');
    }

    if (!orderData.deliveryLocation.latitude || !orderData.deliveryLocation.longitude) {
      throw new Error('Delivery location must include latitude and longitude');
    }
  }

  private validateUpdatePermissions(updateData: any): void {
    // Define which fields can be updated
    const allowedFields = [
      'status',
      'deliveryInstructions',
      'specialInstructions',
      'priority',
      'estimatedDeliveryTime',
    ];

    const restrictedFields = [
      'customerId',
      'restaurantId',
      'items',
      'total',
      'createdAt',
    ];

    for (const field of restrictedFields) {
      if (updateData.hasOwnProperty(field)) {
        throw new Error(`Field '${field}' cannot be updated via API Gateway`);
      }
    }

    const updateFields = Object.keys(updateData).filter(
      field => !field.startsWith('_') && field !== 'updateMetadata'
    );

    for (const field of updateFields) {
      if (!allowedFields.includes(field)) {
        this.logger.warn(`Potentially restricted field update attempted: ${field}`);
      }
    }
  }

  private determinePriority(orderData: any): string {
    // Business logic to determine order priority
    let priority = orderData.priority || 'NORMAL';

    // Premium customers get higher priority
    if (orderData.customer?.isPremium) {
      priority = 'HIGH';
    }

    // Large orders get higher priority
    const totalValue = this.calculateEstimatedValue(orderData);
    if (totalValue > 100) {
      priority = 'HIGH';
    }

    // Rush orders
    if (orderData.isRush || orderData.requestedDeliveryTime) {
      priority = 'URGENT';
    }

    return priority;
  }

  private calculateEstimatedValue(orderData: any): number {
    if (orderData.total) {
      return orderData.total;
    }

    // Calculate from items if total not provided
    let total = 0;
    for (const item of orderData.items || []) {
      total += (item.unitPrice || 0) * (item.quantity || 1);
    }

    // Add estimated tax and fees
    total *= 1.15; // Assume 15% for tax and fees

    return Math.round(total * 100) / 100; // Round to 2 decimal places
  }

  private normalizeWeights(weights: any): Record<string, number> {
    const defaultWeights = {
      delivery_time: 0.4,
      cost: 0.3,
      quality: 0.2,
      capacity: 0.1,
    };

    if (!weights || typeof weights !== 'object') {
      return defaultWeights;
    }

    // Calculate total weight
    let total = 0;
    for (const value of Object.values(weights)) {
      const numWeight = Number(value);
      if (!isNaN(numWeight) && numWeight > 0) {
        total += numWeight;
      }
    }

    if (total === 0) {
      return defaultWeights;
    }

    // Normalize weights
    const normalized: Record<string, number> = {};
    for (const [key, value] of Object.entries(weights)) {
      const numValue = Number(value);
      if (!isNaN(numValue) && numValue > 0) {
        normalized[key] = Number((numValue / total).toFixed(4));
      }
    }

    return Object.keys(normalized).length > 0 ? normalized : defaultWeights;
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized = { ...headers };
    
    // Remove sensitive headers
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized['x-api-key'];
    
    // Keep only relevant headers
    const allowedHeaders = [
      'user-agent',
      'content-type',
      'accept',
      'x-correlation-id',
      'x-request-id',
      'x-gateway-request-id',
    ];

    const filtered: Record<string, string> = {};
    for (const header of allowedHeaders) {
      if (sanitized[header]) {
        filtered[header] = sanitized[header];
      }
    }

    return filtered;
  }
} 