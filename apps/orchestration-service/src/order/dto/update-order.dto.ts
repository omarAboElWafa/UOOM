import { IsOptional, IsString, IsNumber, IsEnum, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, OrderPriority } from '@calo/shared';
import { OrderItemDto, OrderLocationDto } from './create-order.dto';

export class UpdateOrderDto {
  @ApiProperty({ description: 'Order status', enum: OrderStatus, required: false })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiProperty({ description: 'Order priority', enum: OrderPriority, required: false })
  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @ApiProperty({ description: 'Order items', type: [OrderItemDto], required: false })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  @IsArray()
  items?: OrderItemDto[];

  @ApiProperty({ description: 'Delivery location', type: OrderLocationDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderLocationDto)
  deliveryLocation?: OrderLocationDto;

  @ApiProperty({ description: 'Special instructions', required: false })
  @IsOptional()
  @IsString()
  specialInstructions?: string;

  @ApiProperty({ description: 'Estimated delivery time', required: false })
  @IsOptional()
  estimatedDeliveryTime?: Date;

  @ApiProperty({ description: 'Tracking code', required: false })
  @IsOptional()
  @IsString()
  trackingCode?: string;

  @ApiProperty({ description: 'Assigned driver ID', required: false })
  @IsOptional()
  @IsString()
  assignedDriverId?: string;

  @ApiProperty({ description: 'Failure reason', required: false })
  @IsOptional()
  @IsString()
  failureReason?: string;
} 