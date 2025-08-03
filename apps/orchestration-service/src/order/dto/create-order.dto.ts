import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsArray, IsNotEmpty, IsNumber, IsOptional, ValidateNested, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ description: 'Item name' })
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Quantity', minimum: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Unit price' })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({ description: 'Total price for this item', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPrice?: number;

  @ApiProperty({ description: 'Special instructions for this item', required: false })
  @IsOptional()
  @IsString()
  specialInstructions?: string;
}

export class DeliveryAddressDto {
  @ApiProperty({ description: 'Street address' })
  @IsNotEmpty()
  street: string;

  @ApiProperty({ description: 'City' })
  @IsNotEmpty()
  city: string;

  @ApiProperty({ description: 'Postal code' })
  @IsNotEmpty()
  postalCode: string;

  @ApiProperty({ description: 'Latitude' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ description: 'Longitude' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;
}

// Alias for backward compatibility
export class OrderLocationDto extends DeliveryAddressDto {}

export class CreateOrderDto {
  @ApiProperty({ description: 'Customer ID' })
  @IsUUID()
  customerId: string;

  @ApiProperty({ description: 'Order items', type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ description: 'Delivery address', type: DeliveryAddressDto })
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress: DeliveryAddressDto;

  // Alias for backward compatibility
  @ApiProperty({ description: 'Delivery location (alias for deliveryAddress)', type: DeliveryAddressDto })
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryLocation: DeliveryAddressDto;

  @ApiProperty({ description: 'Order priority', minimum: 1, maximum: 5, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  priority?: number = 1;

  @ApiProperty({ description: 'Maximum delivery time in minutes', required: false })
  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(120)
  maxDeliveryTimeMinutes?: number = 60;

  @ApiProperty({ description: 'Special instructions for the order', required: false })
  @IsOptional()
  @IsNotEmpty()
  specialInstructions?: string;

  @ApiProperty({ description: 'Correlation ID for tracking', required: false })
  @IsOptional()
  @IsString()
  correlationId?: string;
} 