import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { CapacityService } from './capacity.service';
import { ChannelTrackingService } from './channel-tracking.service';

export interface UpdateCapacityDto {
  channelId: string;
  currentLoad: number;
  capacity: number;
  isActive: boolean;
}

export interface CapacityResponseDto {
  channelId: string;
  capacity: number;
  currentLoad: number;
  availableCapacity: number;
  utilizationPercent: number;
  isActive: boolean;
  lastUpdated: Date;
}

@Controller('capacity')
@ApiTags('capacity')
@UseGuards(ThrottlerGuard)
export class CapacityController {
  constructor(
    private readonly capacityService: CapacityService,
    private readonly channelTrackingService: ChannelTrackingService,
  ) {}

  @Get()
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Get overall capacity status' })
  @ApiResponse({ status: 200, description: 'Capacity status retrieved' })
  async getCapacityStatus() {
    return this.capacityService.getOverallCapacityStatus();
  }

  @Get('channels')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Get all channel capacities' })
  @ApiQuery({ name: 'active', required: false, type: 'boolean' })
  @ApiResponse({ status: 200, description: 'Channel capacities retrieved' })
  async getChannelCapacities(@Query('active') activeOnly?: boolean): Promise<CapacityResponseDto[]> {
    return this.capacityService.getChannelCapacities(activeOnly);
  }

  @Get('channels/:channelId')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Get specific channel capacity' })
  @ApiParam({ name: 'channelId', description: 'Channel ID' })
  @ApiResponse({ status: 200, description: 'Channel capacity retrieved' })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  async getChannelCapacity(@Param('channelId') channelId: string): Promise<CapacityResponseDto> {
    return this.capacityService.getChannelCapacity(channelId);
  }

  @Post('channels/:channelId/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update channel capacity and load' })
  @ApiParam({ name: 'channelId', description: 'Channel ID' })
  @ApiResponse({ status: 200, description: 'Channel capacity updated' })
  @ApiResponse({ status: 400, description: 'Invalid capacity data' })
  async updateChannelCapacity(
    @Param('channelId') channelId: string,
    @Body() updateData: UpdateCapacityDto,
  ): Promise<CapacityResponseDto> {
    return this.capacityService.updateChannelCapacity(channelId, updateData);
  }

  @Put('channels/:channelId/status')
  @ApiOperation({ summary: 'Update channel active status' })
  @ApiParam({ name: 'channelId', description: 'Channel ID' })
  @ApiResponse({ status: 200, description: 'Channel status updated' })
  async updateChannelStatus(
    @Param('channelId') channelId: string,
    @Body() statusData: { isActive: boolean },
  ): Promise<CapacityResponseDto> {
    return this.capacityService.updateChannelStatus(channelId, statusData.isActive);
  }

  @Get('recommendations')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Get channel recommendations based on capacity' })
  @ApiQuery({ name: 'requiredCapacity', required: false, type: 'number' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @ApiResponse({ status: 200, description: 'Channel recommendations retrieved' })
  async getChannelRecommendations(
    @Query('requiredCapacity') requiredCapacity?: number,
    @Query('limit') limit?: number,
  ) {
    return this.capacityService.getChannelRecommendations(requiredCapacity || 1, limit || 5);
  }

  @Get('analytics')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Get capacity analytics and trends' })
  @ApiQuery({ name: 'hours', required: false, type: 'number' })
  @ApiResponse({ status: 200, description: 'Capacity analytics retrieved' })
  async getCapacityAnalytics(@Query('hours') hours?: number) {
    return this.channelTrackingService.getCapacityAnalytics(hours || 24);
  }

  @Post('channels/:channelId/reserve')
  @ApiOperation({ summary: 'Reserve capacity for an order' })
  @ApiParam({ name: 'channelId', description: 'Channel ID' })
  @ApiResponse({ status: 200, description: 'Capacity reserved' })
  @ApiResponse({ status: 409, description: 'Insufficient capacity' })
  async reserveCapacity(
    @Param('channelId') channelId: string,
    @Body() reservationData: { orderId: string; requiredCapacity: number },
  ) {
    return this.capacityService.reserveCapacity(
      channelId,
      reservationData.orderId,
      reservationData.requiredCapacity,
    );
  }

  @Post('channels/:channelId/release')
  @ApiOperation({ summary: 'Release reserved capacity' })
  @ApiParam({ name: 'channelId', description: 'Channel ID' })
  @ApiResponse({ status: 200, description: 'Capacity released' })
  async releaseCapacity(
    @Param('channelId') channelId: string,
    @Body() releaseData: { orderId: string; releasedCapacity: number },
  ) {
    return this.capacityService.releaseCapacity(
      channelId,
      releaseData.orderId,
      releaseData.releasedCapacity,
    );
  }
} 