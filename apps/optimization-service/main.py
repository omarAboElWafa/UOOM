import os
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from prometheus_client.openmetrics.exposition import generate_latest as generate_latest_openmetrics
import structlog

from app.core.config import settings
from app.core.redis_client import redis_client
from app.core.kafka_client import kafka_producer
from app.services.optimization_service import OptimizationService
from app.api.v1.router import api_router
from app.core.middleware import RequestLoggingMiddleware, MetricsMiddleware

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Prometheus metrics
REQUEST_COUNT = Counter('http_requests_total', 'Total HTTP requests', ['method', 'endpoint', 'status'])
REQUEST_DURATION = Histogram('http_request_duration_seconds', 'HTTP request duration', ['method', 'endpoint'])
OPTIMIZATION_DURATION = Histogram('optimization_duration_seconds', 'Optimization processing duration', ['type'])

# Tracing setup (simplified for now)
tracer = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("Starting Optimization Service", version=settings.VERSION)
    
    # Initialize Redis connection
    await redis_client.connect()
    logger.info("Redis connected")
    
    # Initialize Kafka producer
    await kafka_producer.start()
    logger.info("Kafka producer started")
    
    # Initialize optimization service
    app.state.optimization_service = OptimizationService()
    logger.info("Optimization service initialized")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Optimization Service")
    await redis_client.disconnect()
    await kafka_producer.stop()

def create_app() -> FastAPI:
    """Create and configure FastAPI application"""
    
    app = FastAPI(
        title="UOOP Optimization Service",
        description="High-performance constraint solving microservice for food delivery optimization",
        version=settings.VERSION,
        docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
        redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
        lifespan=lifespan,
    )
    
    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Compression middleware
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    
    # Custom middleware
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(MetricsMiddleware)
    
    # Exception handlers
    @app.exception_handler(Exception)
    async def global_exception_handler(request, exc):
        logger.error("Unhandled exception", exc_info=exc, path=request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "type": "internal_error"}
        )
    
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request, exc):
        logger.warning("HTTP exception", status_code=exc.status_code, detail=exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "type": "http_error"}
        )
    
    # Health check endpoint
    @app.get("/health")
    async def health_check():
        """Health check endpoint"""
        try:
            # Check Redis connection
            await redis_client.ping()
            
            # Check Kafka connection
            await kafka_producer.health_check()
            
            return {
                "status": "healthy",
                "service": "optimization-service",
                "version": settings.VERSION,
                "environment": settings.ENVIRONMENT,
                "timestamp": settings.get_current_timestamp()
            }
        except Exception as e:
            logger.error("Health check failed", error=str(e))
            raise HTTPException(status_code=503, detail="Service unhealthy")
    
    # Metrics endpoint
    @app.get("/metrics")
    async def metrics():
        """Prometheus metrics endpoint"""
        return generate_latest()
    
    # OpenMetrics endpoint
    @app.get("/metrics/openmetrics")
    async def metrics_openmetrics():
        """OpenMetrics format metrics endpoint"""
        return generate_latest_openmetrics()
    
    # Include API routes
    app.include_router(api_router, prefix="/api/v1")
    
    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development",
        log_level=settings.LOG_LEVEL.lower(),
        access_log=True,
    ) 