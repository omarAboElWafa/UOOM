import { OrderStatus, OrderPriority } from '../enums/order-status.enum';

export enum OrderEventType {
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_CONFIRMED = 'ORDER_CONFIRMED',
  ORDER_PREPARING = 'ORDER_PREPARING',
  ORDER_READY_FOR_PICKUP = 'ORDER_READY_FOR_PICKUP',
  ORDER_PICKED_UP = 'ORDER_PICKED_UP',
  ORDER_IN_TRANSIT = 'ORDER_IN_TRANSIT',
  ORDER_DELIVERED = 'ORDER_DELIVERED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  ORDER_FAILED = 'ORDER_FAILED',
  ORDER_ASSIGNED_TO_DRIVER = 'ORDER_ASSIGNED_TO_DRIVER',
  ORDER_ESTIMATED_DELIVERY_UPDATED = 'ORDER_ESTIMATED_DELIVERY_UPDATED'
}

export interface BaseOrderEvent {
  id: string;
  orderId: string;
  eventType: OrderEventType;
  timestamp: Date;
  version: number;
  aggregateId: string;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface OrderCreatedEvent extends BaseOrderEvent {
  eventType: OrderEventType.ORDER_CREATED;
  data: {
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
    };
    priority: OrderPriority;
    subtotal: number;
    tax: number;
    deliveryFee: number;
    total: number;
    specialInstructions?: string;
  };
}

export interface OrderStatusChangedEvent extends BaseOrderEvent {
  eventType: OrderEventType.ORDER_CONFIRMED | OrderEventType.ORDER_PREPARING | 
             OrderEventType.ORDER_READY_FOR_PICKUP | OrderEventType.ORDER_PICKED_UP | 
             OrderEventType.ORDER_IN_TRANSIT | OrderEventType.ORDER_DELIVERED | 
             OrderEventType.ORDER_CANCELLED | OrderEventType.ORDER_FAILED;
  data: {
    previousStatus: OrderStatus;
    newStatus: OrderStatus;
    reason?: string;
    updatedBy?: string;
  };
}

export interface OrderAssignedToDriverEvent extends BaseOrderEvent {
  eventType: OrderEventType.ORDER_ASSIGNED_TO_DRIVER;
  data: {
    driverId: string;
    estimatedPickupTime: Date;
    estimatedDeliveryTime: Date;
    trackingCode: string;
  };
}

export interface OrderEstimatedDeliveryUpdatedEvent extends BaseOrderEvent {
  eventType: OrderEventType.ORDER_ESTIMATED_DELIVERY_UPDATED;
  data: {
    previousEstimatedDeliveryTime: Date;
    newEstimatedDeliveryTime: Date;
    reason: string;
  };
}

export type OrderEvent = 
  | OrderCreatedEvent 
  | OrderStatusChangedEvent 
  | OrderAssignedToDriverEvent 
  | OrderEstimatedDeliveryUpdatedEvent; 