# Redis Integration Module

A comprehensive Redis integration module for the UOOM platform, providing caching, channel ranking, health monitoring, and pub/sub capabilities.

## Features

- **Redis Cluster Support**: Full cluster configuration with automatic failover
- **Channel Ranking Service**: Intelligent channel ranking and recommendation system
- **Health Monitoring**: Comprehensive Redis health checks and metrics
- **Caching Layer**: High-performance caching with TTL and prefix support
- **Pub/Sub Support**: Real-time messaging capabilities
- **Type Safety**: Full TypeScript support with comprehensive interfaces

## Installation

```bash
npm install @calo/redis
```

## Configuration

The module requires the following environment variables:

```bash
# Redis Cluster Configuration
REDIS_CLUSTER_ENDPOINT=your-redis-cluster-endpoint
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Optional Configuration
REDIS_DB=0
REDIS_CONNECT_TIMEOUT=5000
REDIS_MAX_RETRIES=3
```

## Usage

### Basic Module Import

```typescript
import { RedisLibModule } from '@calo/redis';

@Module({
  imports: [RedisLibModule],
  // ...
})
export class AppModule {}
```

### Channel Ranking Service

The `ChannelRankingService` provides intelligent channel ranking and recommendation capabilities:

```typescript
import { ChannelRankingService } from '@calo/redis';

@Injectable()
export class OrderService {
  constructor(
    private readonly channelRankingService: ChannelRankingService,
  ) {}

  async optimizeOrder(order: CreateOrderDto): Promise<string> {
    // Update channel performance metrics
    await this.channelRankingService.updateChannelPerformance({
      channelId: 'channel-1',
      totalOrders: 100,
      successfulOrders: 95,
      failedOrders: 5,
      avgDeliveryTime: 25,
      avgCost: 8.5,
      customerRating: 4.6,
      lastActivity: Date.now(),
    });

    // Get recommended channels for the order
    const recommendedChannels = await this.channelRankingService.getRecommendedChannels(
      order.totalValue,
      order.deliveryDistance,
      order.priority,
      5
    );

    return recommendedChannels[0]?.id || 'default-channel';
  }

  async getChannelRanking(channelId: string) {
    return await this.channelRankingService.getChannelRanking(channelId);
  }

  async getTopChannels(limit: number = 10) {
    return await this.channelRankingService.getTopChannels(limit);
  }
}
```

### Redis Client Service

The `RedisClientService` provides comprehensive caching and Redis operations:

```typescript
import { RedisClientService } from '@calo/redis';

@Injectable()
export class CacheService {
  constructor(
    private readonly redisClient: RedisClientService,
  ) {}

  async cacheUserProfile(userId: string, profile: UserProfile) {
    await this.redisClient.set(`user:${userId}`, profile, {
      ttl: 3600, // 1 hour
      prefix: 'profiles',
    });
  }

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    return await this.redisClient.get(`user:${userId}`, {
      prefix: 'profiles',
    });
  }

  async incrementOrderCount(userId: string): Promise<number> {
    return await this.redisClient.increment(`orders:${userId}`, 1, {
      prefix: 'counters',
    });
  }

  async publishOrderEvent(order: Order) {
    await this.redisClient.publish('order-events', {
      type: 'order.created',
      orderId: order.id,
      timestamp: Date.now(),
    });
  }

  async subscribeToOrderEvents(callback: (event: any) => void) {
    await this.redisClient.subscribe('order-events', callback);
  }
}
```

### Health Monitoring

The `RedisHealthIndicator` provides comprehensive health checks:

```typescript
import { RedisHealthIndicator } from '@calo/redis';

@Injectable()
export class HealthService {
  constructor(
    private readonly redisHealth: RedisHealthIndicator,
  ) {}

  async checkRedisHealth() {
    return await this.redisHealth.isHealthy('redis');
  }

  async getDetailedHealth() {
    return await this.redisHealth.getDetailedHealth();
  }

  async checkMemoryUsage() {
    return await this.redisHealth.checkMemoryUsage('redis_memory');
  }

  async checkConnectionPool() {
    return await this.redisHealth.checkConnectionPool('redis_connections');
  }
}
```

## API Reference

### ChannelRankingService

#### Methods

- `updateChannelRanking(channelId: string, metrics: Partial<ChannelRanking['metrics']>): Promise<void>`
- `getChannelRanking(channelId: string): Promise<ChannelRanking | null>`
- `getTopChannels(limit?: number): Promise<ChannelRanking[]>`
- `updateChannelPerformance(performance: ChannelPerformance): Promise<void>`
- `getChannelPerformance(channelId: string): Promise<ChannelPerformance | null>`
- `getRecommendedChannels(orderValue: number, deliveryDistance: number, priority: string, limit?: number): Promise<FulfillmentChannel[]>`
- `clearChannelData(channelId: string): Promise<void>`
- `getRankingStats(): Promise<{ totalChannels: number; avgScore: number; topScore: number; lastUpdated: number }>`

### RedisClientService

#### Methods

- `set<T>(key: string, value: T, options?: CacheOptions): Promise<void>`
- `get<T>(key: string, options?: CacheOptions): Promise<T | null>`
- `delete(key: string, options?: CacheOptions): Promise<void>`
- `exists(key: string, options?: CacheOptions): Promise<boolean>`
- `expire(key: string, ttl: number, options?: CacheOptions): Promise<void>`
- `ttl(key: string, options?: CacheOptions): Promise<number>`
- `increment(key: string, value?: number, options?: CacheOptions): Promise<number>`
- `decrement(key: string, value?: number, options?: CacheOptions): Promise<number>`
- `setHash(key: string, hash: Record<string, any>, options?: CacheOptions): Promise<void>`
- `getHash(key: string, options?: CacheOptions): Promise<Record<string, any> | null>`
- `addToSet(key: string, members: string[], options?: CacheOptions): Promise<void>`
- `getSetMembers(key: string, options?: CacheOptions): Promise<string[]>`
- `addToSortedSet(key: string, score: number, member: string, options?: CacheOptions): Promise<void>`
- `getSortedSetRange(key: string, start?: number, stop?: number, options?: CacheOptions): Promise<string[]>`
- `getSortedSetRevRange(key: string, start?: number, stop?: number, options?: CacheOptions): Promise<string[]>`
- `publish(channel: string, message: any): Promise<number>`
- `subscribe(channel: string, callback: (message: any) => void): Promise<void>`
- `flushCache(pattern?: string): Promise<void>`
- `getCacheStats(): Promise<{ totalKeys: number; memoryUsage: string; connectedClients: number; uptime: number }>`

### RedisHealthIndicator

#### Methods

- `isHealthy(key: string): Promise<HealthIndicatorResult>`
- `isClusterHealthy(key: string): Promise<HealthIndicatorResult>`
- `checkMemoryUsage(key: string): Promise<HealthIndicatorResult>`
- `checkConnectionPool(key: string): Promise<HealthIndicatorResult>`
- `checkReplication(key: string): Promise<HealthIndicatorResult>`
- `getDetailedHealth(): Promise<{ basic: HealthIndicatorResult; cluster?: HealthIndicatorResult; memory: HealthIndicatorResult; connections: HealthIndicatorResult; replication: HealthIndicatorResult }>`

## Data Structures

### ChannelRanking

```typescript
interface ChannelRanking {
  channelId: string;
  score: number;
  rank: number;
  lastUpdated: number;
  metrics: {
    successRate: number;
    avgDeliveryTime: number;
    costEfficiency: number;
    customerSatisfaction: number;
  };
}
```

### ChannelPerformance

```typescript
interface ChannelPerformance {
  channelId: string;
  totalOrders: number;
  successfulOrders: number;
  failedOrders: number;
  avgDeliveryTime: number;
  avgCost: number;
  customerRating: number;
  lastActivity: number;
}
```

### CacheOptions

```typescript
interface CacheOptions {
  ttl?: number;
  prefix?: string;
}
```

## Performance Considerations

- **Connection Pooling**: The module uses connection pooling for optimal performance
- **Lazy Connection**: Connections are established only when needed
- **Retry Logic**: Automatic retry with exponential backoff for failed operations
- **TTL Management**: Automatic expiration of cached data
- **Memory Optimization**: Efficient serialization and deserialization

## Monitoring

The module provides comprehensive monitoring capabilities:

- **Health Checks**: Basic connectivity and cluster health
- **Memory Usage**: Real-time memory consumption monitoring
- **Connection Pool**: Connection pool utilization tracking
- **Performance Metrics**: Cache hit rates and operation latency
- **Cluster Status**: Node health and replication status

## Error Handling

The module includes robust error handling:

- **Connection Failures**: Automatic retry with circuit breaker pattern
- **Timeout Handling**: Configurable timeouts for all operations
- **Graceful Degradation**: Fallback mechanisms for critical operations
- **Detailed Logging**: Comprehensive error logging with context

## Testing

Run the test suite:

```bash
npm test
```

The module includes comprehensive unit tests for all services and edge cases.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This module is part of the UOOM platform and is licensed under the same terms as the main project. 