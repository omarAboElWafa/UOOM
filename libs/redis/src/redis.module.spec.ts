import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisLibModule } from './redis.module';
import { ChannelRankingService } from './services/channel-ranking.service';
import { RedisHealthIndicator } from './health/redis-health.indicator';
import { RedisClientService } from './services/redis-client.service';

describe('RedisLibModule', () => {
  let module: TestingModule;
  let channelRankingService: ChannelRankingService;
  let redisHealthIndicator: RedisHealthIndicator;
  let redisClientService: RedisClientService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      switch (key) {
        case 'REDIS_CLUSTER_ENDPOINT':
          return 'localhost';
        case 'REDIS_PORT':
          return 6379;
        case 'REDIS_PASSWORD':
          return 'password';
        default:
          return defaultValue;
      }
    }),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        RedisLibModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    channelRankingService = module.get<ChannelRankingService>(ChannelRankingService);
    redisHealthIndicator = module.get<RedisHealthIndicator>(RedisHealthIndicator);
    redisClientService = module.get<RedisClientService>(RedisClientService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide ChannelRankingService', () => {
    expect(channelRankingService).toBeDefined();
  });

  it('should provide RedisHealthIndicator', () => {
    expect(redisHealthIndicator).toBeDefined();
  });

  it('should provide RedisClientService', () => {
    expect(redisClientService).toBeDefined();
  });

  describe('ChannelRankingService', () => {
    it('should update channel ranking', async () => {
      const channelId = 'test-channel';
      const metrics = {
        successRate: 0.95,
        avgDeliveryTime: 25,
        costEfficiency: 0.8,
        customerSatisfaction: 4.5,
      };

      // Mock Redis operations
      const mockRedis = {
        hgetall: jest.fn().mockResolvedValue({}),
        hmset: jest.fn().mockResolvedValue('OK'),
        expire: jest.fn().mockResolvedValue(1),
        zadd: jest.fn().mockResolvedValue(1),
      };

      jest.spyOn(channelRankingService as any, 'redis', 'get').mockReturnValue(mockRedis);

      await expect(
        channelRankingService.updateChannelRanking(channelId, metrics)
      ).resolves.not.toThrow();
    });

    it('should get channel ranking', async () => {
      const channelId = 'test-channel';
      const mockData = {
        channelId: 'test-channel',
        score: '85.5',
        rank: '1',
        lastUpdated: Date.now().toString(),
        successRate: '0.95',
        avgDeliveryTime: '25',
        costEfficiency: '0.8',
        customerSatisfaction: '4.5',
      };

      const mockRedis = {
        hgetall: jest.fn().mockResolvedValue(mockData),
        zrevrank: jest.fn().mockResolvedValue(0),
      };

      jest.spyOn(channelRankingService as any, 'redis', 'get').mockReturnValue(mockRedis);

      const result = await channelRankingService.getChannelRanking(channelId);

      expect(result).toBeDefined();
      expect(result?.channelId).toBe(channelId);
      expect(result?.score).toBe(85.5);
    });
  });

  describe('RedisHealthIndicator', () => {
    it('should perform health check', async () => {
      const mockRedis = {
        set: jest.fn().mockResolvedValue('OK'),
        get: jest.fn().mockResolvedValue('test-value'),
        del: jest.fn().mockResolvedValue(1),
        info: jest.fn().mockResolvedValue(
          'connected_clients:10\nused_memory_human:1.2M\nuptime_in_seconds:3600'
        ),
      };

      jest.spyOn(redisHealthIndicator as any, 'redis', 'get').mockReturnValue(mockRedis);

      const result = await redisHealthIndicator.isHealthy('redis');

      expect(result).toBeDefined();
      expect(result.redis.status).toBe('up');
    });

    it('should handle health check failure', async () => {
      const mockRedis = {
        set: jest.fn().mockRejectedValue(new Error('Connection failed')),
      };

      jest.spyOn(redisHealthIndicator as any, 'redis', 'get').mockReturnValue(mockRedis);

      await expect(redisHealthIndicator.isHealthy('redis')).rejects.toThrow();
    });
  });

  describe('RedisClientService', () => {
    it('should set and get cache values', async () => {
      const mockRedis = {
        setex: jest.fn().mockResolvedValue('OK'),
        get: jest.fn().mockResolvedValue('test-value'),
        del: jest.fn().mockResolvedValue(1),
      };

      jest.spyOn(redisClientService as any, 'redis', 'get').mockReturnValue(mockRedis);

      await redisClientService.set('test-key', 'test-value', { ttl: 3600 });
      const result = await redisClientService.get('test-key');

      expect(result).toBe('test-value');
    });

    it('should handle cache miss', async () => {
      const mockRedis = {
        get: jest.fn().mockResolvedValue(null),
      };

      jest.spyOn(redisClientService as any, 'redis', 'get').mockReturnValue(mockRedis);

      const result = await redisClientService.get('non-existent-key');

      expect(result).toBeNull();
    });
  });
}); 