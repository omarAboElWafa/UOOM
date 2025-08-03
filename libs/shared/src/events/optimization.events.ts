import { OptimizationType, OptimizationStatus } from '../types/optimization.types';

export enum OptimizationEventType {
  OPTIMIZATION_REQUESTED = 'OPTIMIZATION_REQUESTED',
  OPTIMIZATION_STARTED = 'OPTIMIZATION_STARTED',
  OPTIMIZATION_COMPLETED = 'OPTIMIZATION_COMPLETED',
  OPTIMIZATION_FAILED = 'OPTIMIZATION_FAILED',
  OPTIMIZATION_TIMEOUT = 'OPTIMIZATION_TIMEOUT',
  ROUTE_ASSIGNED = 'ROUTE_ASSIGNED',
  DRIVER_ASSIGNED = 'DRIVER_ASSIGNED'
}

export interface BaseOptimizationEvent {
  id: string;
  optimizationId: string;
  eventType: OptimizationEventType;
  timestamp: Date;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface OptimizationRequestedEvent extends BaseOptimizationEvent {
  eventType: OptimizationEventType.OPTIMIZATION_REQUESTED;
  data: {
    type: OptimizationType;
    constraints: {
      maxDeliveryTime: number;
      maxDistance: number;
      maxOrdersPerDriver: number;
      maxWaitTime: number;
      priorityWeight: number;
      costWeight: number;
      timeWeight: number;
    };
    orderCount: number;
    driverCount: number;
    restaurantCount: number;
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  };
}

export interface OptimizationStartedEvent extends BaseOptimizationEvent {
  eventType: OptimizationEventType.OPTIMIZATION_STARTED;
  data: {
    type: OptimizationType;
    startTime: Date;
    estimatedDuration: number; // in milliseconds
    complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

export interface OptimizationCompletedEvent extends BaseOptimizationEvent {
  eventType: OptimizationEventType.OPTIMIZATION_COMPLETED;
  data: {
    type: OptimizationType;
    status: OptimizationStatus.COMPLETED;
    processingTime: number; // in milliseconds
    assignments: Array<{
      orderId: string;
      driverId: string;
      restaurantId: string;
      estimatedPickupTime: Date;
      estimatedDeliveryTime: Date;
      totalDistance: number;
      totalTime: number;
    }>;
    metrics: {
      totalCost: number;
      totalDistance: number;
      totalTime: number;
      averageDeliveryTime: number;
      optimizationScore: number;
    };
    improvementPercentage: number;
  };
}

export interface OptimizationFailedEvent extends BaseOptimizationEvent {
  eventType: OptimizationEventType.OPTIMIZATION_FAILED;
  data: {
    type: OptimizationType;
    status: OptimizationStatus.FAILED;
    errorCode: string;
    errorMessage: string;
    processingTime: number; // in milliseconds
    failureReason: 'CONSTRAINT_VIOLATION' | 'INSUFFICIENT_RESOURCES' | 'ALGORITHM_ERROR' | 'TIMEOUT';
  };
}

export interface OptimizationTimeoutEvent extends BaseOptimizationEvent {
  eventType: OptimizationEventType.OPTIMIZATION_TIMEOUT;
  data: {
    type: OptimizationType;
    status: OptimizationStatus.TIMEOUT;
    maxProcessingTime: number; // in milliseconds
    actualProcessingTime: number; // in milliseconds
    partialResults?: {
      assignments: Array<{
        orderId: string;
        driverId: string;
        restaurantId: string;
        estimatedPickupTime: Date;
        estimatedDeliveryTime: Date;
      }>;
      metrics: {
        totalCost: number;
        totalDistance: number;
        totalTime: number;
      };
    };
  };
}

export interface RouteAssignedEvent extends BaseOptimizationEvent {
  eventType: OptimizationEventType.ROUTE_ASSIGNED;
  data: {
    driverId: string;
    routeId: string;
    orders: string[];
    startLocation: {
      latitude: number;
      longitude: number;
    };
    endLocation: {
      latitude: number;
      longitude: number;
    };
    estimatedDuration: number; // in minutes
    totalDistance: number; // in kilometers
    waypoints: Array<{
      latitude: number;
      longitude: number;
      orderId?: string;
      restaurantId?: string;
    }>;
  };
}

export interface DriverAssignedEvent extends BaseOptimizationEvent {
  eventType: OptimizationEventType.DRIVER_ASSIGNED;
  data: {
    orderId: string;
    driverId: string;
    restaurantId: string;
    estimatedPickupTime: Date;
    estimatedDeliveryTime: Date;
    trackingCode: string;
    assignmentScore: number; // 0-1
    reason: 'OPTIMAL_ROUTE' | 'PROXIMITY' | 'AVAILABILITY' | 'PRIORITY';
  };
}

export type OptimizationEvent = 
  | OptimizationRequestedEvent 
  | OptimizationStartedEvent 
  | OptimizationCompletedEvent 
  | OptimizationFailedEvent 
  | OptimizationTimeoutEvent 
  | RouteAssignedEvent 
  | DriverAssignedEvent; 