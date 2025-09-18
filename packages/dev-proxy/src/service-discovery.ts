import { createConnection } from 'net';
import fetch, { Response } from 'node-fetch';
import chalk from 'chalk';
import type { ServiceInfo, ServiceRegistry, ProxyConfig } from './config.js';

/**
 * Service Discovery Manager
 * Handles port scanning, health checks, and service registry management
 */
export class ServiceDiscovery {
  private serviceRegistry: ServiceRegistry = new Map();
  private discoveryInterval?: NodeJS.Timeout;
  private config: ProxyConfig;

  constructor(config: ProxyConfig) {
    this.config = config;
  }

  /**
   * Start the service discovery process
   */
  start(): void {
    console.log(chalk.blue('[ServiceDiscovery]'), 'Starting service discovery...');

    // Initial discovery
    this.discoverServices();

    // Set up periodic discovery
    this.discoveryInterval = setInterval(() => {
      this.discoverServices();
    }, this.config.serviceDiscovery.discoveryInterval);
  }

  /**
   * Stop the service discovery process
   */
  stop(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = undefined;
    }
    console.log(chalk.blue('[ServiceDiscovery]'), 'Stopped service discovery');
  }

  /**
   * Get the service registry
   */
  getRegistry(): ServiceRegistry {
    return this.serviceRegistry;
  }

  /**
   * Get a service by name
   */
  getService(name: string): ServiceInfo | undefined {
    return this.serviceRegistry.get(name);
  }

  /**
   * Get all healthy services
   */
  getHealthyServices(): ServiceInfo[] {
    return Array.from(this.serviceRegistry.values()).filter(service => service.healthy);
  }

  /**
   * Discover services by scanning ports
   */
  private async discoverServices(): Promise<void> {
    const { portRange, additionalPorts } = this.config.serviceDiscovery;

    // Create list of ports to scan
    const portsToScan = new Set<number>();

    // Add port range
    for (let port = portRange.start; port <= portRange.end; port++) {
      portsToScan.add(port);
    }

    // Add additional ports
    additionalPorts.forEach(port => portsToScan.add(port));

    console.log(chalk.blue('[ServiceDiscovery]'), `Scanning ${portsToScan.size} ports...`);

    const scanPromises = Array.from(portsToScan).map(port => this.scanPort(port));
    await Promise.allSettled(scanPromises);

    this.logDiscoveryResults();
  }

  /**
   * Scan a specific port for services
   */
  private async scanPort(port: number): Promise<void> {
    try {
      // First, check if port is open
      const isOpen = await this.isPortOpen(port);
      if (!isOpen) {
        // Remove from registry if it was there before
        this.removeServiceByPort(port);
        return;
      }

      // Try to identify the service
      const serviceInfo = await this.identifyService(port);
      if (serviceInfo) {
        this.serviceRegistry.set(serviceInfo.name, serviceInfo);
      }
    } catch (error) {
      // Port scan failed, remove from registry if it was there
      this.removeServiceByPort(port);
    }
  }

  /**
   * Check if a port is open
   */
  private isPortOpen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection({ port, host: 'localhost' });

      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 1000); // 1 second timeout for port check

      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  /**
   * Try to identify what service is running on a port
   */
  private async identifyService(port: number): Promise<ServiceInfo | null> {
    const url = `http://localhost:${port}`;
    const startTime = Date.now();

    try {
      // Try health check endpoint first
      let response = await this.fetchWithTimeout(`${url}/health`, {
        headers: { 'User-Agent': 'TrustRails-DevProxy/1.0' }
      });

      if (!response.ok) {
        // Try root endpoint if health check fails
        response = await this.fetchWithTimeout(url, {
          headers: { 'User-Agent': 'TrustRails-DevProxy/1.0' }
        });
      }

      // For plan-search-api, a 400 error with parameter requirement is actually healthy
      if (!response.ok && port >= 8081 && port <= 8085) {
        try {
          const text = await response.text();
          if (text.includes('search parameter required') || text.includes('parameters required')) {
            // This is actually a healthy API that just needs parameters
            return {
              name: 'plan-search-api',
              url,
              port,
              healthy: true,
              lastCheck: new Date(),
              responseTime: Date.now() - startTime,
            };
          }
        } catch (error) {
          // Ignore text parsing errors
        }
      }

      const responseTime = Date.now() - startTime;
      const serviceName = this.guessServiceName(port, response);

      return {
        name: serviceName,
        url,
        port,
        healthy: response.ok,
        lastCheck: new Date(),
        responseTime,
      };
    } catch (error) {
      // Service might be running but not HTTP, try to guess based on port
      const serviceName = this.guessServiceNameByPort(port);
      if (serviceName) {
        return {
          name: serviceName,
          url,
          port,
          healthy: false, // Mark as unhealthy since HTTP check failed
          lastCheck: new Date(),
          responseTime: undefined,
        };
      }
      return null;
    }
  }

  /**
   * Guess service name based on response headers or content
   */
  private guessServiceName(port: number, response: Response): string {
    // Check headers for service identification
    const serverHeader = response.headers.get('server');
    const xPoweredBy = response.headers.get('x-powered-by');

    // Check for known service patterns
    if (serverHeader?.includes('Express')) {
      // Try to guess based on port and known patterns
      return this.guessServiceNameByPort(port) || `express-service-${port}`;
    }

    if (xPoweredBy?.includes('Next.js')) {
      return this.guessServiceNameByPort(port) || `nextjs-app-${port}`;
    }

    // Default to port-based naming
    return this.guessServiceNameByPort(port) || `service-${port}`;
  }

  /**
   * Guess service name based on known port mappings
   */
  private guessServiceNameByPort(port: number): string | null {
    const knownServices: Record<number, string> = {
      3001: 'widget-demo',
      3002: 'trustrails-app',
      8081: 'plan-search-api',
      8082: 'plan-search-api',
      8083: 'plan-search-api',
      8084: 'dol-processor',
      8085: 'cache-service',
    };

    return knownServices[port] || null;
  }

  /**
   * Remove a service from registry by port
   */
  private removeServiceByPort(port: number): void {
    for (const [name, service] of this.serviceRegistry.entries()) {
      if (service.port === port) {
        this.serviceRegistry.delete(name);
        break;
      }
    }
  }

  /**
   * Log discovery results
   */
  private logDiscoveryResults(): void {
    const services = Array.from(this.serviceRegistry.values());
    const healthyServices = services.filter(s => s.healthy);
    const unhealthyServices = services.filter(s => !s.healthy);

    console.log(chalk.blue('[ServiceDiscovery]'), `Found ${services.length} services (${healthyServices.length} healthy, ${unhealthyServices.length} unhealthy)`);

    if (healthyServices.length > 0) {
      console.log(chalk.green('[Healthy Services]'));
      healthyServices.forEach(service => {
        const responseTime = service.responseTime ? `${service.responseTime}ms` : 'N/A';
        console.log(`  ✓ ${chalk.cyan(service.name)} - ${service.url} (${responseTime})`);
      });
    }

    if (unhealthyServices.length > 0) {
      console.log(chalk.yellow('[Detected but Unhealthy]'));
      unhealthyServices.forEach(service => {
        console.log(`  ⚠ ${chalk.yellow(service.name)} - ${service.url}`);
      });
    }
  }

  /**
   * Perform health check on a specific service
   */
  async checkServiceHealth(service: ServiceInfo): Promise<boolean> {
    const startTime = Date.now();

    try {
      const response = await this.fetchWithTimeout(`${service.url}/health`, {
        headers: { 'User-Agent': 'TrustRails-DevProxy/1.0' }
      });

      const responseTime = Date.now() - startTime;
      const isHealthy = response.ok;

      // Update service info
      service.healthy = isHealthy;
      service.lastCheck = new Date();
      service.responseTime = responseTime;

      return isHealthy;
    } catch (error) {
      // Update service as unhealthy
      service.healthy = false;
      service.lastCheck = new Date();
      service.responseTime = undefined;

      return false;
    }
  }

  /**
   * Fetch with timeout wrapper for node-fetch
   */
  private async fetchWithTimeout(url: string, options: any = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.serviceDiscovery.healthCheckTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Find the best service for a given target name
   */
  findBestService(targetName: string): ServiceInfo | null {
    // First, try exact name match
    const exactMatch = this.serviceRegistry.get(targetName);
    if (exactMatch && exactMatch.healthy) {
      return exactMatch;
    }

    // Try partial name matching for services like "plan-search-api"
    const services = Array.from(this.serviceRegistry.values());
    const partialMatch = services.find(service =>
      service.healthy &&
      (service.name.includes(targetName) || targetName.includes(service.name))
    );

    if (partialMatch) {
      return partialMatch;
    }

    // Return the exact match even if unhealthy (for debugging)
    return exactMatch || null;
  }
}