# Calo's Unified Order Orchestration Platform (UOOP)

A high-performance food delivery order processing system designed to handle 5k+ RPS with intelligent routing across multiple fulfillment channels.

## 🚀 Features

- **High Performance**: Optimized for 5k+ RPS with P99 latency ≤ 2s
- **Microservices Architecture**: Scalable, fault-tolerant design
- **Event Sourcing**: Complete audit trail for order lifecycle
- **Outbox Pattern**: Guaranteed event delivery with transactional consistency
- **CQRS**: Separate read/write data stores for optimal performance
- **Circuit Breaker**: Graceful degradation during failures
- **Saga Pattern**: Complex workflow orchestration with rollbacks
- **Real-time Optimization**: Google OR-Tools integration for route optimization
- **Capacity Management**: Real-time capacity tracking and load balancing

## 🏗️ Architecture

### Core Stack
- **Backend Framework**: NestJS with TypeScript
- **Optimization Engine**: Python with Google OR-Tools
- **Cloud**: AWS-first architecture
- **Deployment**: Serverless Framework + Docker + GitHub Actions
- **Database**: Aurora PostgreSQL (writes) + DynamoDB (reads)
- **Caching**: Redis Cluster with Sorted Sets
- **Messaging**: Amazon MSK (Kafka) + EventBridge
- **Orchestration**: ECS Fargate for NestJS services, Lambda for Python OR-Tools

### Microservices
1. **Orchestration Service** (NestJS) - Main order processing
2. **Optimization Service** (Python OR-Tools) - Constraint solving
3. **Outbox Relay Service** (NestJS) - Event delivery
4. **Capacity Service** (NestJS) - Real-time capacity tracking
5. **API Gateway** (NestJS) - Service aggregation

## 📁 Project Structure

```
calo-uoop/
├── apps/
│   ├── orchestration-service/       # Main NestJS orchestration app
│   ├── optimization-service/        # Python OR-Tools microservice
│   ├── outbox-relay-service/       # NestJS event delivery service
│   ├── capacity-service/           # NestJS capacity tracking service
│   └── api-gateway/                # NestJS API Gateway aggregator
├── libs/
│   ├── shared/                     # Shared TypeScript types & utilities
│   ├── database/                   # Database connections & repositories
│   ├── redis/                      # Redis client & operations
│   ├── kafka/                      # Kafka producers & consumers
│   └── monitoring/                 # Observability utilities
├── infrastructure/                 # AWS CDK infrastructure
├── deployments/                   # Docker + Serverless configs
├── .github/workflows/             # CI/CD pipelines
├── scripts/                       # Database migrations & utilities
└── monitoring/                    # Grafana dashboards & alerts
```

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Python 3.9+ (for optimization service)
- PostgreSQL 15+
- Redis 7+
- Kafka 3+

### Local Development

1. **Clone the repository**
```bash
git clone <repository-url>
cd calo-uoop
```

2. **Run the setup script**
```bash
# On Windows:
scripts\setup.bat

# On Linux/Mac:
chmod +x scripts/setup.sh
./scripts/setup.sh
```

3. **Start the infrastructure**
```bash
docker-compose up -d postgres redis kafka zookeeper
```

4. **Run database migrations**
```bash
npm run db:migrate
```

5. **Start the services**
```bash
# Start all services
docker-compose up -d

# Or start individual services
npm run start:dev --workspace=apps/orchestration-service
npm run start:dev --workspace=apps/optimization-service
npm run start:dev --workspace=apps/outbox-relay-service
npm run start:dev --workspace=apps/capacity-service
npm run start:dev --workspace=apps/api-gateway

# Or start all services in development mode
npm run start:dev
```

6. **Access the services**
- API Gateway: http://localhost:8080
- Orchestration Service: http://localhost:3000
- Optimization Service: http://localhost:3001
- Outbox Relay Service: http://localhost:3002
- Capacity Service: http://localhost:3003
- API Documentation: http://localhost:8080/api/docs
- Grafana Dashboard: http://localhost:3004 (admin/admin)
- Prometheus: http://localhost:9090

## 📊 Performance Targets

- **P99 order submission latency**: ≤ 2s
- **Event delivery success rate**: 99.9% within 5s
- **Throughput**: 5k+ RPS burst traffic
- **Infrastructure cost**: <$0.05 incremental cost per order
- **Availability**: 99.9% uptime SLA

## 🔧 Configuration

### Environment Variables

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_DATABASE=uoop

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Kafka
KAFKA_BROKERS=localhost:9092

# Service Configuration
NODE_ENV=development
PORT=3000
CORS_ORIGIN=*
THROTTLE_TTL=60
THROTTLE_LIMIT=1000
```

### Production Deployment

1. **AWS Infrastructure**
```bash
cd infrastructure
npm install
npm run deploy
```

2. **Docker Production Build**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

3. **Kubernetes Deployment**
```bash
kubectl apply -f deployments/k8s/
```

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:e2e
```

### Load Testing
```bash
npm run test:load
```

## 📈 Monitoring & Observability

### Metrics
- Order processing latency
- Event delivery success rate
- Database connection pool usage
- Redis cache hit ratio
- Kafka consumer lag
- Service health status

### Alerts
- High latency (>2s P99)
- Event delivery failures
- Database connection issues
- Service unavailability
- Capacity threshold exceeded

### Dashboards
- Real-time order processing
- Service performance metrics
- Infrastructure utilization
- Business KPIs

## 🔒 Security

- **Authentication**: JWT-based with refresh tokens
- **Authorization**: Role-based access control (RBAC)
- **Data Encryption**: AES-256 at rest, TLS 1.3 in transit
- **API Security**: Rate limiting, input validation, CORS
- **Infrastructure**: VPC, security groups, IAM roles

## 🚀 Deployment

### Development
```bash
docker-compose up -d
```

### Staging
```bash
npm run deploy:staging
```

### Production
```bash
npm run deploy:production
```

## 📚 API Documentation

Comprehensive API documentation is available at:
- Swagger UI: http://localhost:8080/api/docs
- OpenAPI Spec: http://localhost:8080/api/docs-json

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

## 🔄 Roadmap

- [ ] Multi-region deployment
- [ ] Advanced ML-based optimization
- [ ] Real-time driver tracking
- [ ] Predictive capacity planning
- [ ] Advanced analytics dashboard
- [ ] Mobile app integration
- [ ] Third-party delivery integration 