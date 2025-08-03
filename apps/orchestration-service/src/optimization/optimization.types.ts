import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsArray, IsOptional, IsObject, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

// Optimization Service Request Types
export class OptimizationOrderLocation {
  @ApiProperty({ description: 'Latitude coordinate' })
  @IsNumber()
  lat: number;

  @ApiProperty({ description: 'Longitude coordinate' })
  @IsNumber()
  lng: number;
}

export class OptimizationOrder {
  @ApiProperty({ description: 'Unique order identifier' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Pickup location coordinates' })
  @ValidateNested()
  @Type(() => OptimizationOrderLocation)
  pickup_location: OptimizationOrderLocation;

  @ApiProperty({ description: 'Delivery location coordinates' })
  @ValidateNested()
  @Type(() => OptimizationOrderLocation)
  delivery_location: OptimizationOrderLocation;

  @ApiProperty({ description: 'Order priority (1-10)', minimum: 1, maximum: 10 })
  @IsNumber()
  priority: number;

  @ApiProperty({ description: 'Maximum delivery time in minutes' })
  @IsNumber()
  max_delivery_time: number;

  @ApiProperty({ description: 'Order weight in kg' })
  @IsNumber()
  weight: number;

  @ApiProperty({ description: 'Special handling requirements', type: [String] })
  @IsArray()
  @IsString({ each: true })
  special_requirements: string[];
}

export class OptimizationChannel {
  @ApiProperty({ description: 'Unique channel identifier' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Channel capacity' })
  @IsNumber()
  capacity: number;

  @ApiProperty({ description: 'Current load' })
  @IsNumber()
  current_load: number;

  @ApiProperty({ description: 'Cost per order' })
  @IsNumber()
  cost_per_order: number;

  @ApiProperty({ description: 'Quality score (0-100)' })
  @IsNumber()
  quality_score: number;

  @ApiProperty({ description: 'Preparation time in minutes' })
  @IsNumber()
  prep_time_minutes: number;

  @ApiProperty({ description: 'Channel location coordinates' })
  @ValidateNested()
  @Type(() => OptimizationOrderLocation)
  location: OptimizationOrderLocation;

  @ApiProperty({ description: 'Vehicle type' })
  @IsString()
  vehicle_type: string;

  @ApiProperty({ description: 'Maximum delivery distance in km' })
  @IsNumber()
  max_distance: number;
}

export class OptimizationWeights {
  @ApiProperty({ description: 'Delivery time weight' })
  @IsNumber()
  delivery_time: number;

  @ApiProperty({ description: 'Cost weight' })
  @IsNumber()
  cost: number;

  @ApiProperty({ description: 'Quality weight' })
  @IsNumber()
  quality: number;
}

export class OptimizationRequest {
  @ApiProperty({ description: 'Orders to optimize', type: [OptimizationOrder] })
  @ValidateNested({ each: true })
  @Type(() => OptimizationOrder)
  @IsArray()
  orders: OptimizationOrder[];

  @ApiProperty({ description: 'Available channels', type: [OptimizationChannel] })
  @ValidateNested({ each: true })
  @Type(() => OptimizationChannel)
  @IsArray()
  channels: OptimizationChannel[];

  @ApiProperty({ description: 'Additional constraints' })
  @IsObject()
  constraints: Record<string, any>;

  @ApiProperty({ description: 'Optimization weights' })
  @ValidateNested()
  @Type(() => OptimizationWeights)
  weights: OptimizationWeights;

  @ApiProperty({ description: 'Optimization timeout in seconds' })
  @IsNumber()
  timeout_seconds: number;
}

// Optimization Service Response Types
export class OptimizationResponse {
  @ApiProperty({ description: 'Order ID to channel ID assignments' })
  assignments: Record<string, string>;

  @ApiProperty({ description: 'Total optimization score' })
  total_score: number;

  @ApiProperty({ description: 'Solve time in milliseconds' })
  solve_time_ms: number;

  @ApiProperty({ description: 'Optimization status' })
  status: string;

  @ApiProperty({ description: 'Additional optimization metadata' })
  metadata: Record<string, any>;
}

// Health Check Response
export class OptimizationHealthResponse {
  @ApiProperty({ description: 'Service status' })
  status: string;

  @ApiProperty({ description: 'Service name' })
  service: string;

  @ApiProperty({ description: 'Service version' })
  version: string;

  @ApiProperty({ description: 'Timestamp' })
  timestamp: number;
}

// Fulfillment Channel Types (for internal use)
export interface FulfillmentChannel {
  id: string;
  name: string;
  type: string;
  capacity: number;
  currentLoad: number;
  availableCapacity: number;
  costPerOrder: number;
  qualityScore: number;
  prepTimeMinutes: number;
  location: {
    latitude: number;
    longitude: number;
  };
  vehicleType: string;
  maxDistance: number;
  isActive: boolean;
}

// Exception Types
export class OptimizationServiceException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OptimizationServiceException';
  }
}

export class NoAvailableChannelsException extends Error {
  constructor() {
    super('No available channels for optimization');
    this.name = 'NoAvailableChannelsException';
  }
}

export class OptimizationTimeoutException extends Error {
  constructor() {
    super('Optimization request timed out');
    this.name = 'OptimizationTimeoutException';
  }
} 