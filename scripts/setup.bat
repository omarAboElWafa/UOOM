@echo off
echo 🚀 Setting up UOOP Platform...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    exit /b 1
)

echo ✅ Node.js version: 
node --version

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed. Please install Docker first.
    exit /b 1
)

echo ✅ Docker is installed

REM Clean install
echo 🧹 Cleaning previous installation...
if exist node_modules rmdir /s /q node_modules
for /d %%i in (apps\*) do if exist %%i\node_modules rmdir /s /q %%i\node_modules
for /d %%i in (libs\*) do if exist %%i\node_modules rmdir /s /q %%i\node_modules

REM Install dependencies
echo 📦 Installing dependencies...
npm install --legacy-peer-deps

REM Install workspace dependencies
echo 📦 Installing workspace dependencies...
npm install --workspace=libs/shared --legacy-peer-deps
npm install --workspace=libs/database --legacy-peer-deps
npm install --workspace=libs/redis --legacy-peer-deps
npm install --workspace=libs/kafka --legacy-peer-deps
npm install --workspace=libs/monitoring --legacy-peer-deps

REM Build shared libraries
echo 🔨 Building shared libraries...
cd libs\shared && npm run build && cd ..\..
cd libs\database && npm run build && cd ..\..
cd libs\redis && npm run build && cd ..\..
cd libs\kafka && npm run build && cd ..\..
cd libs\monitoring && npm run build && cd ..\..

echo ✅ Setup completed successfully!
echo.
echo 🎉 Next steps:
echo 1. Start infrastructure: npm run docker:up
echo 2. Start development: npm run start:dev
echo 3. Access services:
echo    - API Gateway: http://localhost:8080
echo    - API Docs: http://localhost:8080/api/docs
echo    - Grafana: http://localhost:3004 (admin/admin)
echo    - Prometheus: http://localhost:9090 