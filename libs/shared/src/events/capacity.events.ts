import { CapacityStatus, ResourceType } from '../types/capacity.types';

export enum CapacityEventType {
  CAPACITY_UPDATED = 'CAPACITY_UPDATED',
  CAPACITY_THRESHOLD_EXCEEDED = 'CAPACITY_THRESHOLD_EXCEEDED',
  CAPACITY_RECOVERED = 'CAPACITY_RECOVERED',
  DRIVER_AVAILABLE = 'DRIVER_AVAILABLE',
  DRIVER_BUSY = 'DRIVER_BUSY',
  RESTAURANT_CAPACITY_CHANGED = 'RESTAURANT_CAPACITY_CHANGED',
  ZONE_CAPACITY_CHANGED = 'ZONE_CAPACITY_CHANGED'
}

export interface BaseCapacityEvent {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  eventType: CapacityEventType;
  timestamp: Date;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface CapacityUpdatedEvent extends BaseCapacityEvent {
  eventType: CapacityEventType.CAPACITY_UPDATED;
  data: {
    previousStatus: CapacityStatus;
    newStatus: CapacityStatus;
    currentLoad: number;
    maxCapacity: number;
    utilizationRate: number;
    averageResponseTime: number;
    queueLength: number;
  };
}

export interface CapacityThresholdExceededEvent extends BaseCapacityEvent {
  eventType: CapacityEventType.CAPACITY_THRESHOLD_EXCEEDED;
  data: {
    threshold: number;
    currentLoad: number;
    maxCapacity: number;
    utilizationRate: number;
    alertLevel: 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  };
}

export interface CapacityRecoveredEvent extends BaseCapacityEvent {
  eventType: CapacityEventType.CAPACITY_RECOVERED;
  data: {
    previousStatus: CapacityStatus;
    newStatus: CapacityStatus;
    recoveryTime: number; // in minutes
    currentLoad: number;
    maxCapacity: number;
  };
}

export interface DriverStatusChangedEvent extends BaseCapacityEvent {
  eventType: CapacityEventType.DRIVER_AVAILABLE | CapacityEventType.DRIVER_BUSY;
  data: {
    driverId: string;
    previousStatus: string;
    newStatus: string;
    currentLocation: {
      latitude: number;
      longitude: number;
    };
    currentDeliveries: number;
    maxDeliveries: number;
  };
}

export interface RestaurantCapacityChangedEvent extends BaseCapacityEvent {
  eventType: CapacityEventType.RESTAURANT_CAPACITY_CHANGED;
  data: {
    restaurantId: string;
    previousStatus: CapacityStatus;
    newStatus: CapacityStatus;
    currentOrders: number;
    maxConcurrentOrders: number;
    averagePreparationTime: number;
    queueLength: number;
    estimatedWaitTime: number;
  };
}

export interface ZoneCapacityChangedEvent extends BaseCapacityEvent {
  eventType: CapacityEventType.ZONE_CAPACITY_CHANGED;
  data: {
    zoneId: string;
    previousStatus: CapacityStatus;
    newStatus: CapacityStatus;
    availableDrivers: number;
    totalDrivers: number;
    averageDeliveryTime: number;
    currentDemand: number;
    maxDemand: number;
  };
}

export type CapacityEvent = 
  | CapacityUpdatedEvent 
  | CapacityThresholdExceededEvent 
  | CapacityRecoveredEvent 
  | DriverStatusChangedEvent 
  | RestaurantCapacityChangedEvent 
  | ZoneCapacityChangedEvent; 