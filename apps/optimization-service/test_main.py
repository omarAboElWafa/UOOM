import pytest
import httpx
import asyncio
from main import app
from fastapi.testclient import TestClient

client = TestClient(app)

def test_health_check():
    """Test health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "optimization-service"

def test_metrics_endpoint():
    """Test metrics endpoint"""
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "optimization_requests_total" in response.text

def test_optimization_endpoint():
    """Test optimization endpoint with sample data"""
    sample_request = {
        "orders": [
            {
                "id": "order_1",
                "pickup_location": {"lat": 40.7128, "lng": -74.0060},
                "delivery_location": {"lat": 40.7589, "lng": -73.9851},
                "priority": 5,
                "max_delivery_time": 45,
                "weight": 2.5,
                "special_requirements": ["fragile"]
            },
            {
                "id": "order_2",
                "pickup_location": {"lat": 40.7505, "lng": -73.9934},
                "delivery_location": {"lat": 40.7484, "lng": -73.9857},
                "priority": 3,
                "max_delivery_time": 60,
                "weight": 1.0,
                "special_requirements": []
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
            },
            {
                "id": "channel_2",
                "capacity": 8,
                "current_load": 1,
                "cost_per_order": 3.5,
                "quality_score": 88,
                "prep_time_minutes": 20,
                "location": {"lat": 40.7505, "lng": -73.9934},
                "vehicle_type": "express",
                "max_distance": 30.0
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
    
    response = client.post("/optimize", json=sample_request)
    assert response.status_code == 200
    
    data = response.json()
    assert "assignments" in data
    assert "total_score" in data
    assert "solve_time_ms" in data
    assert "status" in data
    assert "metadata" in data
    
    # Verify assignments
    assignments = data["assignments"]
    assert len(assignments) == 2
    assert "order_1" in assignments
    assert "order_2" in assignments
    
    # Verify status is valid
    assert data["status"] in ["OPTIMAL", "FEASIBLE", "FALLBACK"]

def test_optimization_validation():
    """Test input validation"""
    # Test with invalid weights
    invalid_request = {
        "orders": [
            {
                "id": "order_1",
                "pickup_location": {"lat": 40.7128, "lng": -74.0060},
                "delivery_location": {"lat": 40.7589, "lng": -73.9851}
            }
        ],
        "channels": [
            {
                "id": "channel_1",
                "capacity": 10,
                "location": {"lat": 40.7128, "lng": -74.0060}
            }
        ],
        "weights": {
            "delivery_time": 0.5,
            "cost": 0.3,
            "quality": 0.1  # Sum = 0.9, should fail validation
        }
    }
    
    response = client.post("/optimize", json=invalid_request)
    assert response.status_code == 422  # Validation error

def test_empty_orders():
    """Test with empty orders list"""
    request = {
        "orders": [],
        "channels": [
            {
                "id": "channel_1",
                "capacity": 10,
                "location": {"lat": 40.7128, "lng": -74.0060}
            }
        ]
    }
    
    response = client.post("/optimize", json=request)
    assert response.status_code == 422  # Validation error

def test_empty_channels():
    """Test with empty channels list"""
    request = {
        "orders": [
            {
                "id": "order_1",
                "pickup_location": {"lat": 40.7128, "lng": -74.0060},
                "delivery_location": {"lat": 40.7589, "lng": -73.9851}
            }
        ],
        "channels": []
    }
    
    response = client.post("/optimize", json=request)
    assert response.status_code == 422  # Validation error

if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"]) 