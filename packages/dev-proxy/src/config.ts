import type { Express } from 'express';

export interface ServiceRoute {
  /** Path pattern to match */
  path: string;
  /** Target service name for service discovery */
  target?: string;
  /** Fixed target URL (overrides service discovery) */
  targetUrl?: string;
  /** Priority for route matching (higher = checked first) */
  priority: number;
  /** Description for logging */
  description: string;
}

export interface ProxyConfig {
  /** Port for the proxy server */
  port: number;
  /** Host for the proxy server */
  host: string;
  /** CORS configuration */
  cors: {
    origin: string[] | boolean;
    credentials: boolean;
    optionsSuccessStatus: number;
  };
  /** Service discovery configuration */
  serviceDiscovery: {
    /** Port range to scan for services */
    portRange: {
      start: number;
      end: number;
    };
    /** Additional ports to always check */
    additionalPorts: number[];
    /** Health check timeout in ms */
    healthCheckTimeout: number;
    /** Service discovery interval in ms */
    discoveryInterval: number;
  };
  /** Route definitions */
  routes: ServiceRoute[];
}

// Default configuration
export const defaultConfig: ProxyConfig = {
  port: 8091,
  host: '0.0.0.0',
  cors: {
    origin: [
      'http://localhost:3001', // Widget demo
      'http://localhost:3002', // Main TrustRails app
      'http://localhost:8091', // Proxy itself
    ],
    credentials: true,
    optionsSuccessStatus: 200,
  },
  serviceDiscovery: {
    portRange: {
      start: 3000,
      end: 8089,
    },
    additionalPorts: [3001, 3002, 8081, 8082, 8083, 8084, 8085],
    healthCheckTimeout: 2000,
    discoveryInterval: 30000, // 30 seconds
  },
  routes: [
    // Plan search API routes (highest priority)
    {
      path: '/searchPlans',
      target: 'plan-search-api',
      priority: 100,
      description: 'Plan search API endpoint',
    },
    {
      path: '/api/search',
      target: 'plan-search-api',
      priority: 95,
      description: 'Alternative plan search API endpoint',
    },
    // Widget auth routes
    {
      path: '/api/widget',
      targetUrl: 'http://localhost:3002',
      priority: 90,
      description: 'Widget authentication service',
    },
    // General API routes (lower priority)
    {
      path: '/api',
      targetUrl: 'http://localhost:3002',
      priority: 50,
      description: 'Main TrustRails API',
    },
    // Static files and frontend (lowest priority)
    {
      path: '/',
      targetUrl: 'http://localhost:3001',
      priority: 10,
      description: 'Widget demo frontend',
    },
  ],
};

export type ServiceInfo = {
  name: string;
  url: string;
  port: number;
  healthy: boolean;
  lastCheck: Date;
  responseTime?: number;
};

export type ServiceRegistry = Map<string, ServiceInfo>;

/**
 * Load configuration from environment variables or use defaults
 */
export function loadConfig(): ProxyConfig {
  const config = { ...defaultConfig };

  // Override with environment variables if present
  if (process.env.PROXY_PORT) {
    config.port = parseInt(process.env.PROXY_PORT, 10);
  }

  if (process.env.PROXY_HOST) {
    config.host = process.env.PROXY_HOST;
  }

  if (process.env.CORS_ORIGINS) {
    config.cors.origin = process.env.CORS_ORIGINS.split(',');
  }

  return config;
}

/**
 * Get the route that should handle a given path
 */
export function getRouteForPath(path: string, routes: ServiceRoute[]): ServiceRoute | null {
  // Sort routes by priority (highest first)
  const sortedRoutes = [...routes].sort((a, b) => b.priority - a.priority);

  for (const route of sortedRoutes) {
    if (pathMatches(path, route.path)) {
      return route;
    }
  }

  return null;
}

/**
 * Check if a path matches a route pattern
 */
function pathMatches(path: string, pattern: string): boolean {
  // Exact match
  if (path === pattern) {
    return true;
  }

  // Prefix match for patterns ending with /
  if (pattern.endsWith('/')) {
    return path.startsWith(pattern);
  }

  // Prefix match for non-root patterns
  if (pattern !== '/') {
    return path.startsWith(pattern + '/') || path.startsWith(pattern + '?');
  }

  // Root pattern matches everything as fallback
  return pattern === '/';
}