import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

export interface CacheOptions {
  ttl?: number;
  prefix?: string;
}

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl: number;
  createdAt: number;
}

@Injectable()
export class RedisClientService {
  private readonly logger = new Logger(RedisClientService.name);
  private readonly defaultTTL = 3600; // 1 hour

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    try {
      const { ttl = this.defaultTTL, prefix = '' } = options;
      const fullKey = prefix ? `${prefix}:${key}` : key;
      
      await this.cacheManager.set(fullKey, value, ttl * 1000); // Convert to milliseconds
      
      this.logger.debug('Cache set', { key: fullKey, ttl });
    } catch (error) {
      this.logger.error('Failed to set cache', { key, error: error.message });
      throw error;
    }
  }

  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    try {
      const { prefix = '' } = options;
      const fullKey = prefix ? `${prefix}:${key}` : key;
      
      const value = await this.cacheManager.get<T>(fullKey);
      
      return value || null;
    } catch (error) {
      this.logger.error('Failed to get cache', { key, error: error.message });
      return null;
    }
  }

  async delete(key: string, options: CacheOptions = {}): Promise<void> {
    try {
      const { prefix = '' } = options;
      const fullKey = prefix ? `${prefix}:${key}` : key;
      
      await this.cacheManager.del(fullKey);
      
      this.logger.debug('Cache deleted', { key: fullKey });
    } catch (error) {
      this.logger.error('Failed to delete cache', { key, error: error.message });
      throw error;
    }
  }

  async exists(key: string, options: CacheOptions = {}): Promise<boolean> {
    try {
      const { prefix = '' } = options;
      const fullKey = prefix ? `${prefix}:${key}` : key;
      
      const value = await this.cacheManager.get(fullKey);
      return value !== null && value !== undefined;
    } catch (error) {
      this.logger.error('Failed to check cache existence', { key, error: error.message });
      return false;
    }
  }

  async reset(): Promise<void> {
    try {
      await this.cacheManager.reset();
      this.logger.debug('Cache reset');
    } catch (error) {
      this.logger.error('Failed to reset cache', { error: error.message });
      throw error;
    }
  }

  async getCacheStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    connectedClients: number;
    uptime: number;
  }> {
    try {
      // Note: Cache manager doesn't provide detailed stats like Redis
      // This is a simplified version
      return {
        totalKeys: 0, // Not available in cache manager
        memoryUsage: 'unknown',
        connectedClients: 1,
        uptime: Date.now(),
      };
    } catch (error) {
      this.logger.error('Failed to get cache stats', { error: error.message });
      return {
        totalKeys: 0,
        memoryUsage: 'unknown',
        connectedClients: 0,
        uptime: 0,
      };
    }
  }
} 