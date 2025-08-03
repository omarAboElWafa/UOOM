import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';

import { OrderModule } from './order/order.module';
import { OptimizationModule } from './optimization/optimization.module';
import { HealthModule } from './health/health.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { OutboxModule } from './outbox/outbox.module';
import { RoutingModule } from './routing/routing.module';
import { SagaModule } from './saga/saga.module';

// Import all entities
import { Order } from './entities/order.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { DeliveryAssignment } from './entities/delivery-assignment.entity';
import { Driver } from './entities/driver.entity';
import { Restaurant } from './entities/restaurant.entity';
import { Saga } from './entities/saga.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT) || 5432,
      username: process.env.DATABASE_USERNAME || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'password',
      database: process.env.DATABASE_NAME || 'uoom_orchestration',
      entities: [Order, OutboxEvent, DeliveryAssignment, Driver, Restaurant, Saga],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV === 'development',
    }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
      },
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 5000, // 5 seconds
    }),
    OrderModule,
    OptimizationModule,
    HealthModule,
    MonitoringModule,
    OutboxModule,
    RoutingModule,
    SagaModule, // Add saga module
  ],
})
export class AppModule {} 