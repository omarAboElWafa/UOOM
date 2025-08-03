import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, OrderPriority } from '@calo/shared';
import { OrderItemDto, OrderLocationDto } from './create-order.dto';

export class OrderResponseDto {
  @ApiProperty({ description: 'Order ID' })
  id: string;

  @ApiProperty({ description: 'Customer ID' })
  customerId: string;

  @ApiProperty({ description: 'Restaurant ID' })
  restaurantId: string;

  @ApiProperty({ description: 'Channel ID' })
  channelId: string;

  @ApiProperty({ description: 'Order status', enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ description: 'Order priority', enum: OrderPriority })
  priority: OrderPriority;

  @ApiProperty({ description: 'Order items', type: [OrderItemDto] })
  items: OrderItemDto[];

  @ApiProperty({ description: 'Delivery location', type: OrderLocationDto })
  deliveryLocation: OrderLocationDto;

  @ApiProperty({ description: 'Subtotal' })
  subtotal: number;

  @ApiProperty({ description: 'Tax amount' })
  tax: number;

  @ApiProperty({ description: 'Delivery fee' })
  deliveryFee: number;

  @ApiProperty({ description: 'Total amount' })
  total: number;

  @ApiProperty({ description: 'Special instructions', required: false })
  specialInstructions?: string;

  @ApiProperty({ description: 'Estimated delivery time', required: false })
  estimatedDeliveryTime?: Date;

  @ApiProperty({ description: 'Tracking code', required: false })
  trackingCode?: string;

  @ApiProperty({ description: 'Assigned driver ID', required: false })
  assignedDriverId?: string;

  @ApiProperty({ description: 'Failure reason', required: false })
  failureReason?: string;

  @ApiProperty({ description: 'Correlation ID' })
  correlationId: string;

  @ApiProperty({ description: 'Created at' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated at' })
  updatedAt: Date;
} 