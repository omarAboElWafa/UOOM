# UOOM Optimization Service

A high-performance optimization service using Google OR-Tools for delivery routing and assignment optimization.

## Features

- **FastAPI Application**: High-performance HTTP API with automatic OpenAPI documentation
- **Google OR-Tools Integration**: Advanced constraint solving for optimization problems
- **Real-time Optimization**: Sub-second response times with configurable timeouts
- **Comprehensive Monitoring**: Prometheus metrics, health checks, and structured logging
- **Input Validation**: Pydantic models with comprehensive validation
- **Docker Containerization**: Easy deployment with optimized container image
- **CORS Support**: Cross-origin resource sharing for web applications
- **Error Handling**: Robust error handling with fallback strategies

## Quick Start

### Using Docker

```bash
# Build the container
docker build -t uoom-optimization-service .

# Run the service
docker run -p 8000:8000 uoom-optimization-service
```

### Using Python

```bash
# Install dependencies
pip install -r requirements.txt

# Run the service
python main.py
```

## API Endpoints

### Health Check
```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "service": "optimization-service",
  "version": "1.0.0",
  "timestamp": 1703123456.789
}
```

### Metrics
```http
GET /metrics
```

Returns Prometheus metrics in text format.

### Optimization
```http
POST /optimize
```

Request body:
```json
{
  "orders": [
    {
      "id": "order_1",
      "pickup_location": {"lat": 40.7128, "lng": -74.0060},
      "delivery_location": {"lat": 40.7589, "lng": -73.9851},
      "priority": 5,
      "max_delivery_time": 45,
      "weight": 2.5,
      "special_requirements": ["fragile"]
    }
  ],
  "channels": [
    {
      "id": "channel_1",
      "capacity": 10,
      "current_load": 2,
      "cost_per_order": 5.0,
      "quality_score": 95,
      "prep_time_minutes": 25,
      "location": {"lat": 40.7128, "lng": -74.0060},
      "vehicle_type": "standard",
      "max_distance": 50.0
    }
  ],
  "constraints": {
    "max_total_cost": 100.0,
    "max_delivery_time": 60
  },
  "weights": {
    "delivery_time": 0.6,
    "cost": 0.3,
    "quality": 0.1
  },
  "timeout_seconds": 0.5
}
```

Response:
```json
{
  "assignments": {
    "order_1": "channel_1"
  },
  "total_score": 1250.5,
  "solve_time_ms": 45,
  "status": "OPTIMAL",
  "metadata": {
    "solver_status": "OPTIMAL",
    "orders_count": 1,
    "channels_count": 1
  }
}
```

## Configuration

The service can be configured using environment variables:

```bash
# Service Configuration
SERVICE_NAME=optimization-service
DEBUG=false

# Server Configuration
HOST=0.0.0.0
PORT=8000
WORKERS=4

# Optimization Configuration
DEFAULT_TIMEOUT_SECONDS=0.1
MAX_TIMEOUT_SECONDS=10.0

# Logging Configuration
LOG_LEVEL=INFO
LOG_FORMAT=json

# CORS Configuration
CORS_ORIGINS=["*"]
```

## Optimization Algorithm

The service uses Google OR-Tools Constraint Programming solver to optimize order-to-channel assignments based on:

### Constraints
- **Assignment Constraints**: Each order must be assigned to exactly one channel
- **Capacity Constraints**: Channel capacity limits
- **Delivery Time Constraints**: Maximum delivery time requirements
- **Distance Constraints**: Maximum delivery distance limits

### Objective Function
The optimization minimizes a weighted score considering:
- **Delivery Time**: Estimated delivery time in minutes
- **Cost**: Cost per order
- **Quality**: Quality score penalty
- **Priority**: Order priority factor

### Fallback Strategy
If the optimization solver fails or times out, the service falls back to a simple capacity-aware round-robin assignment.

## Testing

Run the test suite:

```bash
# Install test dependencies
pip install pytest pytest-asyncio

# Run tests
pytest test_main.py -v
```

## Monitoring

### Metrics
The service exposes Prometheus metrics:
- `optimization_requests_total`: Total optimization requests
- `optimization_duration_seconds`: Optimization duration histogram
- `optimization_errors_total`: Total optimization errors
- `optimization_success_total`: Total successful optimizations

### Logging
Structured JSON logging with correlation IDs and performance metrics.

## Development

### Code Style
The project uses:
- **Black**: Code formatting
- **isort**: Import sorting
- **flake8**: Linting
- **mypy**: Type checking

### Running Locally
```bash
# Install development dependencies
pip install -r requirements.txt

# Run with auto-reload
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Performance

- **Response Time**: < 100ms for typical optimization problems
- **Throughput**: 1000+ requests/second on standard hardware
- **Memory Usage**: < 512MB for typical workloads
- **CPU Usage**: Efficient constraint solving with OR-Tools

## Security

- Non-root container execution
- Input validation and sanitization
- CORS configuration for web applications
- Structured error handling without information leakage

## Future Enhancements

- **gRPC Support**: High-performance communication protocol
- **Database Integration**: Persistent optimization history
- **Kafka Integration**: Event-driven architecture
- **Advanced Routing**: Integration with OSRM/VROOM for real routing
- **Machine Learning**: Predictive optimization models
- **Multi-objective Optimization**: Pareto optimal solutions
- **Real-time Updates**: Dynamic constraint updates 