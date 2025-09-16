#!/bin/bash

# TrustRails Platform Development Startup Script

echo "🚀 Starting TrustRails Platform Development Servers..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Kill existing processes on our ports if they exist
if check_port 5173; then
    echo "${YELLOW}⚠️  Killing existing process on port 5173...${NC}"
    kill $(lsof -t -i:5173) 2>/dev/null
    sleep 2
fi

if check_port 3001; then
    echo "${YELLOW}⚠️  Killing existing process on port 3001...${NC}"
    kill $(lsof -t -i:3001) 2>/dev/null
    sleep 2
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "${BLUE}📦 Installing root dependencies...${NC}"
    npm install
fi

if [ ! -d "packages/rollover-widget/node_modules" ]; then
    echo "${BLUE}📦 Installing widget dependencies...${NC}"
    cd packages/rollover-widget && npm install && cd ../..
fi

if [ ! -d "apps/widget-demo/node_modules" ]; then
    echo "${BLUE}📦 Installing demo app dependencies...${NC}"
    cd apps/widget-demo && npm install && cd ../..
fi

# Build the widget first
echo "${BLUE}🔨 Building widget package...${NC}"
cd packages/rollover-widget
npm run build
cd ../..

echo ""
echo "${GREEN}✅ Starting development servers...${NC}"
echo ""

# Start the widget dev server in background
echo "📦 Widget Development Server starting on http://localhost:5173"
cd packages/rollover-widget
npm run dev &
WIDGET_PID=$!
cd ../..

# Give it a moment to start
sleep 3

# Start the demo app
echo "🎯 Demo Application starting on http://localhost:3001"
cd apps/widget-demo
npm run dev &
DEMO_PID=$!
cd ..

echo ""
echo "${GREEN}===================================================${NC}"
echo "${GREEN}✨ TrustRails Platform is running!${NC}"
echo ""
echo "📦 Widget Dev Server:  ${BLUE}http://localhost:5173${NC}"
echo "🎯 Demo Application:   ${BLUE}http://localhost:3001${NC}"
echo ""
echo "Press Ctrl+C to stop all servers"
echo "${GREEN}===================================================${NC}"
echo ""

# Function to handle cleanup
cleanup() {
    echo ""
    echo "${YELLOW}Shutting down servers...${NC}"
    kill $WIDGET_PID 2>/dev/null
    kill $DEMO_PID 2>/dev/null
    echo "${GREEN}✅ Servers stopped${NC}"
    exit 0
}

# Set up trap to cleanup on Ctrl+C
trap cleanup INT

# Wait for both processes
wait $WIDGET_PID $DEMO_PID