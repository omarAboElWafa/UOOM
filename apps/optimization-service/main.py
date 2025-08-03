
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Optional
import time
import logging
import structlog
from ortools.sat.python import cp_model
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from prometheus_client.registry import REGISTRY
import os

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

app = FastAPI(
    title="UOOM Optimization Service", 
    version="1.0.0",
    description="High-performance optimization service using Google OR-Tools for delivery routing",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Metrics
optimization_requests = Counter('optimization_requests_total', 'Total optimization requests')
optimization_duration = Histogram('optimization_duration_seconds', 'Optimization duration')
optimization_errors = Counter('optimization_errors_total', 'Total optimization errors')
optimization_success = Counter('optimization_success_total', 'Total successful optimizations')

class Order(BaseModel):
    id: str = Field(..., description="Unique order identifier")
    pickup_location: Dict[str, float] = Field(..., description="Pickup coordinates {lat, lng}")
    delivery_location: Dict[str, float] = Field(..., description="Delivery coordinates {lat, lng}")
    priority: int = Field(default=1, ge=1, le=10, description="Order priority (1-10)")
    max_delivery_time: int = Field(default=60, ge=1, description="Maximum delivery time in minutes")
    weight: float = Field(default=1.0, ge=0.1, description="Order weight in kg")
    special_requirements: List[str] = Field(default_factory=list, description="Special handling requirements")

class Channel(BaseModel):
    id: str = Field(..., description="Unique channel identifier")
    capacity: int = Field(..., ge=1, description="Channel capacity")
    current_load: int = Field(default=0, ge=0, description="Current load")
    cost_per_order: float = Field(default=0.0, ge=0, description="Cost per order")
    quality_score: int = Field(default=100, ge=0, le=100, description="Quality score (0-100)")
    prep_time_minutes: int = Field(default=30, ge=1, description="Preparation time in minutes")
    location: Dict[str, float] = Field(..., description="Channel location coordinates {lat, lng}")
    vehicle_type: str = Field(default="standard", description="Vehicle type")
    max_distance: float = Field(default=50.0, ge=1, description="Maximum delivery distance in km")

class OptimizationRequest(BaseModel):
    orders: List[Order] = Field(..., min_items=1, description="List of orders to optimize")
    channels: List[Channel] = Field(..., min_items=1, description="List of available channels")
    constraints: Dict = Field(default_factory=dict, description="Additional constraints")
    weights: Dict[str, float] = Field(
        default={
            "delivery_time": 0.5,
            "cost": 0.3,
            "quality": 0.2
        },
        description="Optimization weights"
    )
    timeout_seconds: float = Field(default=0.1, ge=0.01, le=10.0, description="Optimization timeout in seconds")
    
    @validator('weights')
    def validate_weights(cls, v):
        total = sum(v.values())
        if abs(total - 1.0) > 0.01:
            raise ValueError("Weights must sum to 1.0")
        return v

class OptimizationResponse(BaseModel):
    assignments: Dict[str, str] = Field(..., description="Order ID to channel ID assignments")
    total_score: float = Field(..., description="Total optimization score")
    solve_time_ms: int = Field(..., description="Solve time in milliseconds")
    status: str = Field(..., description="Optimization status")
    metadata: Dict = Field(default_factory=dict, description="Additional optimization metadata")

class ConstraintOptimizer:
    def __init__(self):
        self.model = cp_model.CpModel()
        self.solver = cp_model.CpSolver()
        
    def optimize_routing(self, request: OptimizationRequest) -> OptimizationResponse:
        start_time = time.time()
        
        try:
            # Clear previous model
            self.model = cp_model.CpModel()
            self.solver = cp_model.CpSolver()
            self.solver.parameters.max_time_in_seconds = request.timeout_seconds
            
            orders = [order.dict() for order in request.orders]
            channels = [channel.dict() for channel in request.channels]
            
            # Decision variables
            assignments = {}
            for order in orders:
                for channel in channels:
                    assignments[(order['id'], channel['id'])] = self.model.NewBoolVar(
                        f'assign_{order["id"]}_to_{channel["id"]}'
                    )
            
            # Constraints
            self._add_assignment_constraints(orders, channels, assignments)
            self._add_capacity_constraints(orders, channels, assignments)
            self._add_delivery_time_constraints(orders, channels, assignments)
            self._add_distance_constraints(orders, channels, assignments)
            
            # Objective function
            objective_terms = []
            for order in orders:
                for channel in channels:
                    score = self._calculate_assignment_score(order, channel, request.weights)
                    objective_terms.append(assignments[(order['id'], channel['id'])] * score)
            
            self.model.Minimize(sum(objective_terms))
            
            # Solve
            status = self.solver.Solve(self.model)
            solve_time = int((time.time() - start_time) * 1000)
            
            if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
                assignments_result = {}
                total_score = 0
                
                for order in orders:
                    for channel in channels:
                        if self.solver.Value(assignments[(order['id'], channel['id'])]):
                            assignments_result[order['id']] = channel['id']
                            total_score += self._calculate_assignment_score(order, channel, request.weights)
                
                optimization_success.inc()
                logger.info("Optimization completed successfully", 
                          status=status, 
                          solve_time_ms=solve_time,
                          assignments_count=len(assignments_result))
                
                return OptimizationResponse(
                    assignments=assignments_result,
                    total_score=total_score,
                    solve_time_ms=solve_time,
                    status="OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
                    metadata={
                        "solver_status": str(status),
                        "orders_count": len(orders),
                        "channels_count": len(channels)
                    }
                )
            else:
                # Fallback to simple assignment
                logger.warning("Optimization failed, using fallback assignment", 
                             status=status, 
                             solve_time_ms=solve_time)
                return self._fallback_assignment(orders, channels, solve_time)
                
        except Exception as e:
            logger.error("Optimization failed", error=str(e), exc_info=True)
            optimization_errors.inc()
            raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")

    def _add_assignment_constraints(self, orders, channels, assignments):
        # Each order assigned to exactly one channel
        for order in orders:
            self.model.Add(
                sum(assignments[(order['id'], channel['id'])] for channel in channels) == 1
            )

    def _add_capacity_constraints(self, orders, channels, assignments):
        # Channel capacity constraints
        for channel in channels:
            available_capacity = channel['capacity'] - channel['current_load']
            self.model.Add(
                sum(assignments[(order['id'], channel['id'])] for order in orders) <= available_capacity
            )

    def _add_delivery_time_constraints(self, orders, channels, assignments):
        # Delivery time constraints
        for order in orders:
            for channel in channels:
                estimated_time = self._calculate_delivery_time(order, channel)
                if estimated_time > order.get('max_delivery_time', 60):
                    self.model.Add(assignments[(order['id'], channel['id'])] == 0)

    def _add_distance_constraints(self, orders, channels, assignments):
        # Distance constraints
        for order in orders:
            for channel in channels:
                distance = self._calculate_distance(order, channel)
                if distance > channel.get('max_distance', 50.0):
                    self.model.Add(assignments[(order['id'], channel['id'])] == 0)

    def _calculate_assignment_score(self, order: Dict, channel: Dict, weights: Dict) -> int:
        delivery_time = self._calculate_delivery_time(order, channel)
        cost = channel.get('cost_per_order', 0)
        quality_penalty = max(0, 100 - channel.get('quality_score', 100))
        
        # Add priority factor
        priority_factor = (11 - order.get('priority', 1)) / 10.0
        
        weighted_score = (
            delivery_time * weights['delivery_time'] +
            cost * weights['cost'] +
            quality_penalty * weights['quality']
        ) * priority_factor
        
        return int(weighted_score * 100)  # Scale for integer optimization

    def _calculate_delivery_time(self, order: Dict, channel: Dict) -> float:
        # Simplified calculation - integrate with OSRM/VROOM in production
        prep_time = channel.get('prep_time_minutes', 30)
        distance = self._calculate_distance(order, channel)
        # Assume 30 km/h average speed
        travel_time = (distance / 30.0) * 60  # Convert to minutes
        return prep_time + travel_time

    def _calculate_distance(self, order: Dict, channel: Dict) -> float:
        # Simplified Haversine distance calculation
        # In production, use proper geospatial libraries
        import math
        
        def haversine_distance(lat1, lon1, lat2, lon2):
            R = 6371  # Earth's radius in kilometers
            
            lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            
            a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
            c = 2 * math.asin(math.sqrt(a))
            return R * c
        
        # Calculate distance from channel to pickup to delivery
        channel_lat = channel['location']['lat']
        channel_lng = channel['location']['lng']
        pickup_lat = order['pickup_location']['lat']
        pickup_lng = order['pickup_location']['lng']
        delivery_lat = order['delivery_location']['lat']
        delivery_lng = order['delivery_location']['lng']
        
        distance_to_pickup = haversine_distance(channel_lat, channel_lng, pickup_lat, pickup_lng)
        distance_pickup_to_delivery = haversine_distance(pickup_lat, pickup_lng, delivery_lat, delivery_lng)
        
        return distance_to_pickup + distance_pickup_to_delivery

    def _fallback_assignment(self, orders, channels, solve_time) -> OptimizationResponse:
        # Simple round-robin fallback with capacity checking
        assignments = {}
        channel_loads = {channel['id']: channel['current_load'] for channel in channels}
        
        for order in orders:
            assigned = False
            for channel in channels:
                if channel_loads[channel['id']] < channel['capacity']:
                    assignments[order['id']] = channel['id']
                    channel_loads[channel['id']] += 1
                    assigned = True
                    break
            
            if not assigned:
                # If no channel available, assign to first channel (will be rejected by capacity constraint)
                assignments[order['id']] = channels[0]['id']
        
        return OptimizationResponse(
            assignments=assignments,
            total_score=0,
            solve_time_ms=solve_time,
            status="FALLBACK",
            metadata={"fallback_reason": "Optimization solver failed"}
        )

optimizer = ConstraintOptimizer()

@app.post("/optimize", response_model=OptimizationResponse)
async def optimize_routing(request: OptimizationRequest):
    optimization_requests.inc()
    
    logger.info("Received optimization request", 
               orders_count=len(request.orders),
               channels_count=len(request.channels))
    
    with optimization_duration.time():
        return optimizer.optimize_routing(request)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy", 
        "service": "optimization-service",
        "version": "1.0.0",
        "timestamp": time.time()
    }

@app.get("/metrics")
async def metrics():
    return JSONResponse(
        content=generate_latest(REGISTRY),
        media_type=CONTENT_TYPE_LATEST
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception", 
                path=request.url.path,
                method=request.method,
                error=str(exc),
                exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)