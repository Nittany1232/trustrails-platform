/**
 * Health Check Endpoint
 * GET /api/health
 *
 * Returns service health status for monitoring and load balancing
 */

import { NextRequest, NextResponse } from 'next/server';
import { isFirebaseAdminInitialized } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check Firebase connectivity
    const firebaseHealthy = isFirebaseAdminInitialized();

    // Basic service checks
    const checks = {
      firebase: firebaseHealthy,
      environment: !!process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: Date.now() - startTime
    };

    const isHealthy = Object.values(checks).every(check =>
      typeof check === 'boolean' ? check : true
    );

    return NextResponse.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'widget-auth-service',
      version: '1.0.0',
      checks
    }, {
      status: isHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      service: 'widget-auth-service',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime
    }, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  }
}