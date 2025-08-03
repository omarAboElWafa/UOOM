import { IsUUID, IsString, IsNumber, IsOptional, IsEnum, ValidateNested, IsArray, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { OrderPriority } from '@calo/shared';

export class OrderItemDto {
  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ description: 'Item name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Quantity' })
  @IsNumber()
  quantity: number;

  @ApiProperty({ description: 'Unit price' })
  @IsNumber()
  unitPrice: number;

  @ApiProperty({ description: 'Total price' })
  @IsNumber()
  totalPrice: number;

  @ApiProperty({ description: 'Special instructions', required: false })
  @IsOptional()
  @IsString()
  specialInstructions?: string;
}

export class OrderLocationDto {
  @ApiProperty({ description: 'Latitude' })
  @IsNumber()
  latitude: number;

  @ApiProperty({ description: 'Longitude' })
  @IsNumber()
  longitude: number;

  @ApiProperty({ description: 'Delivery address' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ description: 'City', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ description: 'Postal code', required: false })
  @IsOptional()
  @IsString()
  postalCode?: string;
}

export class CreateOrderDto {
  @ApiProperty({ description: 'Customer ID' })
  @IsUUID()
  customerId: string;

  @ApiProperty({ description: 'Restaurant ID' })
  @IsUUID()
  restaurantId: string;

  @ApiProperty({ description: 'Order items', type: [OrderItemDto] })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  @IsArray()
  items: OrderItemDto[];

  @ApiProperty({ description: 'Delivery location', type: OrderLocationDto })
  @ValidateNested()
  @Type(() => OrderLocationDto)
  deliveryLocation: OrderLocationDto;

  @ApiProperty({ description: 'Order priority', enum: OrderPriority, required: false })
  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @ApiProperty({ description: 'Special instructions', required: false })
  @IsOptional()
  @IsString()
  specialInstructions?: string;
} 