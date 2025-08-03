#!/bin/bash

# Test script for Outbox Relay Service
# This script verifies the service is running and processing events correctly

SERVICE_URL="http://localhost:3003/api/v1"
TIMEOUT=5

echo "🧪 Testing Outbox Relay Service..."

# Function to make HTTP request with timeout
make_request() {
    local url=$1
    local expected_status=${2:-200}
    
    echo "📍 Testing: $url"
    
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" --max-time $TIMEOUT "$url" 2>/dev/null)
    
    if [ $? -ne 0 ]; then
        echo "❌ Request failed or timed out"
        return 1
    fi
    
    body=$(echo "$response" | sed -E 's/HTTPSTATUS:[0-9]{3}$//')
    status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    
    if [ "$status" -eq "$expected_status" ]; then
        echo "✅ Status: $status (Expected: $expected_status)"
        if [ -n "$body" ] && [ "$body" != "null" ]; then
            echo "📊 Response: $(echo "$body" | jq -c . 2>/dev/null || echo "$body")"
        fi
        return 0
    else
        echo "❌ Status: $status (Expected: $expected_status)"
        echo "📄 Response: $body"
        return 1
    fi
}

# Test health endpoints
echo "🏥 Testing Health Endpoints..."
make_request "$SERVICE_URL/health/live" 200
make_request "$SERVICE_URL/health/ready" 200
make_request "$SERVICE_URL/health" 200

echo ""

# Test metrics endpoints
echo "📊 Testing Metrics Endpoints..."
make_request "$SERVICE_URL/metrics" 200
make_request "$SERVICE_URL/metrics/health-summary" 200

echo ""

# Test Prometheus metrics
echo "📈 Testing Prometheus Metrics..."
prometheus_response=$(curl -s --max-time $TIMEOUT "$SERVICE_URL/metrics/prometheus" 2>/dev/null)
if [ $? -eq 0 ] && echo "$prometheus_response" | grep -q "outbox_events_processed_total"; then
    echo "✅ Prometheus metrics available"
    echo "📊 Sample metrics:"
    echo "$prometheus_response" | grep "outbox_events" | head -3
else
    echo "❌ Prometheus metrics not available"
fi

echo ""

# Summary
echo "📋 Test Summary:"
echo "- Service should be running on port 3003"
echo "- Health checks should return 200 status"
echo "- Metrics should be available in JSON and Prometheus formats"
echo "- Processor should be polling outbox events every 5 seconds"

echo ""
echo "🔍 To monitor processing in real-time:"
echo "  watch -n 2 'curl -s $SERVICE_URL/metrics/health-summary | jq'"

echo ""
echo "📦 To test with sample outbox events, ensure your database has:"
echo "  1. outbox_events table with unprocessed events"
echo "  2. Kafka broker running and accessible"
echo "  3. Proper environment variables configured" 