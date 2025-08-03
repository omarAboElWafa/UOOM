import { Module } from '@nestjs/common';
import { MetricsController } from '../metrics/metrics.controller';
import { MetricsService } from '../metrics/metrics.service';
import { GatewayModule } from '../gateway/gateway.module';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';

@Module({
  imports: [GatewayModule, CircuitBreakerModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {} 