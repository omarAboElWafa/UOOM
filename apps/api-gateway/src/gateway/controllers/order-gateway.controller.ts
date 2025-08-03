import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Headers,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiParam } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { GatewayService } from '../services/gateway.service';
import { RequestTransformService } from '../services/request-transform.service';
import { ResponseTransformService } from '../services/response-transform.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CacheInterceptor } from '@nestjs/cache-manager';

@Controller('orders')
@ApiTags('orders')
@UseGuards(ThrottlerGuard, AuthGuard)
export class OrderGatewayController {
  constructor(
    private readonly gatewayService: GatewayService,
    private readonly requestTransform: RequestTransformService,
    private readonly responseTransform: ResponseTransformService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Create new order',
    description: 'Proxies order creation to orchestration service with intelligent routing'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Order created successfully' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid request data' 
  })
  @ApiResponse({ 
    status: 429, 
    description: 'Rate limit exceeded' 
  })
  @ApiResponse({ 
    status: 503, 
    description: 'Service unavailable - circuit breaker open' 
  })
  @ApiHeader({
    name: 'X-Correlation-ID',
    description: 'Correlation ID for request tracking',
    required: false,
  })
  async createOrder(
    @Body() orderData: any,
    @Headers() headers: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const correlationId = headers['x-correlation-id'] || this.generateCorrelationId();
    
    try {
      // Transform request
      const transformedRequest = await this.requestTransform.transformCreateOrder(
        orderData, 
        headers, 
        req
      );

      // Route to orchestration service with circuit breaker
      const response = await this.gatewayService.proxyRequest({
        method: 'POST',
        service: 'orchestration-service',
        path: '/api/v1/orders',
        data: transformedRequest,
        headers: {
          ...headers,
          'x-correlation-id': correlationId,
          'x-gateway-request-id': this.generateRequestId(),
        },
        timeout: 5000, // 5 second timeout for order creation
      });

      // Transform response
      const transformedResponse = await this.responseTransform.transformOrderResponse(
        response.data,
        correlationId
      );

      res.status(response.status).json(transformedResponse);
    } catch (error) {
      await this.handleProxyError(error, res, correlationId);
    }
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get order details',
    description: 'Retrieves complete order information from orchestration service'
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Order details retrieved' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Order not found' 
  })
  async getOrder(
    @Param('id') orderId: string,
    @Headers() headers: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const correlationId = headers['x-correlation-id'] || this.generateCorrelationId();
    
    try {
      const response = await this.gatewayService.proxyRequest({
        method: 'GET',
        service: 'orchestration-service',
        path: `/api/v1/orders/${orderId}`,
        headers: {
          ...headers,
          'x-correlation-id': correlationId,
        },
        timeout: 3000,
      });

      const transformedResponse = await this.responseTransform.transformOrderResponse(
        response.data,
        correlationId
      );

      res.status(response.status).json(transformedResponse);
    } catch (error) {
      await this.handleProxyError(error, res, correlationId);
    }
  }

  @Get(':id/status')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ 
    summary: 'Get order status',
    description: 'Retrieves order status with caching for optimal performance (<5ms target)'
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Order status retrieved' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Order not found' 
  })
  async getOrderStatus(
    @Param('id') orderId: string,
    @Headers() headers: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const correlationId = headers['x-correlation-id'] || this.generateCorrelationId();
    
    try {
      const response = await this.gatewayService.proxyRequest({
        method: 'GET',
        service: 'orchestration-service',
        path: `/api/v1/orders/${orderId}/status`,
        headers: {
          ...headers,
          'x-correlation-id': correlationId,
        },
        timeout: 1000, // Fast timeout for status queries
        cacheTtl: 30, // Cache for 30 seconds
      });

      const transformedResponse = await this.responseTransform.transformStatusResponse(
        response.data,
        correlationId
      );

      // Set cache headers
      res.set({
        'Cache-Control': 'public, max-age=30',
        'X-Cache-Status': response.fromCache ? 'HIT' : 'MISS',
      });

      res.status(response.status).json(transformedResponse);
    } catch (error) {
      await this.handleProxyError(error, res, correlationId);
    }
  }

  @Put(':id')
  @ApiOperation({ 
    summary: 'Update order',
    description: 'Updates order with event-driven processing'
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Order updated successfully' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Order not found' 
  })
  async updateOrder(
    @Param('id') orderId: string,
    @Body() updateData: any,
    @Headers() headers: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const correlationId = headers['x-correlation-id'] || this.generateCorrelationId();
    
    try {
      const transformedRequest = await this.requestTransform.transformUpdateOrder(
        updateData, 
        headers, 
        req
      );

      const response = await this.gatewayService.proxyRequest({
        method: 'PUT',
        service: 'orchestration-service',
        path: `/api/v1/orders/${orderId}`,
        data: transformedRequest,
        headers: {
          ...headers,
          'x-correlation-id': correlationId,
        },
        timeout: 5000,
      });

      const transformedResponse = await this.responseTransform.transformOrderResponse(
        response.data,
        correlationId
      );

      res.status(response.status).json(transformedResponse);
    } catch (error) {
      await this.handleProxyError(error, res, correlationId);
    }
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Cancel order',
    description: 'Cancels an order with proper workflow orchestration'
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Order cancelled successfully' 
  })
  async cancelOrder(
    @Param('id') orderId: string,
    @Headers() headers: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const correlationId = headers['x-correlation-id'] || this.generateCorrelationId();
    
    try {
      const response = await this.gatewayService.proxyRequest({
        method: 'POST',
        service: 'orchestration-service',
        path: `/api/v1/orders/${orderId}/cancel`,
        headers: {
          ...headers,
          'x-correlation-id': correlationId,
        },
        timeout: 5000,
      });

      const transformedResponse = await this.responseTransform.transformOrderResponse(
        response.data,
        correlationId
      );

      res.status(response.status).json(transformedResponse);
    } catch (error) {
      await this.handleProxyError(error, res, correlationId);
    }
  }

  private generateCorrelationId(): string {
    return `gw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async handleProxyError(error: any, res: Response, correlationId: string) {
    const errorResponse = await this.responseTransform.transformErrorResponse(
      error,
      correlationId
    );

    res.status(error.status || 500).json(errorResponse);
  }
} 