/**
 * Widget User Account Creation Endpoint
 * POST /api/widget/create-account
 *
 * This endpoint creates or retrieves a user account for widget users
 * Supports OAuth and email/password signup
 *
 * Extracted from main app for widget auth microservice
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken, createOrGetRolloverUser } from '@/lib/widget-auth-server';
import { requireAdminApp } from '@/lib/firebase-admin';
import { multiRateLimiter } from '@/lib/multi-rate-limiter';
import { getClientIP, getIPFingerprint } from '@/lib/secure-ip-detection';
import { AuditLogger, AuditSeverity } from '@/lib/audit/unified-audit-logger';
import { SOC2_AUDIT_EVENTS } from '@/types/audit-events';

export async function POST(request: NextRequest) {
  console.log('[WIDGET-CREATE-ACCOUNT] POST request received');

  // Set CORS headers for the response
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-TrustRails-Partner-ID',
  };

  try {
    // Extract bearer token from Authorization header
    const authHeader = request.headers.get('Authorization');
    console.log('[WIDGET-CREATE-ACCOUNT] Auth header:', authHeader ? 'present' : 'missing');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    const bearerToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify bearer token
    const tokenPayload = await verifyBearerToken(bearerToken);
    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Invalid or expired bearer token' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Get secure client IP with spoofing protection
    const ipAddress = getClientIP(request);
    const ipFingerprint = getIPFingerprint(request);

    // Parse request body
    const body = await request.json();
    const {
      auth_type,
      email,
      password,
      oauth_token,
      provider,
      profile,
      source_custodian_id,
      destination_custodian_id,
      transfer_amount
    } = body;

    if (!auth_type || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: auth_type and email' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Apply multi-layer rate limiting for user creation
    // Use both IP and fingerprint for better tracking
    const rateLimitResult = await multiRateLimiter.checkUserCreation(
      ipFingerprint, // Use fingerprint instead of raw IP
      tokenPayload.custodianId,
      email,
      tokenPayload.sessionId
    );

    if (!rateLimitResult.success) {
      // Log rate limit exceeded event
      await AuditLogger.logSecurityEvent(
        'widget_rate_limit_exceeded',
        AuditSeverity.WARNING,
        `Rate limit exceeded for ${rateLimitResult.failedCheck}`,
        tokenPayload.custodianId,
        request,
        {
          eventType: SOC2_AUDIT_EVENTS.WIDGET_AUTH_FAILURE,
          failedCheck: rateLimitResult.failedCheck,
          custodianId: tokenPayload.custodianId,
          email: email,
          ipAddress: ipAddress
        }
      );

      // Customize error message based on which limit was hit
      let errorMessage = 'Rate limit exceeded';
      if (rateLimitResult.failedCheck?.includes('email')) {
        errorMessage = 'Too many attempts for this email address';
      } else if (rateLimitResult.failedCheck?.includes('partner_user_creation')) {
        errorMessage = 'Daily user creation limit reached for partner';
      } else if (rateLimitResult.failedCheck?.includes('rapid_creation')) {
        errorMessage = 'User creation rate too high. Please slow down';
      }

      return NextResponse.json(
        {
          error: errorMessage,
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        },
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'X-RateLimit-Limit': rateLimitResult.failedCheck || 'multiple',
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString(),
            'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString()
          }
        }
      );
    }

    const { adminAuth, adminDb } = requireAdminApp();
    let userId: string;
    let isNewUser = false;

    if (auth_type === 'oauth') {
      // OAuth flow - create or get user from OAuth provider
      if (!oauth_token || !provider) {
        return NextResponse.json(
          { error: 'OAuth flow requires oauth_token and provider' },
          { status: 400, headers: corsHeaders }
        );
      }

      // Verify OAuth token with provider (simplified - in production, verify with actual provider)
      // For now, trust the provided profile data
      userId = await createOrGetRolloverUser(
        email,
        provider,
        profile || {},
        tokenPayload.custodianId
      );

    } else if (auth_type === 'email') {
      // Email/password flow
      if (!password) {
        return NextResponse.json(
          { error: 'Email flow requires password' },
          { status: 400, headers: corsHeaders }
        );
      }

      // Check if user exists
      let userRecord;
      try {
        userRecord = await adminAuth.getUserByEmail(email);
        userId = userRecord.uid;

        // Check if user document exists in Firestore
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
          // This is a new user to our system (even if they have an auth account)
          isNewUser = true;
          // Create missing Firestore document for existing auth user
          await adminDb.collection('users').doc(userId).set({
            uid: userId,
            email,
            name: email.split('@')[0],
            role: 'rollover_user',
            hostCustodianId: tokenPayload.custodianId,
            createdAt: new Date().toISOString(),
            status: 'active',
            authType: 'email'
          });
        }
      } catch (error) {
        // User doesn't exist, create new one
        isNewUser = true;
        userRecord = await adminAuth.createUser({
          email,
          password,
          emailVerified: false
        });
        userId = userRecord.uid;

        // Create Firestore document for new user
        await adminDb.collection('users').doc(userId).set({
          uid: userId,
          email,
          name: email.split('@')[0],
          role: 'rollover_user',
          custodianId: tokenPayload.custodianId, // Standard field for admin dashboard
          hostCustodianId: tokenPayload.custodianId, // Which partner created this user
          sourceCustodianId: source_custodian_id || null,
          destinationCustodianId: destination_custodian_id || tokenPayload.custodianId, // Default to host custodian
          transferAmount: transfer_amount || null,
          custodianSelectionContext: {
            sourceCustodianId: source_custodian_id || null,
            destinationCustodianId: destination_custodian_id || null,
            transferAmount: transfer_amount || null,
            selectedAt: source_custodian_id || destination_custodian_id ? new Date().toISOString() : null
          },
          createdAt: new Date().toISOString(),
          emailVerified: false,
          status: 'active',
          authType: 'email'
        });

        // Send verification email (in production)
        // await adminAuth.generateEmailVerificationLink(email);
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid auth_type. Must be "oauth" or "email"' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Update widget session with user ID
    await adminDb
      .collection('widget_sessions')
      .doc(tokenPayload.sessionId)
      .update({
        userId,
        authenticatedAt: new Date().toISOString()
      });

    // Get user data
    const userData = (await adminDb.collection('users').doc(userId).get()).data();

    // Create a custom token for the user (for Firebase Auth on client)
    const customToken = await adminAuth.createCustomToken(userId, {
      role: 'rollover_user',
      sessionId: tokenPayload.sessionId,
      custodianId: tokenPayload.custodianId
    });

    // Log account creation/login for audit
    if (isNewUser) {
      // Log new user creation
      await AuditLogger.logAdminAction(
        'widget_user_created',
        userId,
        { type: 'user', id: userId, name: email },
        request,
        {
          eventType: SOC2_AUDIT_EVENTS.WIDGET_USER_CREATED,
          custodianId: tokenPayload.custodianId,
          sessionId: tokenPayload.sessionId,
          authType: auth_type,
          userEmail: email,
          userId
        }
      );
    } else {
      // Log user login
      await AuditLogger.logAuthentication(
        'login',
        userId,
        email,
        request,
        {
          eventType: SOC2_AUDIT_EVENTS.WIDGET_USER_LOGIN,
          custodianId: tokenPayload.custodianId,
          sessionId: tokenPayload.sessionId,
          authType: auth_type,
          userId
        }
      );
    }

    // Log API call for tracking
    await AuditLogger.logDataAccess(
      'view',
      'widget_api',
      'create-account',
      userId,
      false,
      request
    );

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: userData?.email,
        name: userData?.name,
        role: userData?.role,
        email_verified: userData?.emailVerified || false,
        host_custodian_id: userData?.hostCustodianId,
        source_custodian_id: userData?.sourceCustodianId,
        destination_custodian_id: userData?.destinationCustodianId,
        transfer_amount: userData?.transferAmount,
        custodian_selection_context: userData?.custodianSelectionContext
      },
      custom_token: customToken,
      is_new_user: isNewUser,
      next_steps: isNewUser ?
        // New user flow - customize based on what they've already selected
        (source_custodian_id && destination_custodian_id ? [
          'verify_email',
          'complete_profile',
          'start_rollover'
        ] : source_custodian_id ? [
          'verify_email',
          'select_destination_custodian',
          'complete_profile'
        ] : [
          'verify_email',
          'select_source_custodian',
          'select_destination_custodian',
          'complete_profile'
        ]) :
        // Existing user flow
        (source_custodian_id && destination_custodian_id ? [
          'start_rollover'
        ] : source_custodian_id ? [
          'select_destination_custodian',
          'start_rollover'
        ] : [
          'select_source_custodian',
          'select_destination_custodian',
          'start_rollover'
        ])
    }, {
      status: isNewUser ? 201 : 200,
      headers: {
        ...corsHeaders,
        'X-RateLimit-Limit': 'multiple',
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString()
      }
    });

  } catch (error) {
    console.error('[WIDGET-CREATE-ACCOUNT] Error:', error);
    console.error('[WIDGET-CREATE-ACCOUNT] Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    // Ensure CORS headers are always returned, even on error
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-TrustRails-Partner-ID',
    };

    // Log system error (don't await in catch block to avoid blocking)
    AuditLogger.logSecurityEvent(
      'widget_account_creation_error',
      AuditSeverity.ERROR,
      error instanceof Error ? error.message : 'Unknown error in widget account creation',
      undefined,
      request,
      {
        eventType: SOC2_AUDIT_EVENTS.WIDGET_AUTH_FAILURE,
        error: error instanceof Error ? error.stack : String(error)
      }
    ).catch(err => console.error('[WIDGET-CREATE-ACCOUNT] Failed to log error:', err));

    return NextResponse.json(
      { error: 'Internal server error during account creation' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
  console.log('[WIDGET-CREATE-ACCOUNT] OPTIONS request received');
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-TrustRails-Partner-ID',
      'Access-Control-Max-Age': '86400',
    },
  });
}