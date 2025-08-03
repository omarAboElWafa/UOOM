import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { SagaCoordinatorService, SagaDefinition } from './saga-coordinator.service';
import { ReserveInventoryStep } from './steps/reserve-inventory.step';
import { BookPartnerStep } from './steps/book-partner.step';
import { ConfirmOrderStep } from './steps/confirm-order.step';

export interface OrderSagaData {
  orderId: string;
  customerId: string;
  restaurantId: string;
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
    city?: string;
    postalCode?: string;
  };
  totalAmount: number;
  maxDeliveryTimeMinutes?: number;
  priority?: string;
  specialInstructions?: string;
}

@Injectable()
export class OrderSagaService implements OnModuleInit {
  private readonly logger = new Logger(OrderSagaService.name);

  constructor(
    private sagaCoordinator: SagaCoordinatorService,
    private reserveInventoryStep: ReserveInventoryStep,
    private bookPartnerStep: BookPartnerStep,
    private confirmOrderStep: ConfirmOrderStep,
  ) {}

  onModuleInit() {
    // Register the order saga definition
    const orderSagaDefinition: SagaDefinition = {
      sagaType: 'ORDER_PROCESSING',
      steps: [
        this.reserveInventoryStep,
        this.bookPartnerStep,
        this.confirmOrderStep,
      ],
      timeoutMs: 30000, // 30 seconds total timeout
      maxRetries: 3,
    };

    this.sagaCoordinator.registerSaga(orderSagaDefinition);
    
    this.logger.log('Order saga registered successfully');
  }

  /**
   * Start order processing saga
   */
  async startOrderProcessingSaga(
    orderId: string,
    sagaData: OrderSagaData,
    correlationId?: string
  ): Promise<string> {
    this.logger.log(`Starting order processing saga`, {
      orderId,
      correlationId,
    });

    try {
      const sagaId = await this.sagaCoordinator.startSaga({
        sagaType: 'ORDER_PROCESSING',
        aggregateId: orderId,
        aggregateType: 'Order',
        sagaData: {
          ...sagaData,
          orderId, // Ensure orderId is included
        },
        correlationId,
      });

      this.logger.log(`Order processing saga started`, {
        sagaId,
        orderId,
        correlationId,
      });

      return sagaId;
    } catch (error) {
      this.logger.error(`Failed to start order processing saga`, {
        orderId,
        error: error.message,
        correlationId,
      });
      throw error;
    }
  }

  /**
   * Get saga status for an order
   */
  async getOrderSagaStatus(orderId: string) {
    const sagas = await this.sagaCoordinator.getSagasByAggregate(orderId, 'Order');
    
    // Return the most recent saga
    return sagas.length > 0 ? sagas[0] : null;
  }

  /**
   * Get all sagas for an order (for debugging/monitoring)
   */
  async getOrderSagas(orderId: string) {
    return this.sagaCoordinator.getSagasByAggregate(orderId, 'Order');
  }
} 