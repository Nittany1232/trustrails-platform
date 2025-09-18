import fetch from 'node-fetch';
import chalk from 'chalk';

export class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.healthCheckInterval = 30000; // 30 seconds
    this.healthChecks = new Map();
  }

  /**
   * Register a service with the registry
   * @param {Object} service - Service configuration
   * @param {string} service.name - Service name
   * @param {number} service.port - Service port
   * @param {string} service.healthPath - Health check endpoint path (optional)
   * @param {string[]} service.routes - Route prefixes this service handles
   */
  register(service) {
    const { name, port, healthPath = '/health', routes = [] } = service;

    const serviceConfig = {
      name,
      port,
      healthPath,
      routes,
      url: `http://localhost:${port}`,
      healthy: false,
      lastCheck: null,
      registeredAt: new Date(),
    };

    this.services.set(name, serviceConfig);
    console.log(chalk.green(`✓ Registered service: ${name} on port ${port}`));

    // Start health monitoring
    this.startHealthCheck(name);

    return serviceConfig;
  }

  /**
   * Unregister a service
   */
  unregister(serviceName) {
    if (this.services.has(serviceName)) {
      this.stopHealthCheck(serviceName);
      this.services.delete(serviceName);
      console.log(chalk.yellow(`✗ Unregistered service: ${serviceName}`));
    }
  }

  /**
   * Get service by name
   */
  getService(serviceName) {
    return this.services.get(serviceName);
  }

  /**
   * Find service by route prefix
   */
  findServiceByRoute(path) {
    for (const [name, service] of this.services) {
      if (service.healthy && service.routes.some(route => path.startsWith(route))) {
        return service;
      }
    }
    return null;
  }

  /**
   * Get all registered services
   */
  getAllServices() {
    return Array.from(this.services.values());
  }

  /**
   * Get healthy services only
   */
  getHealthyServices() {
    return Array.from(this.services.values()).filter(service => service.healthy);
  }

  /**
   * Start health check for a service
   */
  startHealthCheck(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) return;

    // Initial health check
    this.checkHealth(serviceName);

    // Set up periodic health checks
    const intervalId = setInterval(() => {
      this.checkHealth(serviceName);
    }, this.healthCheckInterval);

    this.healthChecks.set(serviceName, intervalId);
  }

  /**
   * Stop health check for a service
   */
  stopHealthCheck(serviceName) {
    const intervalId = this.healthChecks.get(serviceName);
    if (intervalId) {
      clearInterval(intervalId);
      this.healthChecks.delete(serviceName);
    }
  }

  /**
   * Perform health check on a service
   */
  async checkHealth(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) return;

    try {
      const response = await fetch(`${service.url}${service.healthPath}`, {
        method: 'GET',
        timeout: 5000,
      });

      const wasHealthy = service.healthy;
      service.healthy = response.ok;
      service.lastCheck = new Date();

      if (!wasHealthy && service.healthy) {
        console.log(chalk.green(`✓ Service ${serviceName} is now healthy`));
      } else if (wasHealthy && !service.healthy) {
        console.log(chalk.red(`✗ Service ${serviceName} is unhealthy (${response.status})`));
      }
    } catch (error) {
      const wasHealthy = service.healthy;
      service.healthy = false;
      service.lastCheck = new Date();

      if (wasHealthy) {
        console.log(chalk.red(`✗ Service ${serviceName} is unreachable: ${error.message}`));
      }
    }
  }

  /**
   * Auto-discover services by scanning common ports
   */
  async autoDiscover() {
    console.log(chalk.blue('🔍 Auto-discovering services...'));

    const commonPorts = [3000, 3001, 3002, 3003, 8080, 8081, 8082, 8083, 8084, 8085];
    const discoveries = [];

    for (const port of commonPorts) {
      try {
        const response = await fetch(`http://localhost:${port}/health`, {
          method: 'GET',
          timeout: 2000,
        });

        if (response.ok) {
          const serviceInfo = await response.json().catch(() => ({ name: `service-${port}` }));
          discoveries.push({
            port,
            name: serviceInfo.name || `service-${port}`,
            version: serviceInfo.version,
            routes: serviceInfo.routes || [],
          });
        }
      } catch (error) {
        // Port not responding, check if it's a known service
        await this.checkKnownServices(port);
      }
    }

    if (discoveries.length > 0) {
      console.log(chalk.green(`Found ${discoveries.length} auto-discoverable services`));
      discoveries.forEach(service => {
        console.log(chalk.cyan(`  - ${service.name} on port ${service.port}`));
      });
    }

    return discoveries;
  }

  /**
   * Check for known services that might not have health endpoints
   */
  async checkKnownServices(port) {
    const knownServices = {
      3001: { name: 'widget-demo', routes: ['/'], healthPath: '/' },
      3002: { name: 'trustrails-app', routes: ['/api/widget', '/api'], healthPath: '/' },
      8083: { name: 'plan-search-api', routes: ['/searchPlans', '/api/search'], healthPath: '/' },
    };

    const service = knownServices[port];
    if (service) {
      try {
        const response = await fetch(`http://localhost:${port}${service.healthPath}`, {
          method: 'GET',
          timeout: 2000,
        });

        if (response.ok) {
          this.register({
            name: service.name,
            port,
            routes: service.routes,
            healthPath: service.healthPath,
          });
        }
      } catch (error) {
        // Service not running
      }
    }
  }

  /**
   * Print service status
   */
  printStatus() {
    console.log(chalk.blue('\n📊 Service Registry Status:'));
    console.log(chalk.blue('================================'));

    if (this.services.size === 0) {
      console.log(chalk.yellow('No services registered'));
      return;
    }

    for (const [name, service] of this.services) {
      const status = service.healthy ? chalk.green('✓ HEALTHY') : chalk.red('✗ UNHEALTHY');
      const lastCheck = service.lastCheck ? service.lastCheck.toLocaleTimeString() : 'Never';

      console.log(chalk.white(`${name}:`));
      console.log(`  ${status} | Port: ${service.port} | Last Check: ${lastCheck}`);
      console.log(`  Routes: ${service.routes.join(', ') || 'None'}`);
      console.log('');
    }
  }
}