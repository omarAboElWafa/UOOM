import { OptimizationType } from '../enums/optimization-type.enum';

export enum OptimizationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT'
}

export interface OptimizationConstraints {
  maxDeliveryTime: number; // in minutes
  maxDistance: number; // in kilometers
  maxOrdersPerDriver: number;
  maxWaitTime: number; // in minutes
  priorityWeight: number; // 0-1
  costWeight: number; // 0-1
  timeWeight: number; // 0-1
}

export interface OptimizationRequest {
  id: string;
  type: OptimizationType;
  constraints: OptimizationConstraints;
  orders: Array<{
    id: string;
    restaurantId: string;
    deliveryLocation: {
      latitude: number;
      longitude: number;
    };
    priority: number;
    estimatedPreparationTime: number;
    maxDeliveryTime: number;
  }>;
  drivers: Array<{
    id: string;
    currentLocation: {
      latitude: number;
      longitude: number;
    };
    maxDeliveries: number;
    vehicleType: string;
    rating: number;
  }>;
  restaurants: Array<{
    id: string;
    location: {
      latitude: number;
      longitude: number;
    };
    currentCapacity: number;
    maxCapacity: number;
  }>;
  createdAt: Date;
}

export interface OptimizationResult {
  id: string;
  requestId: string;
  status: OptimizationStatus;
  assignments: Array<{
    orderId: string;
    driverId: string;
    restaurantId: string;
    estimatedPickupTime: Date;
    estimatedDeliveryTime: Date;
    route: Array<{
      latitude: number;
      longitude: number;
    }>;
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
  processingTime: number; // in milliseconds
  createdAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface OptimizationQueryRequest {
  type?: OptimizationType;
  status?: OptimizationStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
} 