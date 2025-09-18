# TrustRails Development Proxy

A comprehensive development proxy and service discovery system for the TrustRails platform monorepo.

## Features

- 🔍 **Auto-discovery of running services** - Scans ports 3000-8090 to find active services
- 🎯 **Intelligent routing** - Routes requests based on URL patterns with priority handling
- 🌐 **CORS handling** - Proper CORS headers for widget development
- 🏥 **Health checks** - Monitors service health and provides fallback logic
- 📊 **Service registry** - Persistent tracking of discovered services
- ⚡ **Performance monitoring** - Response time tracking and service metrics
- 🔄 **Automatic retry** - Handles service failures with graceful fallback

## Quick Start

```bash
# Install dependencies
npm install

# Start the proxy server
npm run dev

# Build TypeScript
npm run build
```

The proxy will start on port 8080 and automatically discover running services.

## Configuration

### Environment Variables

```bash
PROXY_PORT=8080          # Proxy server port
PROXY_HOST=0.0.0.0       # Proxy server host
CORS_ORIGINS=http://localhost:3001,http://localhost:3002  # CORS origins
```

### Service Discovery

The proxy automatically scans these port ranges:
- **3000-8090**: Main service range
- **Additional ports**: 3001, 3002, 8081-8085 (known service ports)

### Routing Rules

Routes are configured with priority-based matching:

| Priority | Path Pattern | Target | Description |
|----------|-------------|--------|-------------|
| 100 | `/searchPlans` | `plan-search-api` | Plan search API endpoint |
| 95 | `/api/search` | `plan-search-api` | Alternative search endpoint |
| 90 | `/api/widget` | `http://localhost:3002` | Widget authentication |
| 50 | `/api` | `http://localhost:3002` | Main TrustRails API |
| 10 | `/` | `http://localhost:3001` | Widget demo frontend |

## API Endpoints

### Proxy Health Check
```bash
GET http://localhost:8080/proxy/health
```

Returns proxy status and discovered services.

### Service Registry
```bash
GET http://localhost:8080/proxy/services
```

Returns all discovered services with health status.

## Usage with Widget

The widget automatically detects development environment and uses the proxy:

```typescript
// Automatic environment detection
private isDevelopment(): boolean {
  return window.location.hostname === 'localhost';
}

// Uses proxy in development, production URLs in production
private getApiEndpoint(): string {
  return this.isDevelopment()
    ? 'http://localhost:8080'
    : 'https://api.trustrails.com';
}
```

## Development Workflow

### Start Everything
```bash
# Option 1: Start all services together
npm run dev:all

# Option 2: Start services individually
npm run dev:proxy   # Proxy server
npm run dev:widget  # Widget build
npm run dev:demo    # Widget demo app
npm run dev:api     # Plan search API
```

### Monitor Services
```bash
# View discovered services
curl http://localhost:8080/proxy/services

# Check proxy health
curl http://localhost:8080/proxy/health
```

### Test Widget Integration
```bash
# Test plan search through proxy
curl "http://localhost:8080/searchPlans?q=microsoft"

# Test widget auth through proxy
curl -X POST http://localhost:8080/api/widget/auth \
  -H "Content-Type: application/json" \
  -H "X-TrustRails-Partner-ID: test" \
  -H "X-TrustRails-API-Key: test"
```

## Service Discovery

### Automatic Detection

The proxy automatically detects services by:

1. **Port scanning** - Checks if ports are open
2. **HTTP health checks** - Tests `/health` and `/` endpoints
3. **Service identification** - Guesses service names based on:
   - Response headers (`Server`, `X-Powered-By`)
   - Known port mappings
   - Response patterns

### Known Service Mappings

| Port | Service Name | Description |
|------|-------------|-------------|
| 3001 | `widget-demo` | Widget demo application |
| 3002 | `trustrails-app` | Main TrustRails application |
| 8081-8083 | `plan-search-api` | Plan search API instances |
| 8084 | `dol-processor` | DOL data processor |
| 8085 | `cache-service` | Cache service |

### Health Monitoring

Services are continuously monitored:
- **Health checks** every 30 seconds
- **Response time** tracking
- **Automatic removal** of failed services
- **Retry logic** for temporary failures

## Error Handling

### Service Unavailable
```json
{
  "error": "Service unavailable",
  "route": "/api/search",
  "target": "plan-search-api",
  "description": "Plan search API endpoint"
}
```

### No Route Found
```json
{
  "error": "No route found",
  "path": "/unknown",
  "availableRoutes": ["/searchPlans", "/api/search", "/api/widget", "/api", "/"]
}
```

### Proxy Error
```json
{
  "error": "Bad Gateway",
  "message": "Failed to proxy request",
  "target": "http://localhost:8083",
  "details": "ECONNREFUSED"
}
```

## TypeScript Support

Full TypeScript support with strict type checking:

```typescript
import { ServiceDiscovery } from './service-discovery.js';
import { loadConfig, type ServiceRoute } from './config.js';

const config = loadConfig();
const discovery = new ServiceDiscovery(config);
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Widget Demo   │    │  TrustRails App │    │ Plan Search API │
│   Port 3001     │    │   Port 3002     │    │   Port 8083     │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Dev Proxy     │
                    │   Port 8080     │
                    │                 │
                    │ ┌─────────────┐ │
                    │ │Service      │ │
                    │ │Discovery    │ │
                    │ └─────────────┘ │
                    │ ┌─────────────┐ │
                    │ │Route        │ │
                    │ │Handler      │ │
                    │ └─────────────┘ │
                    └─────────────────┘
```

## Production Considerations

- **Not for production use** - This is a development-only tool
- **Security** - No authentication/authorization (by design)
- **Performance** - Not optimized for high-traffic scenarios
- **Reliability** - Service discovery adds latency

## Troubleshooting

### Service Not Found
1. Check if the service is running: `lsof -i :8083`
2. Verify health endpoint: `curl http://localhost:8083/health`
3. Check proxy logs for discovery issues

### CORS Issues
1. Verify CORS origins in configuration
2. Check browser network tab for CORS errors
3. Ensure proxy is forwarding headers correctly

### Proxy Not Starting
1. Check if port 8080 is available: `lsof -i :8080`
2. Verify Node.js version: `node --version` (requires 18+)
3. Check TypeScript compilation: `npm run build`

## Contributing

1. Follow TypeScript strict mode
2. Add proper error handling
3. Update route configurations as needed
4. Test with actual widget integration
5. Update documentation for new features