import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { OptimizationService } from './optimization.service';
import { CreateOrderDto } from '../order/dto/create-order.dto';
import { FulfillmentChannel } from './optimization.types';

describe('OptimizationService', () => {
  let service: OptimizationService;
  let httpService: HttpService;
  let configService: ConfigService;

  const mockHttpService = {
    post: jest.fn(),
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockOrder: CreateOrderDto = {
    customerId: 'customer-123',
    restaurantId: 'restaurant-456',
    items: [
      {
        itemId: 'item-1',
        name: 'Pizza Margherita',
        quantity: 2,
        unitPrice: 15.0,
        totalPrice: 30.0,
      },
    ],
    deliveryLocation: {
      latitude: 40.7128,
      longitude: -74.0060,
      address: '123 Main St, New York, NY',
    },
    priority: 'NORMAL',
  };

  const mockChannels: FulfillmentChannel[] = [
    {
      id: 'channel-1',
      name: 'Express Delivery',
      type: 'express',
      capacity: 10,
      currentLoad: 3,
      availableCapacity: 7,
      costPerOrder: 5.0,
      qualityScore: 95,
      prepTimeMinutes: 25,
      location: {
        latitude: 40.7128,
        longitude: -74.0060,
      },
      vehicleType: 'motorcycle',
      maxDistance: 15.0,
      isActive: true,
    },
    {
      id: 'channel-2',
      name: 'Standard Delivery',
      type: 'standard',
      capacity: 20,
      currentLoad: 8,
      availableCapacity: 12,
      costPerOrder: 3.0,
      qualityScore: 88,
      prepTimeMinutes: 30,
      location: {
        latitude: 40.7505,
        longitude: -73.9934,
      },
      vehicleType: 'car',
      maxDistance: 30.0,
      isActive: true,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimizationService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<OptimizationService>(OptimizationService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);

    // Setup default config values
    mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
      switch (key) {
        case 'OPTIMIZATION_SERVICE_URL':
          return 'http://localhost:8000';
        case 'OPTIMIZATION_TIMEOUT_MS':
          return 150;
        case 'OPTIMIZATION_MAX_TIMEOUT_MS':
          return 1000;
        default:
          return defaultValue;
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('optimize', () => {
    it('should successfully optimize an order', async () => {
      const mockResponse = {
        data: {
          assignments: { 'customer-123': 'channel-1' },
          total_score: 1250.5,
          solve_time_ms: 45,
          status: 'OPTIMAL',
          metadata: {
            solver_status: 'OPTIMAL',
            orders_count: 1,
            channels_count: 2,
          },
        },
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      const result = await service.optimize(mockOrder, mockChannels);

      expect(result).toBe('channel-1');
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'http://localhost:8000/optimize',
        expect.objectContaining({
          orders: expect.arrayContaining([
            expect.objectContaining({
              id: 'customer-123',
              priority: 5,
            }),
          ]),
          channels: expect.arrayContaining([
            expect.objectContaining({
              id: 'channel-1',
              capacity: 10,
            }),
          ]),
        }),
        expect.objectContaining({
          timeout: 200,
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'UOOM-Orchestration-Service',
          }),
        })
      );
    });

    it('should use fallback routing when optimization fails', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Service unavailable'))
      );

      const result = await service.optimize(mockOrder, mockChannels);

      // Should return the channel with highest available capacity
      expect(result).toBe('channel-2');
    });

    it('should throw error when no channels available', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Service unavailable'))
      );

      const emptyChannels: FulfillmentChannel[] = [];

      await expect(service.optimize(mockOrder, emptyChannels)).rejects.toThrow(
        'No available channels for optimization'
      );
    });
  });

  describe('healthCheck', () => {
    it('should return health status when service is available', async () => {
      const mockHealthResponse = {
        data: {
          status: 'healthy',
          service: 'optimization-service',
          version: '1.0.0',
          timestamp: Date.now(),
        },
      };

      mockHttpService.get.mockReturnValue(of(mockHealthResponse));

      const result = await service.healthCheck();

      expect(result).toEqual(mockHealthResponse.data);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        'http://localhost:8000/health',
        expect.objectContaining({
          timeout: 2000,
          headers: expect.objectContaining({
            'User-Agent': 'UOOM-Orchestration-Service',
          }),
        })
      );
    });

    it('should throw error when health check fails', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Connection failed'))
      );

      await expect(service.healthCheck()).rejects.toThrow(
        'Health check failed: Connection failed'
      );
    });
  });

  describe('getMetrics', () => {
    it('should return metrics when service is available', async () => {
      const mockMetricsResponse = {
        data: '# HELP optimization_requests_total Total optimization requests\n# TYPE optimization_requests_total counter\noptimization_requests_total 42',
      };

      mockHttpService.get.mockReturnValue(of(mockMetricsResponse));

      const result = await service.getMetrics();

      expect(result).toEqual(mockMetricsResponse.data);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        'http://localhost:8000/metrics',
        expect.objectContaining({
          timeout: 5000,
          headers: expect.objectContaining({
            'User-Agent': 'UOOM-Orchestration-Service',
          }),
        })
      );
    });

    it('should throw error when metrics request fails', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Service unavailable'))
      );

      await expect(service.getMetrics()).rejects.toThrow(
        'Failed to get metrics: Service unavailable'
      );
    });
  });
}); 