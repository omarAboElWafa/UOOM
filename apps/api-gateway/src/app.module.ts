import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';

import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';
import { CircuitBreakerModule } from './common/circuit-breaker/circuit-breaker.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),

    // Rate limiting
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minute
      limit: 1000, // 1000 requests per minute per IP
    }]),

    // Caching
    CacheModule.register({
      isGlobal: true,
      ttl: 300, // 5 minutes default TTL
      max: 1000, // Maximum number of items in cache
    }),

    // HTTP client for service calls
    HttpModule.register({
      timeout: 10000, // 10 second timeout
      maxRedirects: 3,
    }),

    // Feature modules
    GatewayModule,
    HealthModule,
    CircuitBreakerModule,
    MetricsModule,
    TerminusModule,
  ],
})
export class AppModule {} 