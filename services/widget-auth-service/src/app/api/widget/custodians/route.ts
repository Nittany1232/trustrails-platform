/**
 * Widget Custodian Browsing Endpoint
 * GET /api/widget/custodians
 *
 * Allows anonymous browsing of available custodians for 401k transfers
 * Returns public custodian information for widget display
 *
 * Extracted from main app for widget auth microservice
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/widget-auth-server';
import { requireAdminApp } from '@/lib/firebase-admin';
import { apiRateLimiter } from '@/lib/rate-limiter';
import { AuditLogger } from '@/lib/audit/unified-audit-logger';

export interface PublicCustodianInfo {
  id: string;
  name: string;
  type: 'custodian' | 'recordkeeper' | 'advisor-platform';
  logo_url?: string;
  website?: string;
  supports_401k_transfers: boolean;
  average_transfer_time_days?: number;
  requires_physical_forms: boolean;
  supports_electronic_signatures: boolean;
  description?: string;
  features?: string[];
}

export async function GET(request: NextRequest) {
  console.log('[WIDGET-CUSTODIANS] GET request received');

  // Set CORS headers for the response
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  try {
    // Extract bearer token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    const bearerToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify bearer token (this validates the partner but allows anonymous browsing)
    const tokenPayload = await verifyBearerToken(bearerToken);
    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Invalid or expired bearer token' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Apply rate limiting
    const ipAddress = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     '127.0.0.1';

    const rateLimitResult = await apiRateLimiter.check(`widget_custodians_${ipAddress}`);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        },
        { status: 429, headers: corsHeaders }
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const custodianType = url.searchParams.get('type'); // 'source' or 'destination' or null for all
    const search = url.searchParams.get('search'); // Search by name

    const { adminDb } = requireAdminApp();

    // Query custodians - only return verified/active ones for public browsing
    let custodiansQuery = adminDb
      .collection('custodians')
      .where('status', 'in', ['verified', 'active']);

    // Add type filter if specified
    if (custodianType === 'source') {
      // Filter for custodians that support 401k as source (most do)
      custodiansQuery = custodiansQuery.where('supports401kSource', '==', true);
    } else if (custodianType === 'destination') {
      // Filter for custodians that accept transfers as destination
      custodiansQuery = custodiansQuery.where('acceptsTransfers', '==', true);
    }

    const custodiansSnapshot = await custodiansQuery.get();
    let custodians: PublicCustodianInfo[] = [];

    for (const doc of custodiansSnapshot.docs) {
      const data = doc.data();

      // Apply search filter if provided
      if (search && !data.name?.toLowerCase().includes(search.toLowerCase())) {
        continue;
      }

      // Transform to public format
      const publicInfo: PublicCustodianInfo = {
        id: doc.id,
        name: data.name || 'Unknown Custodian',
        type: data.type || 'custodian',
        logo_url: data.logoUrl,
        website: data.website,
        supports_401k_transfers: data.supports401kTransfers !== false, // Default to true
        average_transfer_time_days: data.averageTransferTimeDays || 5,
        requires_physical_forms: data.requiresPhysicalForms || false,
        supports_electronic_signatures: data.supportsElectronicSignatures !== false, // Default to true
        description: data.publicDescription,
        features: data.publicFeatures || []
      };

      custodians.push(publicInfo);
    }

    // Sort by name for consistent ordering
    custodians.sort((a, b) => a.name.localeCompare(b.name));

    // Get the host custodian info (where the widget is embedded)
    const hostCustodianDoc = await adminDb
      .collection('custodians')
      .doc(tokenPayload.custodianId)
      .get();

    let hostCustodian: PublicCustodianInfo | null = null;
    if (hostCustodianDoc.exists) {
      const hostData = hostCustodianDoc.data();
      hostCustodian = {
        id: hostCustodianDoc.id,
        name: hostData?.name || 'Unknown Host',
        type: hostData?.type || 'custodian',
        logo_url: hostData?.logoUrl,
        website: hostData?.website,
        supports_401k_transfers: hostData?.supports401kTransfers !== false,
        average_transfer_time_days: hostData?.averageTransferTimeDays || 5,
        requires_physical_forms: hostData?.requiresPhysicalForms || false,
        supports_electronic_signatures: hostData?.supportsElectronicSignatures !== false,
        description: hostData?.publicDescription,
        features: hostData?.publicFeatures || []
      };
    }

    // Log API call for tracking (no PII in anonymous browsing)
    await AuditLogger.logDataAccess(
      'view',
      'widget_api',
      'custodians',
      null, // No user ID for anonymous browsing
      false,
      request,
      {
        custodianCount: custodians.length,
        searchTerm: search,
        filterType: custodianType,
        hostCustodianId: tokenPayload.custodianId
      }
    );

    return NextResponse.json({
      success: true,
      custodians,
      host_custodian: hostCustodian,
      total_count: custodians.length,
      filters_applied: {
        type: custodianType,
        search: search
      }
    }, {
      status: 200,
      headers: {
        ...corsHeaders,
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString(),
        'Cache-Control': 'public, max-age=300' // 5 minute cache
      }
    });

  } catch (error) {
    console.error('[WIDGET-CUSTODIANS] Error:', error);

    // Ensure CORS headers are always returned, even on error
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    return NextResponse.json(
      { error: 'Internal server error while fetching custodians' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
  console.log('[WIDGET-CUSTODIANS] OPTIONS request received');
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}