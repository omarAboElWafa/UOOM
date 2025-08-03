import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsArray, IsNotEmpty, IsNumber, IsOptional, ValidateNested, Min, Max } from 'class-validator';
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
} 