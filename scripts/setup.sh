#!/bin/bash

echo "🚀 Setting up UOOP Platform..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

echo "✅ Docker is installed"

# Clean install
echo "🧹 Cleaning previous installation..."
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf libs/*/node_modules

# Install dependencies
echo "📦 Installing dependencies..."
npm install --legacy-peer-deps

# Install workspace dependencies
echo "📦 Installing workspace dependencies..."
npm install --workspace=libs/shared --legacy-peer-deps
npm install --workspace=libs/database --legacy-peer-deps
npm install --workspace=libs/redis --legacy-peer-deps
npm install --workspace=libs/kafka --legacy-peer-deps
npm install --workspace=libs/monitoring --legacy-peer-deps

# Build shared libraries
echo "🔨 Building shared libraries..."
cd libs/shared && npm run build && cd ../..
cd libs/database && npm run build && cd ../..
cd libs/redis && npm run build && cd ../..
cd libs/kafka && npm run build && cd ../..
cd libs/monitoring && npm run build && cd ../..

echo "✅ Setup completed successfully!"
echo ""
echo "🎉 Next steps:"
echo "1. Start infrastructure: npm run docker:up"
echo "2. Start development: npm run start:dev"
echo "3. Access services:"
echo "   - API Gateway: http://localhost:8080"
echo "   - API Docs: http://localhost:8080/api/docs"
echo "   - Grafana: http://localhost:3004 (admin/admin)"
echo "   - Prometheus: http://localhost:9090" 