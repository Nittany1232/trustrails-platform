/**
 * Widget Authentication Endpoint
 * POST /api/widget/auth
 *
 * This endpoint authenticates a widget using a public API key
 * and returns a bearer token for subsequent API calls
 *
 * Extracted from main app for widget auth microservice
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  hashAPIKey,
  isPublicKey,
  getKeyEnvironment,
  isValidAPIKeyFormat
} from '@/lib/api-keys-server';
import {
  createWidgetSession,
  generateBearerToken
} from '@/lib/widget-auth-server';
import { requireAdminApp } from '@/lib/firebase-admin';
import { apiRateLimiter } from '@/lib/rate-limiter';
import { AuditLogger, AuditSeverity } from '@/lib/audit/unified-audit-logger';
import { SOC2_AUDIT_EVENTS } from '@/types/audit-events';

export async function POST(request: NextRequest) {
  console.log('[WIDGET-AUTH] POST request received');

  // Set CORS headers for the response
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-TrustRails-API-Key, X-TrustRails-Partner-ID',
  };

  try {
    // Extract API key from header
    const apiKey = request.headers.get('X-TrustRails-API-Key');
    const partnerId = request.headers.get('X-TrustRails-Partner-ID');

    console.log('[WIDGET-AUTH] Headers:', {
      apiKey: apiKey ? `${apiKey.substring(0, 20)}...` : 'missing',
      partnerId: partnerId || 'missing'
    });

    if (!apiKey || !partnerId) {
      return NextResponse.json(
        { error: 'Missing required headers: X-TrustRails-API-Key and X-TrustRails-Partner-ID' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate API key format
    if (!isValidAPIKeyFormat(apiKey)) {
      return NextResponse.json(
        { error: 'Invalid API key format' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Ensure it's a public key (not secret)
    if (!isPublicKey(apiKey)) {
      return NextResponse.json(
        { error: 'Invalid key type. Widget authentication requires a public key (pk).' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Get request metadata
    const ipAddress = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const origin = request.headers.get('origin') || 'unknown';

    // Apply rate limiting
    const rateLimitResult = await apiRateLimiter.check(`widget_auth_${ipAddress}`);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        },
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'X-RateLimit-Limit': '100',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString()
          }
        }
      );
    }

    // Hash the API key for comparison
    const hashedKey = hashAPIKey(apiKey);

    // Verify custodian and API key
    const { adminDb } = requireAdminApp();

    // Direct document lookup by ID (custodians are created with their ID as the document ID)
    let custodianDoc = await adminDb
      .collection('custodians')
      .doc(partnerId)
      .get();

    if (!custodianDoc.exists) {
      console.log('[WIDGET-AUTH] No custodian found with ID:', partnerId);
      // Log failed authentication attempt
      await AuditLogger.logAuthentication(
        'failed',
        'unknown',
        'unknown',
        request,
        {
          eventType: SOC2_AUDIT_EVENTS.WIDGET_AUTH_FAILURE,
          reason: 'invalid_partner_id',
          partnerId,
          ipAddress
        }
      );
      return NextResponse.json(
        { error: 'Invalid partner credentials' },
        { status: 401, headers: corsHeaders }
      );
    }

    const custodianData = custodianDoc.data();
    console.log('[WIDGET-AUTH] Found custodian:', custodianDoc.id, 'Name:', custodianData?.name);

    // Check if custodian is active (payment/compliance status)
    if (custodianData?.status !== 'active') {
      // Return generic message to avoid exposing internal status
      return NextResponse.json(
        { error: 'Service temporarily unavailable. Please try again later.' },
        { status: 503, headers: corsHeaders }
      );
    }

    // Check if widget integration is enabled
    if (!custodianData?.widgetEnabled) {
      return NextResponse.json(
        { error: 'Widget integration is not enabled for this partner' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Find matching API key in integrationConfig.apiKeys (the proper structured approach)
    const apiKeys = custodianData?.integrationConfig?.apiKeys || [];
    const matchingKey = apiKeys.find(
      (key: any) => key.hashedKey === hashedKey &&
                    key.status === 'active' &&
                    key.type === 'public'
    );

    if (!matchingKey) {
      console.log('[WIDGET-AUTH] No matching API key found');
      console.log('[WIDGET-AUTH] Available keys in integrationConfig.apiKeys:', apiKeys.length);
      console.log('[WIDGET-AUTH] Provided key hash:', hashedKey.substring(0, 20) + '...');

      // Log failed authentication attempt
      await AuditLogger.logAuthentication(
        'failed',
        'unknown',
        custodianData?.email || 'unknown',
        request,
        {
          eventType: SOC2_AUDIT_EVENTS.WIDGET_AUTH_FAILURE,
          reason: 'invalid_api_key',
          custodianId: partnerId,
          ipAddress
        }
      );
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      );
    }

    console.log('[WIDGET-AUTH] Found matching API key:', matchingKey.id);

    // Update last used timestamp for the API key
    const keyIndex = apiKeys.findIndex((k: any) => k.id === matchingKey.id);
    if (keyIndex !== -1) {
      apiKeys[keyIndex].lastUsedAt = new Date().toISOString();
      await custodianDoc.ref.update({
        'integrationConfig.apiKeys': apiKeys
      });
    }

    // Parse request body for additional data
    console.log('[WIDGET-AUTH] Parsing request body...');
    const body = await request.json();
    const { widget_version, user_token } = body;

    // Create widget session
    console.log('[WIDGET-AUTH] Creating widget session...');
    const session = await createWidgetSession(
      partnerId,
      hashedKey,
      ipAddress,
      userAgent,
      origin,
      user_token // Optional user ID if returning user
    );
    console.log('[WIDGET-AUTH] Session created:', session.sessionId);

    // Generate bearer token
    console.log('[WIDGET-AUTH] Generating bearer token...');
    const bearerToken = generateBearerToken(
      session.sessionId,
      partnerId,
      user_token
    );
    console.log('[WIDGET-AUTH] Bearer token generated successfully');

    // Get environment from API key
    const environment = getKeyEnvironment(apiKey);

    // Log successful authentication for audit
    await AuditLogger.logAuthentication(
      'login',
      partnerId,
      custodianData?.email || 'widget-auth',
      request,
      {
        eventType: SOC2_AUDIT_EVENTS.WIDGET_AUTH_SUCCESS,
        custodianId: partnerId,
        sessionId: session.sessionId,
        apiKeyId: matchingKey.id,
        origin,
        widgetVersion: widget_version,
        environment,
        ipAddress
      }
    );

    // Log session creation
    await AuditLogger.logAdminAction(
      'widget_session_created',
      partnerId,
      { type: 'widget_session', id: session.sessionId, name: 'Widget Session' },
      request,
      {
        eventType: SOC2_AUDIT_EVENTS.WIDGET_SESSION_CREATED,
        custodianId: partnerId,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt.toISOString()
      }
    );

    return NextResponse.json({
      success: true,
      session_id: session.sessionId,
      bearer_token: bearerToken,
      expires_at: session.expiresAt.toISOString(),
      environment,
      custodian: {
        id: partnerId,
        name: custodianData.name,
        logo_url: custodianData.logoUrl
      },
      widget_config: custodianData?.integrationConfig?.widgetConfig || {
        theme: {
          primaryColor: '#1a73e8',
          fontFamily: 'system-ui',
          borderRadius: '8px'
        },
        features: {
          oauth_providers: ['google', 'microsoft'],
          allow_email_signup: true
        }
      }
    }, {
      status: 200,
      headers: {
        ...corsHeaders,
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString()
      }
    });

  } catch (error) {
    // Log the actual error for debugging
    console.error('[WIDGET-AUTH] Authentication error:', error);
    console.error('[WIDGET-AUTH] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[WIDGET-AUTH] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      name: error instanceof Error ? error.name : 'Unknown',
      code: (error as any)?.code,
      details: (error as any)?.details
    });

    // Log system error (don't await in catch block to avoid blocking)
    AuditLogger.logSecurityEvent(
      'widget_auth_error',
      AuditSeverity.ERROR,
      error instanceof Error ? error.message : 'Unknown error in widget authentication',
      undefined,
      request,
      {
        eventType: SOC2_AUDIT_EVENTS.WIDGET_AUTH_FAILURE,
        error: error instanceof Error ? error.stack : String(error)
      }
    ).catch(err => console.error('[WIDGET-AUTH] Failed to log error:', err));

    return NextResponse.json(
      { error: 'Internal server error during authentication' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-TrustRails-API-Key, X-TrustRails-Partner-ID',
      'Access-Control-Max-Age': '86400',
    },
  });
}