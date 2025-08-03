import { IsUUID, IsString, IsNumber, IsDate, IsOptional, IsEnum, ValidateNested, IsArray, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryStatus, DriverStatus, VehicleType } from '../types/delivery.types';

export class DriverLocationDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @Type(() => Date)
  @IsDate()
  timestamp: Date;

  @IsOptional()
  @IsNumber()
  accuracy?: number;
}

export class CreateDriverDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @IsString()
  @IsNotEmpty()
  vehicleNumber: string;

  @ValidateNested()
  @Type(() => DriverLocationDto)
  currentLocation: DriverLocationDto;
}

export class UpdateDriverDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  email?: string;

  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  vehicleNumber?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DriverLocationDto)
  currentLocation?: DriverLocationDto;
}

export class DriverResponseDto {
  @IsUUID()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsEnum(DriverStatus)
  status: DriverStatus;

  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @IsString()
  @IsNotEmpty()
  vehicleNumber: string;

  @ValidateNested()
  @Type(() => DriverLocationDto)
  currentLocation: DriverLocationDto;

  @IsNumber()
  rating: number;

  @IsNumber()
  totalDeliveries: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  estimatedReturnTime?: Date;

  @Type(() => Date)
  @IsDate()
  createdAt: Date;

  @Type(() => Date)
  @IsDate()
  updatedAt: Date;
}

export class LocationDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsString()
  @IsNotEmpty()
  address: string;
}

export class CreateDeliveryDto {
  @IsUUID()
  orderId: string;

  @ValidateNested()
  @Type(() => LocationDto)
  pickupLocation: LocationDto;

  @ValidateNested()
  @Type(() => LocationDto)
  deliveryLocation: LocationDto;

  @Type(() => Date)
  @IsDate()
  estimatedPickupTime: Date;

  @Type(() => Date)
  @IsDate()
  estimatedDeliveryTime: Date;
}

export class UpdateDeliveryDto {
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  routeId?: string;

  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  actualPickupTime?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  actualDeliveryTime?: Date;
}

export class DeliveryResponseDto {
  @IsUUID()
  id: string;

  @IsUUID()
  orderId: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  routeId?: string;

  @ValidateNested()
  @Type(() => LocationDto)
  pickupLocation: LocationDto;

  @ValidateNested()
  @Type(() => LocationDto)
  deliveryLocation: LocationDto;

  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;

  @Type(() => Date)
  @IsDate()
  estimatedPickupTime: Date;

  @Type(() => Date)
  @IsDate()
  estimatedDeliveryTime: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  actualPickupTime?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  actualDeliveryTime?: Date;

  @Type(() => Date)
  @IsDate()
  createdAt: Date;

  @Type(() => Date)
  @IsDate()
  updatedAt: Date;
} 