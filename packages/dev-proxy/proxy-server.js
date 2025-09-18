import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import chalk from 'chalk';
import { ServiceRegistry } from './service-registry.js';

export class ProxyServer {
  constructor(options = {}) {
    this.app = express();
    this.port = options.port || 8080;
    this.registry = new ServiceRegistry();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Enable CORS for all routes with permissive settings for development
    this.app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    }));

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      const timestamp = new Date().toLocaleTimeString();
      console.log(chalk.gray(`[${timestamp}] ${req.method} ${req.path}`));
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/proxy/health', (req, res) => {
      res.json({
        status: 'healthy',
        services: this.registry.getAllServices(),
        proxy: {
          port: this.port,
          uptime: process.uptime(),
        },
      });
    });

    // Service registry status endpoint
    this.app.get('/proxy/services', (req, res) => {
      res.json({
        services: this.registry.getAllServices(),
        healthy: this.registry.getHealthyServices(),
      });
    });

    // Service registry management endpoints
    this.app.post('/proxy/register', (req, res) => {
      try {
        const service = this.registry.register(req.body);
        res.json({ success: true, service });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    });

    this.app.delete('/proxy/unregister/:serviceName', (req, res) => {
      this.registry.unregister(req.params.serviceName);
      res.json({ success: true });
    });

    // Plan search API proxy (highest priority)
    this.app.use('/searchPlans', this.createServiceProxy('plan-search-api', {
      fallbackUrl: 'http://localhost:8083',
      pathRewrite: {
        '^/searchPlans': '',
      },
    }));

    this.app.use('/api/search', this.createServiceProxy('plan-search-api', {
      fallbackUrl: 'http://localhost:8083',
      pathRewrite: {
        '^/api/search': '',
      },
    }));

    // Widget auth API proxy
    this.app.use('/api/widget', this.createServiceProxy('widget-auth-service', {
      fallbackUrl: 'http://localhost:3002',
      pathRewrite: {},
    }));

    // General API proxy (TrustRails app)
    this.app.use('/api', this.createServiceProxy('trustrails-app', {
      fallbackUrl: 'http://localhost:3002',
      pathRewrite: {},
    }));

    // Static content / frontend proxy (lowest priority)
    this.app.use('/', this.createServiceProxy('widget-demo', {
      fallbackUrl: 'http://localhost:3001',
      pathRewrite: {},
    }));
  }

  createServiceProxy(serviceName, options = {}) {
    const { fallbackUrl, pathRewrite = {}, ...proxyOptions } = options;

    return createProxyMiddleware({
      target: fallbackUrl, // Default target
      changeOrigin: true,
      pathRewrite,
      timeout: 30000,
      proxyTimeout: 30000,
      ...proxyOptions,

      // Dynamic target resolution
      router: (req) => {
        const service = this.registry.getService(serviceName);
        if (service && service.healthy) {
          return service.url;
        }
        return fallbackUrl;
      },

      // Error handling
      onError: (err, req, res) => {
        console.log(chalk.red(`Proxy error for ${serviceName}: ${err.message}`));

        if (!res.headersSent) {
          res.status(503).json({
            error: 'Service Unavailable',
            message: `Service ${serviceName} is not available`,
            service: serviceName,
            timestamp: new Date().toISOString(),
          });
        }
      },

      // Success logging
      onProxyReq: (proxyReq, req, res) => {
        const service = this.registry.getService(serviceName);
        const target = service && service.healthy ? service.url : fallbackUrl;
        console.log(chalk.blue(`→ Proxying ${req.method} ${req.path} to ${serviceName} (${target})`));
      },

      // Response logging
      onProxyRes: (proxyRes, req, res) => {
        const statusColor = proxyRes.statusCode < 400 ? chalk.green : chalk.red;
        console.log(chalk.gray(`← ${statusColor(proxyRes.statusCode)} ${req.method} ${req.path}`));
      },
    });
  }

  async start() {
    try {
      // Auto-discover existing services
      await this.registry.autoDiscover();

      // Register known services that might be running
      await this.registerKnownServices();

      // Start the proxy server
      this.server = this.app.listen(this.port, () => {
        console.log(chalk.green('🚀 TrustRails Development Proxy Server Started!'));
        console.log(chalk.blue('====================================='));
        console.log(chalk.white(`Proxy URL: http://localhost:${this.port}`));
        console.log(chalk.white(`Health Check: http://localhost:${this.port}/proxy/health`));
        console.log(chalk.white(`Service Status: http://localhost:${this.port}/proxy/services`));
        console.log('');

        this.printRouteMap();
        this.registry.printStatus();

        // Print service status every 60 seconds
        setInterval(() => {
          this.registry.printStatus();
        }, 60000);
      });

      return this.server;
    } catch (error) {
      console.error(chalk.red('Failed to start proxy server:', error.message));
      throw error;
    }
  }

  async registerKnownServices() {
    // Try to register known services
    const knownServices = [
      {
        name: 'plan-search-api',
        port: 8083,
        routes: ['/searchPlans', '/api/search'],
        healthPath: '/',
      },
      {
        name: 'widget-demo',
        port: 3001,
        routes: ['/'],
        healthPath: '/',
      },
      {
        name: 'trustrails-app',
        port: 3002,
        routes: ['/api/widget', '/api'],
        healthPath: '/',
      },
      {
        name: 'widget-auth-service',
        port: 3003,
        routes: ['/api/widget'],
        healthPath: '/health',
      },
    ];

    for (const service of knownServices) {
      try {
        // Check if service is actually running before registering
        const response = await fetch(`http://localhost:${service.port}${service.healthPath}`, {
          method: 'GET',
          timeout: 2000,
        });

        if (response.ok) {
          this.registry.register(service);
        }
      } catch (error) {
        // Service not running, will be registered when it starts
        console.log(chalk.yellow(`Service ${service.name} not running on port ${service.port}`));
      }
    }
  }

  printRouteMap() {
    console.log(chalk.blue('🗺️  Route Mapping:'));
    console.log(chalk.blue('=================='));
    console.log(chalk.white('/searchPlans/*     → plan-search-api (port 8083)'));
    console.log(chalk.white('/api/search/*      → plan-search-api (port 8083)'));
    console.log(chalk.white('/api/widget/*      → widget-auth-service (port 3003) or trustrails-app (port 3002)'));
    console.log(chalk.white('/api/*             → trustrails-app (port 3002)'));
    console.log(chalk.white('/*                 → widget-demo (port 3001)'));
    console.log('');
    console.log(chalk.gray('Note: Routes will automatically failover to fallback services if primary service is unavailable'));
    console.log('');
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log(chalk.yellow('Proxy server stopped'));
    }
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log(chalk.yellow('Received SIGTERM, shutting down gracefully...'));
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(chalk.yellow('Received SIGINT, shutting down gracefully...'));
  process.exit(0);
});