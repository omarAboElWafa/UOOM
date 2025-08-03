import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

export function generateUUID(): string {
  return uuidv4();
}

export function isValidUUID(uuid: string): boolean {
  return uuidValidate(uuid);
}

export function generateOrderId(): string {
  return `order_${generateUUID()}`;
}

export function generateRestaurantId(): string {
  return `restaurant_${generateUUID()}`;
}

export function generateDriverId(): string {
  return `driver_${generateUUID()}`;
}

export function generateDeliveryId(): string {
  return `delivery_${generateUUID()}`;
}

export function generateOptimizationId(): string {
  return `optimization_${generateUUID()}`;
}

export function generateEventId(): string {
  return `event_${generateUUID()}`;
}

export function generateTrackingCode(): string {
  // Generate a shorter, more user-friendly tracking code
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateShortId(): string {
  // Generate a short ID for internal use
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
} 