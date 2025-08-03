from pydantic_settings import BaseSettings
from typing import Optional
import os

class Settings(BaseSettings):
    # Service Configuration
    service_name: str = "optimization-service"
    version: str = "1.0.0"
    debug: bool = False
    
    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 4
    
    # Optimization Configuration
    default_timeout_seconds: float = 0.1
    max_timeout_seconds: float = 10.0
    default_weights: dict = {
        "delivery_time": 0.5,
        "cost": 0.3,
        "quality": 0.2
    }
    
    # Logging Configuration
    log_level: str = "INFO"
    log_format: str = "json"
    
    # Monitoring Configuration
    metrics_enabled: bool = True
    health_check_interval: int = 30
    
    # CORS Configuration
    cors_origins: list = ["*"]
    cors_allow_credentials: bool = True
    cors_allow_methods: list = ["*"]
    cors_allow_headers: list = ["*"]
    
    # Database Configuration (for future use)
    database_url: Optional[str] = None
    redis_url: Optional[str] = None
    
    # Kafka Configuration (for future use)
    kafka_bootstrap_servers: Optional[str] = None
    kafka_topic_optimization_requests: str = "optimization-requests"
    kafka_topic_optimization_results: str = "optimization-results"
    
    class Config:
        env_file = ".env"
        case_sensitive = False

# Create settings instance
settings = Settings() 