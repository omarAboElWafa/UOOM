import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';

import { HealthController } from './health.controller';
import { HealthService } from '../health/health.service';
import { GatewayModule } from '../gateway/gateway.module';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';

@Module({
  imports: [
    TerminusModule,
    HttpModule,
    GatewayModule,
    CircuitBreakerModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {} 