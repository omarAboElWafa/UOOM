

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PREPARING = 'PREPARING',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED'
}

export enum OrderPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export interface OrderItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specialInstructions?: string;
}

export interface OrderLocation {
  latitude: number;
  longitude: number;
  address: string;
  city?: string;
  postalCode?: string;
}

export interface Order {
  id: string;
  customerId: string;
  restaurantId: string;
  status: OrderStatus;
  priority: OrderPriority;
  items: OrderItem[];
  deliveryLocation: OrderLocation;
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  createdAt: Date;
  updatedAt: Date;
  estimatedDeliveryTime?: Date;
  trackingCode?: string;
  assignedDriverId?: string;
  failureReason?: string;
}

export interface OrderCreateRequest {
  customerId: string;
  restaurantId: string;
  items: OrderItem[];
  deliveryLocation: OrderLocation;
  priority?: OrderPriority;
  specialInstructions?: string;
}

export interface OrderUpdateRequest {
  status?: OrderStatus;
  estimatedDeliveryTime?: Date;
  trackingCode?: string;
  assignedDriverId?: string;
  failureReason?: string;
} 