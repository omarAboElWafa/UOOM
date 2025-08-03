import { DeliveryStatus } from '../enums/delivery-status.enum';

export enum DriverStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
  ON_BREAK = 'ON_BREAK'
}

export enum VehicleType {
  MOTORCYCLE = 'MOTORCYCLE',
  CAR = 'CAR',
  BICYCLE = 'BICYCLE',
  SCOOTER = 'SCOOTER'
}

export interface DriverLocation {
  latitude: number;
  longitude: number;
  timestamp: Date;
  accuracy?: number;
}

export interface Driver {
  id: string;
  name: string;
  phoneNumber: string;
  email: string;
  status: DriverStatus;
  vehicleType: VehicleType;
  vehicleNumber: string;
  currentLocation: DriverLocation;
  rating: number;
  totalDeliveries: number;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryRoute {
  id: string;
  driverId: string;
  orders: string[]; // Order IDs
  startLocation: DriverLocation;
  endLocation: DriverLocation;
  estimatedDuration: number; // in minutes
  totalDistance: number; // in kilometers
  status: DeliveryStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryAssignment {
  id: string;
  orderId: string;
  driverId: string;
  routeId?: string;
  pickupLocation: {
    latitude: number;
    longitude: number;
    address: string;
  };
  deliveryLocation: {
    latitude: number;
    longitude: number;
    address: string;
  };
  status: DeliveryStatus;
  estimatedPickupTime: Date;
  estimatedDeliveryTime: Date;
  actualPickupTime?: Date;
  actualDeliveryTime?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryCreateRequest {
  orderId: string;
  pickupLocation: {
    latitude: number;
    longitude: number;
    address: string;
  };
  deliveryLocation: {
    latitude: number;
    longitude: number;
    address: string;
  };
  estimatedPickupTime: Date;
  estimatedDeliveryTime: Date;
}

export interface DeliveryUpdateRequest {
  driverId?: string;
  routeId?: string;
  status?: DeliveryStatus;
  actualPickupTime?: Date;
  actualDeliveryTime?: Date;
} 