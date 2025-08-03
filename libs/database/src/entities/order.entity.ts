import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { OrderStatus } from '../enums/order-status.enum';

@Entity('orders')
@Index(['customerId', 'createdAt'])
@Index(['channelId', 'status'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  customerId: string;

  @Column('uuid', { nullable: true })
  channelId: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  @Index()
  status: OrderStatus;

  @Column('jsonb')
  items: any[];

  @Column('jsonb')
  deliveryAddress: any;

  @Column('decimal', { precision: 10, scale: 2 })
  totalAmount: number;

  @Column('varchar', { length: 100, nullable: true })
  correlationId: string;

  @Column('int', { default: 1 })
  priority: number;

  @Column('timestamp', { nullable: true })
  estimatedDeliveryTime: Date;

  @Column('timestamp', { nullable: true })
  actualDeliveryTime: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
} 