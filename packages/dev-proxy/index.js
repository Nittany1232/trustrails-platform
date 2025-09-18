#!/usr/bin/env node

import dotenv from 'dotenv';
import { ProxyServer } from './proxy-server.js';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from various locations
dotenv.config({ path: join(__dirname, '.env') });
dotenv.config({ path: join(__dirname, '.env.development') });
dotenv.config({ path: join(__dirname, '../../.env.development') });

async function main() {
  try {
    console.log(chalk.blue('🔧 Starting TrustRails Development Proxy...'));
    console.log('');

    const port = process.env.PROXY_PORT || process.env.PORT || 8080;

    const proxy = new ProxyServer({ port });
    await proxy.start();

    console.log(chalk.green('✅ Proxy server is ready for requests!'));
    console.log('');
    console.log(chalk.cyan('💡 Pro Tips:'));
    console.log(chalk.white('  • Update your widget to use http://localhost:8080 for development'));
    console.log(chalk.white('  • Services will auto-register when they start up'));
    console.log(chalk.white('  • Check /proxy/health for service status'));
    console.log(chalk.white('  • Use Ctrl+C to stop the proxy'));
    console.log('');

  } catch (error) {
    console.error(chalk.red('Failed to start development proxy:'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  process.exit(1);
});

// Start the proxy
main();