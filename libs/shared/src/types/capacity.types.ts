export enum CapacityStatus {
  AVAILABLE = 'AVAILABLE',
  LIMITED = 'LIMITED',
  FULL = 'FULL',
  OVERLOADED = 'OVERLOADED'
}

export enum ResourceType {
  DRIVER = 'DRIVER',
  RESTAURANT = 'RESTAURANT',
  KITCHEN = 'KITCHEN',
  DELIVERY_ZONE = 'DELIVERY_ZONE'
}

export interface CapacityMetrics {
  currentLoad: number;
  maxCapacity: number;
  utilizationRate: number; // percentage
  averageResponseTime: number; // in seconds
  queueLength: number;
  lastUpdated: Date;
}

export interface RestaurantCapacity {
  id: string;
  restaurantId: string;
  status: CapacityStatus;
  currentOrders: number;
  maxConcurrentOrders: number;
  averagePreparationTime: number; // in minutes
  queueLength: number;
  estimatedWaitTime: number; // in minutes
  lastUpdated: Date;
}

export interface DriverCapacity {
  id: string;
  driverId: string;
  status: CapacityStatus;
  currentDeliveries: number;
  maxDeliveries: number;
  averageDeliveryTime: number; // in minutes
  currentLocation: {
    latitude: number;
    longitude: number;
  };
  estimatedReturnTime?: Date;
  lastUpdated: Date;
}

export interface ZoneCapacity {
  id: string;
  zoneId: string;
  status: CapacityStatus;
  availableDrivers: number;
  totalDrivers: number;
  averageDeliveryTime: number; // in minutes
  currentDemand: number;
  maxDemand: number;
  lastUpdated: Date;
}

export interface CapacityUpdateRequest {
  resourceType: ResourceType;
  resourceId: string;
  currentLoad: number;
  maxCapacity: number;
  status: CapacityStatus;
  additionalData?: Record<string, any>;
}

export interface CapacityQueryRequest {
  resourceType: ResourceType;
  resourceIds?: string[];
  zoneId?: string;
  status?: CapacityStatus;
  includeMetrics?: boolean;
} 