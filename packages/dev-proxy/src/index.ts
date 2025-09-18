import express from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import chalk from 'chalk';
import { ServiceDiscovery } from './service-discovery.js';
import { loadConfig, getRouteForPath, type ServiceRoute } from './config.js';

/**
 * TrustRails Development Proxy Server
 *
 * Features:
 * - Auto-discovery of running services
 * - Intelligent routing based on URL patterns
 * - CORS handling for widget development
 * - Health checks and fallback logic
 * - Service registry persistence
 */
class DevProxyServer {
  private app: express.Application;
  private serviceDiscovery: ServiceDiscovery;
  private config = loadConfig();

  constructor() {
    this.app = express();
    this.serviceDiscovery = new ServiceDiscovery(this.config);
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // CORS middleware
    this.app.use(cors(this.config.cors));

    // JSON parsing
    this.app.use(express.json());

    // Request logging
    this.app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(chalk.gray(`[${timestamp}]`), chalk.blue(`${req.method}`), chalk.white(req.url));
      next();
    });
  }

  /**
   * Setup proxy routes
   */
  private setupRoutes(): void {
    // Health check endpoint for the proxy itself
    this.app.get('/proxy/health', (req, res) => {
      const services = this.serviceDiscovery.getHealthyServices();
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: services.map(s => ({
          name: s.name,
          url: s.url,
          responseTime: s.responseTime,
        })),
      });
    });

    // Service registry endpoint
    this.app.get('/proxy/services', (req, res) => {
      const registry = this.serviceDiscovery.getRegistry();
      const services = Array.from(registry.values()).map(service => ({
        name: service.name,
        url: service.url,
        port: service.port,
        healthy: service.healthy,
        lastCheck: service.lastCheck,
        responseTime: service.responseTime,
      }));

      res.json({
        services,
        totalCount: services.length,
        healthyCount: services.filter(s => s.healthy).length,
      });
    });

    // Dynamic proxy routes
    this.app.use('*', (req, res, next) => {
      // Extract the path from URL, removing query parameters
      const urlPath = req.originalUrl.split('?')[0];
      const route = getRouteForPath(urlPath, this.config.routes);

      if (!route) {
        console.error(chalk.red('[RouteError]'), `No route found for path: "${urlPath}"`);
        return res.status(404).json({
          error: 'No route found',
          path: urlPath,
          availableRoutes: this.config.routes.map(r => r.path),
        });
      }

      // Get target URL
      const targetUrl = this.getTargetUrl(route);
      if (!targetUrl) {
        console.error(chalk.red('[Proxy Error]'), `No target URL for route ${route.path}, target: ${route.target}`);
        return res.status(503).json({
          error: 'Service unavailable',
          route: route.path,
          target: route.target,
          description: route.description,
          availableServices: Array.from(this.serviceDiscovery.getRegistry().keys()),
        });
      }

      console.log(chalk.green('[Proxy]'), `${req.method} ${urlPath} → ${targetUrl} (via route: ${route.path})`);

      // Create proxy middleware
      const proxy = createProxyMiddleware({
        target: targetUrl,
        changeOrigin: true,
        timeout: 30000, // 30 second timeout
        proxyTimeout: 30000,

        // Forward all headers
        onProxyReq: (proxyReq, req) => {
          // Forward original host for debugging
          proxyReq.setHeader('X-Original-Host', req.headers.host || 'unknown');
          proxyReq.setHeader('X-Forwarded-By', 'TrustRails-DevProxy');
        },

        // Handle responses
        onProxyRes: (proxyRes, req, res) => {
          // Add proxy headers for debugging
          res.setHeader('X-Proxied-From', targetUrl);
          res.setHeader('X-Proxy-Route', route.path);

          // Log response
          const statusColor = proxyRes.statusCode && proxyRes.statusCode >= 400 ? chalk.red : chalk.green;
          console.log(chalk.gray('  ←'), statusColor(`${proxyRes.statusCode}`), chalk.gray(`${req.path}`));
        },

        // Error handling
        onError: (err, req, res) => {
          console.error(chalk.red('[Proxy Error]'), err.message);

          if (!res.headersSent) {
            res.status(502).json({
              error: 'Bad Gateway',
              message: 'Failed to proxy request',
              target: targetUrl,
              details: err.message,
            });
          }
        },
      });

      proxy(req, res, next);
    });
  }

  /**
   * Get target URL for a route
   */
  private getTargetUrl(route: ServiceRoute): string | null {
    // If route has a fixed target URL, use it
    if (route.targetUrl) {
      return route.targetUrl;
    }

    // Otherwise, use service discovery
    if (route.target) {
      const service = this.serviceDiscovery.findBestService(route.target);
      if (service && service.healthy) {
        return service.url;
      }

      // Try to find any service matching the target name (even if unhealthy)
      const anyService = this.serviceDiscovery.getService(route.target);
      if (anyService) {
        console.warn(chalk.yellow('[Warning]'), `Service ${route.target} is unhealthy, trying anyway...`);
        return anyService.url;
      }

      console.error(chalk.red('[Error]'), `Service ${route.target} not found in registry`);
      return null;
    }

    return null;
  }

  /**
   * Start the proxy server
   */
  async start(): Promise<void> {
    // Start service discovery
    this.serviceDiscovery.start();

    // Wait a moment for initial service discovery
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start the server
    return new Promise((resolve) => {
      this.app.listen(this.config.port, this.config.host, () => {
        console.log(chalk.green('🚀 TrustRails Dev Proxy Server started'));
        console.log(chalk.blue('   URL:'), chalk.cyan(`http://${this.config.host === '0.0.0.0' ? 'localhost' : this.config.host}:${this.config.port}`));
        console.log(chalk.blue('   Health:'), chalk.cyan(`http://localhost:${this.config.port}/proxy/health`));
        console.log(chalk.blue('   Services:'), chalk.cyan(`http://localhost:${this.config.port}/proxy/services`));
        console.log('');
        console.log(chalk.blue('📋 Configured Routes:'));

        this.config.routes
          .sort((a, b) => b.priority - a.priority)
          .forEach(route => {
            const target = route.targetUrl || (route.target ? `→ ${route.target}` : 'no target');
            console.log(`   ${chalk.yellow(route.path.padEnd(20))} ${chalk.gray(target)} ${chalk.dim(`(${route.description})`)}`);
          });

        console.log('');
        resolve();
      });
    });
  }

  /**
   * Stop the proxy server
   */
  stop(): void {
    this.serviceDiscovery.stop();
    console.log(chalk.blue('[DevProxy]'), 'Server stopped');
  }
}

// Handle graceful shutdown
const gracefulShutdown = (proxy: DevProxyServer) => {
  console.log(chalk.yellow('\n🛑 Received shutdown signal...'));
  proxy.stop();
  process.exit(0);
};

// Start the server
async function main() {
  const proxy = new DevProxyServer();

  // Handle shutdown signals
  process.on('SIGINT', () => gracefulShutdown(proxy));
  process.on('SIGTERM', () => gracefulShutdown(proxy));

  try {
    await proxy.start();
  } catch (error) {
    console.error(chalk.red('Failed to start proxy server:'), error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { DevProxyServer };