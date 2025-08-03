import { Injectable, Logger } from '@nestjs/common';
import { SagaStep, SagaContext, SagaStepResult } from '../interfaces/saga-step.interface';

export interface InventoryReservationData {
  reservationId: string;
  items: Array<{
    itemId: string;
    quantity: number;
    reservedQuantity: number;
  }>;
  restaurantId: string;
  expiresAt: Date;
}

@Injectable()
export class ReserveInventoryStep extends SagaStep {
  readonly stepName = 'ReserveInventory';
  readonly maxRetries = 3;
  readonly timeout = 5000; // 5 seconds

  private readonly logger = new Logger(ReserveInventoryStep.name);

  async execute(context: SagaContext): Promise<SagaStepResult> {
    const { sagaId, sagaData, correlationId } = context;
    
    try {
      this.logger.debug(`Reserving inventory for order`, {
        sagaId,
        orderId: sagaData.orderId,
        correlationId,
      });

      // Simulate inventory reservation
      // In a real implementation, this would call an inventory service
      const reservationData = await this.reserveInventory(sagaData);

      this.logger.log(`Inventory reserved successfully`, {
        sagaId,
        reservationId: reservationData.reservationId,
        correlationId,
      });

      return {
        success: true,
        data: reservationData,
      };
    } catch (error) {
      this.logger.error(`Failed to reserve inventory`, {
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
    const { sagaId, correlationId } = context;
    
    try {
      // Get reservation data from step execution
      const stepData = context.sagaData?.stepData?.find(
        (step: any) => step.stepName === this.stepName
      );
      
      if (!stepData?.data) {
        this.logger.warn(`No reservation data found for compensation`, {
          sagaId,
          correlationId,
        });
        return { success: true }; // Nothing to compensate
      }

      const reservationData = stepData.data as InventoryReservationData;

      this.logger.debug(`Releasing inventory reservation`, {
        sagaId,
        reservationId: reservationData.reservationId,
        correlationId,
      });

      // Simulate inventory release
      await this.releaseInventory(reservationData);

      this.logger.log(`Inventory reservation released successfully`, {
        sagaId,
        reservationId: reservationData.reservationId,
        correlationId,
      });

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error(`Failed to release inventory reservation`, {
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

  private async reserveInventory(sagaData: any): Promise<InventoryReservationData> {
    // Simulate API call to inventory service
    const reservationId = `reservation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Simulate some processing delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate potential failures (5% failure rate)
    if (Math.random() < 0.05) {
      throw new Error('Inventory service temporarily unavailable');
    }

    // Check if items are available (simulate inventory check)
    const reservedItems = sagaData.items.map((item: any) => ({
      itemId: item.itemId,
      quantity: item.quantity,
      reservedQuantity: item.quantity, // Assume all requested quantity is available
    }));

    // Check for insufficient inventory (simulate business logic)
    if (sagaData.items.some((item: any) => item.quantity > 100)) {
      throw new Error('Insufficient inventory for requested quantity');
    }

    const reservationData: InventoryReservationData = {
      reservationId,
      items: reservedItems,
      restaurantId: sagaData.restaurantId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes expiry
    };

    return reservationData;
  }

  private async releaseInventory(reservationData: InventoryReservationData): Promise<void> {
    // Simulate API call to release inventory
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // In a real implementation, this would call the inventory service to release the reservation
    this.logger.debug(`Released inventory reservation: ${reservationData.reservationId}`);
  }

  private isRetryableError(error: Error): boolean {
    // Define which errors are retryable
    const retryableErrors = [
      'Inventory service temporarily unavailable',
      'Connection timeout',
      'Service unavailable',
    ];

    return retryableErrors.some(retryableError => 
      error.message.includes(retryableError)
    );
  }
} 