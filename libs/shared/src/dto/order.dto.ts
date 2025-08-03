import { IsUUID, IsString, IsNumber, IsDate, IsOptional, IsEnum, ValidateNested, IsArray, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus, OrderPriority } from '../types/order.types';

export class OrderItemDto {
  @IsUUID()
  itemId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitPrice: number;

  @IsNumber()
  totalPrice: number;

  @IsOptional()
  @IsString()
  specialInstructions?: string;
}

export class OrderLocationDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;
}

export class CreateOrderDto {
  @IsUUID()
  customerId: string;

  @IsUUID()
  restaurantId: string;

  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  @IsArray()
  items: OrderItemDto[];

  @ValidateNested()
  @Type(() => OrderLocationDto)
  deliveryLocation: OrderLocationDto;

  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @IsOptional()
  @IsString()
  specialInstructions?: string;
}

export class UpdateOrderDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  estimatedDeliveryTime?: Date;

  @IsOptional()
  @IsString()
  trackingCode?: string;

  @IsOptional()
  @IsUUID()
  assignedDriverId?: string;

  @IsOptional()
  @IsString()
  failureReason?: string;
}

export class OrderResponseDto {
  @IsUUID()
  id: string;

  @IsUUID()
  customerId: string;

  @IsUUID()
  restaurantId: string;

  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsEnum(OrderPriority)
  priority: OrderPriority;

  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  @IsArray()
  items: OrderItemDto[];

  @ValidateNested()
  @Type(() => OrderLocationDto)
  deliveryLocation: OrderLocationDto;

  @IsNumber()
  subtotal: number;

  @IsNumber()
  tax: number;

  @IsNumber()
  deliveryFee: number;

  @IsNumber()
  total: number;

  @Type(() => Date)
  @IsDate()
  createdAt: Date;

  @Type(() => Date)
  @IsDate()
  updatedAt: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  estimatedDeliveryTime?: Date;

  @IsOptional()
  @IsString()
  trackingCode?: string;

  @IsOptional()
  @IsUUID()
  assignedDriverId?: string;

  @IsOptional()
  @IsString()
  failureReason?: string;
} 