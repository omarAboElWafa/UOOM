import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@calo/shared';

export class OrderStatusDto {
  @ApiProperty({ description: 'Order ID' })
  id: string;

  @ApiProperty({ description: 'Order status', enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ description: 'Estimated delivery time', required: false })
  estimatedDeliveryTime?: Date;

  @ApiProperty({ description: 'Tracking code', required: false })
  trackingCode?: string;

  @ApiProperty({ description: 'Last updated' })
  updatedAt: Date;
} 