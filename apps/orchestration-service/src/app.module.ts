import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { HttpModule } from '@nestjs/axios';

// Feature Modules
import { OrderModule } from './order/order.module';
import { RoutingModule } from './routing/routing.module';
import { OutboxModule } from './outbox/outbox.module';
import { HealthModule } from './health/health.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { OptimizationModule } from './optimization/optimization.module';

// Entities
import { Order, OutboxEvent, Restaurant, Driver, DeliveryAssignment } from './entities';

// Guards
import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

// Interceptors
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { TransformInterceptor } from './interceptors/transform.interceptor';

// Filters
import { HttpExceptionFilter } from './filters/http-exception.filter';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get('DB_USERNAME', 'postgres'),
        password: configService.get('DB_PASSWORD', 'password'),
        database: configService.get('DB_DATABASE', 'uoop'),
        entities: [Order, Restaurant, Driver, DeliveryAssignment, OutboxEvent],
        synchronize: configService.get('NODE_ENV') !== 'production',
        logging: configService.get('NODE_ENV') === 'development',
        ssl: configService.get('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
        extra: {
          connectionLimit: 20,
          acquireTimeout: 60000,
          timeout: 60000,
        },
      }),
      inject: [ConfigService],
    }),

    // Event Emitter
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Health Checks
    TerminusModule,

    // Queue Management
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
          db: configService.get<number>('REDIS_DB', 0),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
      inject: [ConfigService],
    }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('THROTTLE_TTL', 60),
            limit: configService.get<number>('THROTTLE_LIMIT', 1000),
          },
        ],
      }),
      inject: [ConfigService],
    }),

    // Caching
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        store: 'redis',
        host: configService.get('REDIS_HOST', 'localhost'),
        port: configService.get<number>('REDIS_PORT', 6379),
        password: configService.get('REDIS_PASSWORD'),
        db: configService.get<number>('REDIS_CACHE_DB', 1),
        ttl: 300, // 5 minutes
        max: 1000,
      }),
      inject: [ConfigService],
    }),

    // HTTP Module for external service calls
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        timeout: 5000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'UOOP-Orchestration-Service',
        },
      }),
      inject: [ConfigService],
    }),

    // Feature Modules
    TypeOrmModule.forFeature([
      Order,
      Restaurant,
      Driver,
      DeliveryAssignment,
      OutboxEvent,
    ]),

    // Queue Modules
    BullModule.registerQueue(
      { name: 'orders' },
      { name: 'optimization' },
      { name: 'outbox' },
    ),

    // Feature Modules
    OrderModule,
    RoutingModule,
    OutboxModule,
    HealthModule,
    MonitoringModule,
    OptimizationModule,
  ],
  providers: [
    // Guards
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },

    // Interceptors
    LoggingInterceptor,
    TransformInterceptor,

    // Filters
    HttpExceptionFilter,
  ],
})
export class AppModule {} 