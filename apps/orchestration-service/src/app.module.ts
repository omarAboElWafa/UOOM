import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';

// Controllers
import { OrdersController } from './controllers/orders.controller';
import { RestaurantsController } from './controllers/restaurants.controller';
import { DeliveryController } from './controllers/delivery.controller';
import { OptimizationController } from './controllers/optimization.controller';
import { HealthController } from './controllers/health.controller';

// Services
import { OrdersService } from './services/orders.service';
import { RestaurantsService } from './services/restaurants.service';
import { DeliveryService } from './services/delivery.service';
import { OptimizationService } from './services/optimization.service';
import { CapacityService } from './services/capacity.service';
import { EventService } from './services/event.service';
import { OutboxService } from './services/outbox.service';

// Repositories
import { OrdersRepository } from './repositories/orders.repository';
import { RestaurantsRepository } from './repositories/restaurants.repository';
import { DeliveryRepository } from './repositories/delivery.repository';
import { OutboxRepository } from './repositories/outbox.repository';

// Entities
import { Order } from './entities/order.entity';
import { Restaurant } from './entities/restaurant.entity';
import { Driver } from './entities/driver.entity';
import { DeliveryAssignment } from './entities/delivery-assignment.entity';
import { OutboxEvent } from './entities/outbox-event.entity';

// Processors
import { OrderProcessor } from './processors/order.processor';
import { OptimizationProcessor } from './processors/optimization.processor';
import { OutboxProcessor } from './processors/outbox.processor';

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
        ttl: configService.get<number>('THROTTLE_TTL', 60),
        limit: configService.get<number>('THROTTLE_LIMIT', 100),
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
  ],
  controllers: [
    OrdersController,
    RestaurantsController,
    DeliveryController,
    OptimizationController,
    HealthController,
  ],
  providers: [
    // Services
    OrdersService,
    RestaurantsService,
    DeliveryService,
    OptimizationService,
    CapacityService,
    EventService,
    OutboxService,

    // Repositories
    OrdersRepository,
    RestaurantsRepository,
    DeliveryRepository,
    OutboxRepository,

    // Processors
    OrderProcessor,
    OptimizationProcessor,
    OutboxProcessor,

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