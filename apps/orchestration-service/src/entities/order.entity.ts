import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { OrderStatus, OrderPriority } from '@calo/shared';

@Entity('orders')
@Index(['customerId', 'status'])
@Index(['restaurantId', 'status'])
@Index(['status', 'createdAt'])
@Index(['priority', 'createdAt'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'customer_id' })
  @Index()
  customerId: string;

  @Column({ type: 'uuid', name: 'restaurant_id' })
  @Index()
  restaurantId: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  @Index()
  status: OrderStatus;

  @Column({
    type: 'enum',
    enum: OrderPriority,
    default: OrderPriority.NORMAL,
  })
  priority: OrderPriority;

  @Column({ type: 'jsonb' })
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    specialInstructions?: string;
  }>;

  @Column({ type: 'jsonb', name: 'delivery_location' })
  deliveryLocation: {
    latitude: number;
    longitude: number;
    address: string;
    city?: string;
    postalCode?: string;
  };

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  tax: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'delivery_fee' })
  deliveryFee: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: number;

  @Column({ type: 'text', nullable: true, name: 'special_instructions' })
  specialInstructions?: string;

  @Column({ type: 'timestamp', nullable: true, name: 'estimated_delivery_time' })
  estimatedDeliveryTime?: Date;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'tracking_code' })
  trackingCode?: string;

  @Column({ type: 'uuid', nullable: true, name: 'assigned_driver_id' })
  @Index()
  assignedDriverId?: string;

  @Column({ type: 'text', nullable: true, name: 'failure_reason' })
  failureReason?: string;

  @Column({ type: 'integer', default: 0, name: 'version' })
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Virtual columns for performance
  @Column({ type: 'boolean', default: false, name: 'is_urgent' })
  @Index()
  isUrgent: boolean;

  @Column({ type: 'boolean', default: false, name: 'is_optimized' })
  isOptimized: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'optimization_requested_at' })
  optimizationRequestedAt?: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'optimization_completed_at' })
  optimizationCompletedAt?: Date;

  // Computed properties
  get isHighPriority(): boolean {
    return this.priority === OrderPriority.HIGH || this.priority === OrderPriority.URGENT;
  }

  get isDelayed(): boolean {
    if (!this.estimatedDeliveryTime) return false;
    return new Date() > this.estimatedDeliveryTime;
  }

  get deliveryTimeMinutes(): number {
    if (!this.estimatedDeliveryTime || !this.createdAt) return 0;
    return Math.round((this.estimatedDeliveryTime.getTime() - this.createdAt.getTime()) / (1000 * 60));
  }
} 