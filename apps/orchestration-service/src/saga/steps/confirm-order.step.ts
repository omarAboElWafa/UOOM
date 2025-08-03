import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SagaStep, SagaContext, SagaStepResult } from '../interfaces/saga-step.interface';
import { Order } from '../../entities/order.entity';
import { OutboxEvent } from '../../entities/outbox-event.entity';
import { OrderStatus } from '@calo/shared';

export interface OrderConfirmationData {
  orderId: string;
  confirmedAt: Date;
  trackingCode: string;
  finalDeliveryTime: Date;
  totalAmount: number;
  channelId: string;
  reservationId?: string;
  bookingId?: string;
}

@Injectable()
export class ConfirmOrderStep extends SagaStep {
  readonly stepName = 'ConfirmOrder';
  readonly maxRetries = 2;
  readonly timeout = 3000; // 3 seconds

  private readonly logger = new Logger(ConfirmOrderStep.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
    private dataSource: DataSource,
  ) {
    super();
  }

  async execute(context: SagaContext): Promise<SagaStepResult> {
    const { sagaId, sagaData, correlationId } = context;
    
    try {
      this.logger.debug(`Confirming order`, {
        sagaId,
        orderId: sagaData.orderId,
        correlationId,
      });

      // Get data from previous steps
      const inventoryData = this.getPreviousStepData(context, 'ReserveInventory');
      const partnerData = this.getPreviousStepData(context, 'BookPartner');

      // Confirm order in database transaction
      const confirmationData = await this.confirmOrder(
        sagaData, 
        inventoryData, 
        partnerData,
        correlationId
      );

      this.logger.log(`Order confirmed successfully`, {
        sagaId,
        orderId: confirmationData.orderId,
        trackingCode: confirmationData.trackingCode,
        correlationId,
      });

      return {
        success: true,
        data: confirmationData,
      };
    } catch (error) {
      this.logger.error(`Failed to confirm order`, {
        sagaId,
        error: error.message,
        correlationId,
      });

      return {
        success: false,
        error: error.message,
        shouldRetry: this.isRetryableError(error),
      };
    }
  }

  async compensate(context: SagaContext): Promise<SagaStepResult> {
    const { sagaId, sagaData, correlationId } = context;
    
    try {
      this.logger.debug(`Compensating order confirmation`, {
        sagaId,
        orderId: sagaData.orderId,
        correlationId,
      });

      // Revert order status and create compensation events
      await this.revertOrderConfirmation(sagaData.orderId, correlationId);

      this.logger.log(`Order confirmation compensated successfully`, {
        sagaId,
        orderId: sagaData.orderId,
        correlationId,
      });

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error(`Failed to compensate order confirmation`, {
        sagaId,
        error: error.message,
        correlationId,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async confirmOrder(
    sagaData: any,
    inventoryData: any,
    partnerData: any,
    correlationId?: string
  ): Promise<OrderConfirmationData> {
    return this.dataSource.transaction(async manager => {
      // Find the order
      const order = await manager.findOne(Order, { 
        where: { id: sagaData.orderId } 
      });
      
      if (!order) {
        throw new Error(`Order not found: ${sagaData.orderId}`);
      }

      // Generate tracking code
      const trackingCode = this.generateTrackingCode(order.id);

      // Update order with confirmation details
      order.status = OrderStatus.CONFIRMED;
      order.trackingCode = trackingCode;
      order.estimatedDeliveryTime = partnerData?.estimatedDeliveryTime || 
        new Date(Date.now() + 45 * 60 * 1000); // Default 45 minutes
      order.isOptimized = true;
      order.optimizationCompletedAt = new Date();

      const confirmedOrder = await manager.save(order);

      // Create order confirmation event
      const confirmationEvent = manager.create(OutboxEvent, {
        type: 'ORDER_CONFIRMED',
        aggregateId: order.id,
        aggregateType: 'Order',
        data: {
          orderId: order.id,
          customerId: order.customerId,
          restaurantId: order.restaurantId,
          status: OrderStatus.CONFIRMED,
          trackingCode,
          estimatedDeliveryTime: order.estimatedDeliveryTime,
          partnerId: partnerData?.partnerId,
          channelId: partnerData?.channelId || 'default-channel',
          reservationId: inventoryData?.reservationId,
          bookingId: partnerData?.bookingId,
          totalAmount: order.total,
          optimizationScore: partnerData?.optimizationScore,
          confirmedAt: new Date(),
          correlationId,
        },
      });

      await manager.save(confirmationEvent);

      // Create customer notification event
      const notificationEvent = manager.create(OutboxEvent, {
        type: 'SEND_ORDER_CONFIRMATION',
        aggregateId: order.id,
        aggregateType: 'Order',
        data: {
          customerId: order.customerId,
          orderId: order.id,
          trackingCode,
          estimatedDeliveryTime: order.estimatedDeliveryTime,
          partnerName: partnerData?.partnerName || 'Default Partner',
          totalAmount: order.total,
          correlationId,
        },
      });

      await manager.save(notificationEvent);

      // Create restaurant notification event
      const restaurantEvent = manager.create(OutboxEvent, {
        type: 'NOTIFY_RESTAURANT_ORDER_CONFIRMED',
        aggregateId: order.id,
        aggregateType: 'Order',
        data: {
          restaurantId: order.restaurantId,
          orderId: order.id,
          items: order.items,
          pickupTime: partnerData?.estimatedPickupTime || 
            new Date(Date.now() + 15 * 60 * 1000),
          specialInstructions: order.specialInstructions,
          correlationId,
        },
      });

      await manager.save(restaurantEvent);

      const confirmationData: OrderConfirmationData = {
        orderId: order.id,
        confirmedAt: new Date(),
        trackingCode,
        finalDeliveryTime: order.estimatedDeliveryTime,
        totalAmount: order.total,
        channelId: partnerData?.channelId || 'default-channel',
        reservationId: inventoryData?.reservationId,
        bookingId: partnerData?.bookingId,
      };

      return confirmationData;
    });
  }

  private async revertOrderConfirmation(
    orderId: string, 
    correlationId?: string
  ): Promise<void> {
    return this.dataSource.transaction(async manager => {
      // Find the order
      const order = await manager.findOne(Order, { 
        where: { id: orderId } 
      });
      
      if (!order) {
        this.logger.warn(`Order not found during compensation: ${orderId}`);
        return;
      }

      // Revert order status
      order.status = OrderStatus.PENDING;
      order.trackingCode = null;
      order.isOptimized = false;
      order.optimizationCompletedAt = null;
      order.failureReason = 'Saga compensation - order processing failed';

      await manager.save(order);

      // Create compensation event
      const compensationEvent = manager.create(OutboxEvent, {
        type: 'ORDER_CONFIRMATION_REVERTED',
        aggregateId: orderId,
        aggregateType: 'Order',
        data: {
          orderId,
          revertedAt: new Date(),
          reason: 'Saga compensation - order processing failed',
          correlationId,
        },
      });

      await manager.save(compensationEvent);

      this.logger.debug(`Order confirmation reverted: ${orderId}`);
    });
  }

  private generateTrackingCode(orderId: string): string {
    // Generate a human-readable tracking code
    const timestamp = Date.now().toString(36).toUpperCase();
    const orderSuffix = orderId.slice(-4).toUpperCase();
    const random = Math.random().toString(36).substr(2, 3).toUpperCase();
    
    return `TRK-${timestamp}-${orderSuffix}-${random}`;
  }

  private getPreviousStepData(context: SagaContext, stepName: string): any {
    if (!context.sagaData?.stepData) {
      return null;
    }

    const stepData = context.sagaData.stepData.find(
      (step: any) => step.stepName === stepName
    );

    return stepData?.data || null;
  }

  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'Connection timeout',
      'Database connection lost',
      'Temporary network error',
    ];

    return retryableErrors.some(retryableError => 
      error.message.includes(retryableError)
    );
  }
} 