import { NextRequest, NextResponse } from 'next/server';
import { isFirebaseAdminInitialized } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const isFirebaseReady = isFirebaseAdminInitialized();

    const healthStatus = {
      status: isFirebaseReady ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'widget-auth-service',
      version: '1.0.0',
      checks: {
        firebase: isFirebaseReady,
        server: true
      }
    };

    return NextResponse.json(healthStatus, {
      status: 200,
      headers: corsHeaders
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      service: 'widget-auth-service',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, {
      status: 503,
      headers: corsHeaders
    });
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}