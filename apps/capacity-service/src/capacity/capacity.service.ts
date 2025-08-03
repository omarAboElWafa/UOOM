import { Injectable, Logger, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CapacityResponseDto, UpdateCapacityDto } from './capacity.controller';

interface ChannelCapacity {
  channelId: string;
  capacity: number;
  currentLoad: number;
  reservedCapacity: number;
  isActive: boolean;
  lastUpdated: Date;
  reservations: Map<string, number>; // orderId -> capacity
}

@Injectable()
export class CapacityService {
  private readonly logger = new Logger(CapacityService.name);
  private channels = new Map<string, ChannelCapacity>();

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
    this.initializeChannels();
  }

  private initializeChannels() {
    // Initialize with demo channels
    for (let i = 1; i <= 25; i++) {
      const channelId = `channel-${i}`;
      this.channels.set(channelId, {
        channelId,
        capacity: 50,
        currentLoad: Math.floor(Math.random() * 30),
        reservedCapacity: 0,
        isActive: Math.random() > 0.1, // 90% chance of being active
        lastUpdated: new Date(),
        reservations: new Map(),
      });
    }
    this.logger.log(`Initialized ${this.channels.size} channels`);
  }

  async getOverallCapacityStatus() {
    const allChannels = Array.from(this.channels.values());
    const activeChannels = allChannels.filter(c => c.isActive);
    
    const totalCapacity = activeChannels.reduce((sum, c) => sum + c.capacity, 0);
    const totalUsed = activeChannels.reduce((sum, c) => sum + c.currentLoad + c.reservedCapacity, 0);
    const totalAvailable = totalCapacity - totalUsed;

    return {
      totalCapacity,
      totalUsed,
      totalAvailable,
      utilizationPercent: totalCapacity > 0 ? (totalUsed / totalCapacity * 100).toFixed(2) : '0.00',
      activeChannels: activeChannels.length,
      totalChannels: allChannels.length,
      timestamp: new Date().toISOString(),
    };
  }

  async getChannelCapacities(activeOnly?: boolean): Promise<CapacityResponseDto[]> {
    const channels = Array.from(this.channels.values());
    const filteredChannels = activeOnly ? channels.filter(c => c.isActive) : channels;

    return filteredChannels.map(channel => this.mapToResponseDto(channel));
  }

  async getChannelCapacity(channelId: string): Promise<CapacityResponseDto> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new NotFoundException(`Channel ${channelId} not found`);
    }

    return this.mapToResponseDto(channel);
  }

  async updateChannelCapacity(channelId: string, updateData: UpdateCapacityDto): Promise<CapacityResponseDto> {
    let channel = this.channels.get(channelId);
    
    if (!channel) {
      // Create new channel if it doesn't exist
      channel = {
        channelId,
        capacity: updateData.capacity,
        currentLoad: updateData.currentLoad,
        reservedCapacity: 0,
        isActive: updateData.isActive,
        lastUpdated: new Date(),
        reservations: new Map(),
      };
      this.channels.set(channelId, channel);
      this.logger.log(`Created new channel: ${channelId}`);
    } else {
      // Update existing channel
      channel.capacity = updateData.capacity;
      channel.currentLoad = updateData.currentLoad;
      channel.isActive = updateData.isActive;
      channel.lastUpdated = new Date();
      this.logger.log(`Updated channel: ${channelId}`);
    }

    // Cache the updated capacity
    await this.cacheManager.set(`capacity:${channelId}`, channel, 300); // 5 minutes TTL

    return this.mapToResponseDto(channel);
  }

  async updateChannelStatus(channelId: string, isActive: boolean): Promise<CapacityResponseDto> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new NotFoundException(`Channel ${channelId} not found`);
    }

    channel.isActive = isActive;
    channel.lastUpdated = new Date();

    this.logger.log(`Updated channel ${channelId} status to ${isActive ? 'active' : 'inactive'}`);

    return this.mapToResponseDto(channel);
  }

  async getChannelRecommendations(requiredCapacity: number, limit: number) {
    const activeChannels = Array.from(this.channels.values())
      .filter(c => c.isActive)
      .filter(c => this.getAvailableCapacity(c) >= requiredCapacity)
      .sort((a, b) => {
        // Sort by available capacity (descending) then by utilization (ascending)
        const availableA = this.getAvailableCapacity(a);
        const availableB = this.getAvailableCapacity(b);
        
        if (availableA !== availableB) {
          return availableB - availableA;
        }
        
        const utilizationA = (a.currentLoad + a.reservedCapacity) / a.capacity;
        const utilizationB = (b.currentLoad + b.reservedCapacity) / b.capacity;
        
        return utilizationA - utilizationB;
      })
      .slice(0, limit);

    return {
      recommendations: activeChannels.map(channel => ({
        ...this.mapToResponseDto(channel),
        score: this.calculateRecommendationScore(channel, requiredCapacity),
        reason: this.getRecommendationReason(channel, requiredCapacity),
      })),
      criteria: {
        requiredCapacity,
        totalCandidates: Array.from(this.channels.values()).filter(c => c.isActive).length,
        eligibleChannels: activeChannels.length,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async reserveCapacity(channelId: string, orderId: string, requiredCapacity: number) {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new NotFoundException(`Channel ${channelId} not found`);
    }

    if (!channel.isActive) {
      throw new ConflictException(`Channel ${channelId} is not active`);
    }

    const available = this.getAvailableCapacity(channel);
    if (available < requiredCapacity) {
      throw new ConflictException(
        `Insufficient capacity. Required: ${requiredCapacity}, Available: ${available}`
      );
    }

    // Check if order already has a reservation
    if (channel.reservations.has(orderId)) {
      throw new ConflictException(`Order ${orderId} already has a reservation on channel ${channelId}`);
    }

    // Make reservation
    channel.reservations.set(orderId, requiredCapacity);
    channel.reservedCapacity += requiredCapacity;
    channel.lastUpdated = new Date();

    this.logger.log(`Reserved ${requiredCapacity} capacity for order ${orderId} on channel ${channelId}`);

    return {
      channelId,
      orderId,
      reservedCapacity: requiredCapacity,
      totalReserved: channel.reservedCapacity,
      availableCapacity: this.getAvailableCapacity(channel),
      timestamp: new Date().toISOString(),
    };
  }

  async releaseCapacity(channelId: string, orderId: string, releasedCapacity: number) {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new NotFoundException(`Channel ${channelId} not found`);
    }

    const reservation = channel.reservations.get(orderId);
    if (!reservation) {
      throw new NotFoundException(`No reservation found for order ${orderId} on channel ${channelId}`);
    }

    if (releasedCapacity > reservation) {
      throw new ConflictException(
        `Cannot release ${releasedCapacity} capacity. Only ${reservation} was reserved.`
      );
    }

    // Release capacity
    channel.reservations.delete(orderId);
    channel.reservedCapacity -= reservation;
    channel.lastUpdated = new Date();

    this.logger.log(`Released ${reservation} capacity for order ${orderId} on channel ${channelId}`);

    return {
      channelId,
      orderId,
      releasedCapacity: reservation,
      totalReserved: channel.reservedCapacity,
      availableCapacity: this.getAvailableCapacity(channel),
      timestamp: new Date().toISOString(),
    };
  }

  private mapToResponseDto(channel: ChannelCapacity): CapacityResponseDto {
    const availableCapacity = this.getAvailableCapacity(channel);
    const utilizationPercent = channel.capacity > 0 
      ? ((channel.currentLoad + channel.reservedCapacity) / channel.capacity * 100)
      : 0;

    return {
      channelId: channel.channelId,
      capacity: channel.capacity,
      currentLoad: channel.currentLoad,
      availableCapacity,
      utilizationPercent: Math.round(utilizationPercent * 100) / 100,
      isActive: channel.isActive,
      lastUpdated: channel.lastUpdated,
    };
  }

  private getAvailableCapacity(channel: ChannelCapacity): number {
    return Math.max(0, channel.capacity - channel.currentLoad - channel.reservedCapacity);
  }

  private calculateRecommendationScore(channel: ChannelCapacity, requiredCapacity: number): number {
    const available = this.getAvailableCapacity(channel);
    const utilizationAfter = (channel.currentLoad + channel.reservedCapacity + requiredCapacity) / channel.capacity;
    
    // Score based on available capacity and resulting utilization
    const capacityScore = Math.min(available / requiredCapacity, 2.0); // Cap at 2x required
    const utilizationScore = 1.0 - utilizationAfter; // Prefer lower utilization
    
    return Math.round((capacityScore * 0.6 + utilizationScore * 0.4) * 100) / 100;
  }

  private getRecommendationReason(channel: ChannelCapacity, requiredCapacity: number): string {
    const available = this.getAvailableCapacity(channel);
    const utilizationAfter = (channel.currentLoad + channel.reservedCapacity + requiredCapacity) / channel.capacity;
    
    if (available >= requiredCapacity * 2) {
      return 'High available capacity';
    } else if (utilizationAfter < 0.7) {
      return 'Low utilization after assignment';
    } else {
      return 'Adequate capacity available';
    }
  }
} 