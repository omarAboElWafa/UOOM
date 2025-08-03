# UOOP API Gateway

High-performance reverse proxy and API aggregation layer for the Unified Order Orchestration Platform (UOOP).

## 🏗️ Architecture

The API Gateway serves as the single entry point for all client requests, providing:

- **Request Routing**: Intelligent routing to downstream microservices
- **Circuit Breaker Protection**: Automatic failure detection and recovery
- **Request/Response Transformation**: Data normalization and enrichment
- **Service Discovery**: Dynamic service endpoint resolution
- **Rate Limiting**: Protection against excessive request volumes
- **Authentication & Authorization**: Centralized security enforcement
- **Monitoring & Metrics**: Comprehensive observability

## 🚀 Features

### ✅ Implemented

#### Core Gateway Functionality
- **Reverse Proxy**: Routes requests to orchestration, optimization, and capacity services
- **Circuit Breaker**: Per-service failure detection with automatic recovery
- **Service Discovery**: Dynamic endpoint resolution with health checking
- **Request Transformation**: Metadata enrichment and validation
- **Response Transformation**: Data normalization and error handling

#### Security & Reliability
- **Authentication Guard**: JWT-like token validation (demo implementation)
- **Rate Limiting**: 1000 requests/minute per IP
- **Request Timeout**: 30-second global timeout with circuit breaker integration
- **Error Handling**: Comprehensive error transformation and logging

#### Monitoring & Observability
- **Health Checks**: `/health`, `/health/ready`, `/health/live` endpoints
- **Metrics Collection**: Performance, circuit breaker, and SLA metrics
- **Structured Logging**: Request/response logging with correlation IDs
- **SLA Monitoring**: P99 latency ≤ 2s tracking

### 📋 API Endpoints

#### Order Management (Proxied to Orchestration Service)
```
POST   /api/v1/orders              - Create new order
GET    /api/v1/orders/:id          - Get order details  
GET    /api/v1/orders/:id/status   - Get order status (cached)
PUT    /api/v1/orders/:id          - Update order
POST   /api/v1/orders/:id/cancel   - Cancel order
```

#### Gateway Management
```
GET    /api/v1/health              - Comprehensive health check
GET    /api/v1/health/ready        - Readiness probe
GET    /api/v1/health/live         - Liveness probe
GET    /api/v1/metrics             - All metrics
GET    /api/v1/metrics/performance - Performance metrics
GET    /api/v1/metrics/sla         - SLA compliance metrics
```

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
PORT=8080
NODE_ENV=development

# Service URLs
ORCHESTRATION_SERVICE_URL=http://orchestration-service:3000
OPTIMIZATION_SERVICE_URL=http://optimization-service:3001
CAPACITY_SERVICE_URL=http://capacity-service:3003
OUTBOX_RELAY_SERVICE_URL=http://outbox-relay-service:3002

# Security
AUTH_ENABLED=true
CORS_ORIGIN=*

# Performance
TIMEOUT_MS=30000
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=60000
```

### Circuit Breaker Configuration

```typescript
{
  failureThreshold: 5,        // Failures before opening
  timeout: 60000,            // 1 minute reset timeout
  successThreshold: 3,       // Successes to close circuit
}
```

### Rate Limiting
- **Global**: 1000 requests/minute per IP
- **Order Creation**: Additional validation and priority handling
- **Status Queries**: Aggressive caching (30s TTL)

## 📊 Performance & SLA

### SLA Targets
- **P99 Latency**: ≤ 2 seconds
- **Availability**: 99.9%
- **Event Delivery**: ≤ 5 seconds

### Circuit Breaker Behavior
```
CLOSED → Normal operation
OPEN → Block requests for 60s after 5 failures  
HALF_OPEN → Allow 3 test requests to verify recovery
```

### Request Flow
```
Client Request
    ↓
[Rate Limit Check]
    ↓  
[Authentication]
    ↓
[Request Transform]
    ↓
[Circuit Breaker]
    ↓
[Service Discovery]
    ↓
[HTTP Proxy]
    ↓
[Response Transform]
    ↓
Client Response
```

## 🛡️ Security

### Authentication
- Bearer token validation (demo implementation)
- User context injection for downstream services
- Permission-based access control

### Request Validation
- Schema validation with class-validator
- Input sanitization and transformation
- Rate limiting per endpoint

### Headers Added
```
X-Correlation-ID: Request tracking
X-Gateway-Request-ID: Gateway-specific tracking
X-Forwarded-By: api-gateway
User-Agent: UOOP-API-Gateway/1.0.0
```

## 📈 Monitoring

### Health Checks
- **Memory**: Heap ≤ 150MB, RSS ≤ 300MB
- **Disk**: Usage ≤ 90%
- **Services**: Downstream service availability
- **Circuits**: Circuit breaker states

### Metrics Exported
- Request count, latency (P95, P99)
- Error rates by service and endpoint
- Circuit breaker state changes
- SLA compliance scores

### Logging
- Structured JSON logs
- Request/response correlation
- Performance timing
- Security events

## 🚦 Usage

### Development
```bash
npm run start:dev
```

### Production
```bash
npm run build
npm run start:prod
```

### Docker
```bash
docker build -t uoop-api-gateway .
docker run -p 8080:8080 uoop-api-gateway
```

### Testing
```bash
# Health check
curl http://localhost:8080/api/v1/health

# Create order (requires auth token)
curl -X POST http://localhost:8080/api/v1/orders \
  -H "Authorization: Bearer test-token-123456" \
  -H "Content-Type: application/json" \
  -d '{"customerId": "123", "restaurantId": "456", "items": [...]}'

# Get metrics
curl http://localhost:8080/api/v1/metrics
```

## 🏗️ Implementation Notes

### Service Discovery
- Static configuration for development
- Health checking with 30s intervals
- Automatic endpoint recovery detection

### Circuit Breaker
- Per-service circuit breaker instances
- Exponential backoff for retries
- Graceful degradation with fallback responses

### Request Transformation
- Metadata injection (correlation IDs, timestamps)
- Business rule application (priority determination)
- Input validation and sanitization

### Response Transformation  
- Internal field removal
- Monetary value formatting
- Computed field addition (delivery windows, progress)
- Error normalization

## 🔮 Production Readiness

### Required Enhancements
1. **JWT Integration**: Replace demo auth with proper JWT validation
2. **Redis Caching**: Add Redis for response caching and rate limiting
3. **Prometheus Metrics**: Export metrics to Prometheus/Grafana
4. **CloudWatch Integration**: AWS metrics and logging
5. **Service Mesh**: Consider Istio for advanced traffic management

### Infrastructure Requirements
- Load balancer for multiple gateway instances
- Redis cluster for shared caching
- Prometheus/Grafana for monitoring
- AWS ALB for SSL termination
- WAF for additional security

This implementation provides a solid foundation for a production-ready API Gateway with proper circuit breaker protection, service discovery, and comprehensive monitoring capabilities. 