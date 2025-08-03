import { IsUUID, IsString, IsNumber, IsDate, IsOptional, IsEnum, ValidateNested, IsArray, IsNotEmpty, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { RestaurantStatus, CuisineType } from '../types/restaurant.types';

export class RestaurantLocationDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @IsString()
  @IsNotEmpty()
  country: string;
}

export class RestaurantHoursDto {
  @IsNumber()
  dayOfWeek: number;

  @IsString()
  openTime: string;

  @IsString()
  closeTime: string;

  @IsBoolean()
  isOpen: boolean;
}

export class CreateRestaurantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum(CuisineType)
  cuisineType: CuisineType;

  @ValidateNested()
  @Type(() => RestaurantLocationDto)
  location: RestaurantLocationDto;

  @ValidateNested({ each: true })
  @Type(() => RestaurantHoursDto)
  @IsArray()
  hours: RestaurantHoursDto[];

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsNumber()
  minimumOrderAmount: number;

  @IsNumber()
  deliveryFee: number;

  @IsNumber()
  estimatedPreparationTime: number;
}

export class UpdateRestaurantDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @IsOptional()
  @IsEnum(RestaurantStatus)
  status?: RestaurantStatus;

  @IsOptional()
  @IsEnum(CuisineType)
  cuisineType?: CuisineType;

  @IsOptional()
  @ValidateNested()
  @Type(() => RestaurantLocationDto)
  location?: RestaurantLocationDto;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RestaurantHoursDto)
  @IsArray()
  hours?: RestaurantHoursDto[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  email?: string;

  @IsOptional()
  @IsNumber()
  minimumOrderAmount?: number;

  @IsOptional()
  @IsNumber()
  deliveryFee?: number;

  @IsOptional()
  @IsNumber()
  estimatedPreparationTime?: number;
}

export class RestaurantResponseDto {
  @IsUUID()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum(RestaurantStatus)
  status: RestaurantStatus;

  @IsEnum(CuisineType)
  cuisineType: CuisineType;

  @ValidateNested()
  @Type(() => RestaurantLocationDto)
  location: RestaurantLocationDto;

  @ValidateNested({ each: true })
  @Type(() => RestaurantHoursDto)
  @IsArray()
  hours: RestaurantHoursDto[];

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsNumber()
  averageRating: number;

  @IsNumber()
  totalReviews: number;

  @IsNumber()
  minimumOrderAmount: number;

  @IsNumber()
  deliveryFee: number;

  @IsNumber()
  estimatedPreparationTime: number;

  @Type(() => Date)
  @IsDate()
  createdAt: Date;

  @Type(() => Date)
  @IsDate()
  updatedAt: Date;
} 