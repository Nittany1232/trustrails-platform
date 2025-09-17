/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for containerization
  output: 'standalone',

  // API routes configuration
  async rewrites() {
    return [
      // Widget auth endpoints
      {
        source: '/api/widget/:path*',
        destination: '/api/widget/:path*',
      },
    ];
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },

  // Environment variables
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Experimental features
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
  },
};

module.exports = nextConfig;