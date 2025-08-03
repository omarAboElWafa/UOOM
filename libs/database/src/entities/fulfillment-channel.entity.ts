import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from 'typeorm';

export enum ChannelType {
  INTERNAL_KITCHEN = 'INTERNAL_KITCHEN',
  DARK_STORE = 'DARK_STORE',
  EXTERNAL_PARTNER = 'EXTERNAL_PARTNER',
}

@Entity('fulfillment_channels')
export class FulfillmentChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: ChannelType,
  })
  type: ChannelType;

  @Column('int')
  totalCapacity: number;

  @Column('int', { default: 0 })
  @Index()
  currentLoad: number;

  @Column('int')
  availableCapacity: number;

  @Column('decimal', { precision: 5, scale: 2 })
  qualityScore: number;

  @Column('decimal', { precision: 8, scale: 2 })
  costPerOrder: number;

  @Column('int')
  avgPrepTimeMinutes: number;

  @Column('decimal', { precision: 10, scale: 6 })
  latitude: number;

  @Column('decimal', { precision: 10, scale: 6 })
  longitude: number;

  @Column('boolean', { default: true })
  @Index()
  isActive: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
} 