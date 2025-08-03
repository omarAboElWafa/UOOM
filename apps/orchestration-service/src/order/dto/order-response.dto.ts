import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@calo/shared';

export class OrderResponseDto {
  @ApiProperty({ description: 'Order ID' })
  id: string;

  @ApiProperty({ description: 'Customer ID' })
  customerId: string;

  @ApiProperty({ description: 'Assigned fulfillment channel ID' })
  channelId: string;

  @ApiProperty({ description: 'Order status', enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ description: 'Total amount' })
  totalAmount: number;

  @ApiProperty({ description: 'Estimated delivery time' })
  estimatedDeliveryTime: Date;

  @ApiProperty({ description: 'Order creation time' })
  createdAt: Date;

  @ApiProperty({ description: 'Correlation ID for tracking' })
  correlationId: string;
} 