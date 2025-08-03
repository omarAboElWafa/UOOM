import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

import { OrderGatewayController } from '../gateway/controllers/order-gateway.controller';

import { GatewayService } from './services/gateway.service';
import { RequestTransformService } from '../gateway/services/request-transform.service';
import { ResponseTransformService } from '../gateway/services/response-transform.service';
import { ServiceDiscoveryService } from '../gateway/services/service-discovery.service';

import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    CircuitBreakerModule,
  ],
  controllers: [
    OrderGatewayController,
  ],
  providers: [
    GatewayService,
    RequestTransformService,
    ResponseTransformService,
    ServiceDiscoveryService,
  ],
  exports: [
    GatewayService,
    RequestTransformService,
    ResponseTransformService,
    ServiceDiscoveryService,
  ],
})
export class GatewayModule {} 