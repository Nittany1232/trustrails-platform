/**
 * Retirement Plan Search API - Cloud Functions Gen 2
 * Fast search endpoint for widget to find 401(k) plans
 */

import { HttpFunction } from '@google-cloud/functions-framework';
import { requireAdminApp, GCP_CONFIG, getGCPClientConfig } from './lib/gcp-config';
import { BigQuery } from '@google-cloud/bigquery';

// Initialize services with explicit project ID and keyFilename
const { adminDb } = requireAdminApp();
const bigquery = new BigQuery({
  projectId: 'trustrails-faa3e',
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
});

// Cache for frequent searches (in-memory for Cloud Functions)
const searchCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Search retirement plans endpoint
 * GET /searchPlans?q=company&ein=12345&state=CA&limit=20
 */
export const searchPlans: HttpFunction = async (req, res) => {
  // CORS headers for widget
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).set(corsHeaders).send('');
  }

  try {
    // Extract search parameters
    const {
      q,        // General search query
      ein,      // Employer Identification Number
      state,    // State abbreviation
      city,     // City name
      type,     // Plan type (401k, 403b, etc)
      limit = '20',
      offset = '0',
      force_bigquery = 'false'  // Force BigQuery instead of Firestore cache
    } = req.query as Record<string, string>;

    // Validate inputs
    const searchLimit = Math.min(parseInt(limit) || 20, 100);
    const searchOffset = parseInt(offset) || 0;

    // Check if we need any search criteria
    if (!q && !ein && !state && !city) {
      return res.status(400).set(corsHeaders).json({
        error: 'At least one search parameter required (q, ein, state, or city)'
      });
    }

    // Create cache key
    const cacheKey = JSON.stringify({ q, ein, state, city, type, limit, offset });

    // Check memory cache first
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('✅ Returning cached search results');
      return res.set(corsHeaders).json(cached.data);
    }

    let results: any[] = [];
    let totalCount = 0;
    let searchMethod = '';
    const forceBigQuery = force_bigquery === 'true';

    // Choose search method based on force_bigquery flag
    if (forceBigQuery) {
      // Force BigQuery search (for testing)
      searchMethod = 'bigquery';
      const bigQueryResults = await searchBigQuery({ q, ein, state, city, type, limit: searchLimit, offset: searchOffset });
      results = bigQueryResults.results;
      totalCount = bigQueryResults.totalCount;
    } else if ((q || ein) && searchLimit <= 20) {
      // Try Firestore first for common searches (fastest)
      searchMethod = 'firestore';
      results = await searchFirestore({ q, ein, state, city, type, limit: searchLimit, offset: searchOffset });

      // Fall back to BigQuery if no results from Firestore
      if (results.length === 0) {
        searchMethod = 'bigquery';
        const bigQueryResults = await searchBigQuery({ q, ein, state, city, type, limit: searchLimit, offset: searchOffset });
        results = bigQueryResults.results;
        totalCount = bigQueryResults.totalCount;
      }
    } else {
      // Use BigQuery for complex or large queries
      searchMethod = 'bigquery';
      const bigQueryResults = await searchBigQuery({ q, ein, state, city, type, limit: searchLimit, offset: searchOffset });
      results = bigQueryResults.results;
      totalCount = bigQueryResults.totalCount;
    }

    // Format response
    const response = {
      success: true,
      results: results.map(formatPlanResult),
      pagination: {
        limit: searchLimit,
        offset: searchOffset,
        total: totalCount || results.length,
        hasMore: results.length === searchLimit
      },
      metadata: {
        searchMethod,
        cached: false,
        processingTime: `${Date.now() - Date.now()}ms`
      }
    };

    // Cache the response
    searchCache.set(cacheKey, { data: response, timestamp: Date.now() });

    // Clean old cache entries if getting too large
    if (searchCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of searchCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          searchCache.delete(key);
        }
      }
    }

    return res.set(corsHeaders).json(response);

  } catch (error: any) {
    console.error('Search error:', error);
    return res.status(500).set(corsHeaders).json({
      error: 'Search failed',
      message: error.message
    });
  }
};

/**
 * Search Firestore cache (fast, limited dataset)
 */
async function searchFirestore(params: any): Promise<any[]> {
  const { q, ein, state, city, type, limit, offset } = params;

  const collection = adminDb.collection(GCP_CONFIG.collections.retirement_plans);
  let query: any = collection;
  let needsParticipantFilter = false;

  // For text/fuzzy search, we can't combine participants filter with sponsorName range
  // due to Firestore's multiple inequality limitation
  const isFuzzySearch = q && q.length > 2 && !ein && !state && !type;

  if (!isFuzzySearch) {
    // Only add participants filter if not doing fuzzy search
    query = query.where('participants', '>', 0);
  } else {
    // Will filter participants in code after query
    needsParticipantFilter = true;
  }

  // Build query based on parameters
  if (ein) {
    // Direct EIN lookup (fastest)
    const einDoc = await collection.doc(`${ein}_001`).get();
    if (einDoc.exists) {
      const data = einDoc.data();
      // Check for zero values
      if (data && data.participants > 0) {
        return [data];
      }
    }
    // Try variations
    query = query.where('ein', '==', ein);
  }

  if (state) {
    query = query.where('sponsorState', '==', state.toUpperCase());
  }

  if (type) {
    query = query.where('planType', '==', mapPlanTypeQuery(type));
  }

  // For text search, try multiple approaches
  if (q && q.length > 2) {
    const searchTerm = q.toLowerCase().trim();

    // If we have other filters (state, type), try token search
    if (!isFuzzySearch) {
      try {
        const tokenQuery = query.where('searchTokens', 'array-contains', searchTerm);
        const tokenResults = await tokenQuery.orderBy('searchRank', 'desc').limit(limit).get();

        if (!tokenResults.empty) {
          return tokenResults.docs.map((doc: any) => doc.data());
        }
      } catch (e) {
        console.log('Token search failed:', e);
      }
    }

    // For pure text search (no other filters), use fuzzy search
    if (isFuzzySearch) {
      const fuzzyStart = searchTerm.toUpperCase();
      const fuzzyEnd = searchTerm.toUpperCase() + '\uf8ff';

      // Reset query for fuzzy search (can't combine with participants filter)
      query = collection
        .where('sponsorName', '>=', fuzzyStart)
        .where('sponsorName', '<=', fuzzyEnd)
        .orderBy('sponsorName')  // Must order by sponsorName first when using range query
        .orderBy('searchRank', 'desc')
        .limit(needsParticipantFilter ? limit * 2 : limit);
    }
  }

  // Apply pagination (but not for fuzzy search - already handled above)
  if (!isFuzzySearch) {
    query = query.orderBy('searchRank', 'desc').limit(needsParticipantFilter ? limit * 2 : limit);
  }

  if (offset > 0) {
    // Note: Firestore doesn't have true offset, this is inefficient for large offsets
    // Build a separate query for skipping documents
    let skipQuery = isFuzzySearch ? query.limit(offset) : query.limit(offset);
    const skipDocs = await skipQuery.get();
    if (!skipDocs.empty) {
      const lastDoc = skipDocs.docs[skipDocs.docs.length - 1];
      query = query.startAfter(lastDoc);
    }
  }

  const snapshot = await query.get();
  let results = snapshot.docs.map((doc: any) => doc.data());

  // Apply participant filter in code if needed
  if (needsParticipantFilter) {
    results = results.filter((plan: any) => plan.participants > 0);
    // Trim to requested limit after filtering
    results = results.slice(0, limit);
  }

  return results;
}

/**
 * Search BigQuery (comprehensive, slower)
 */
async function searchBigQuery(params: any): Promise<{ results: any[]; totalCount: number }> {
  const { q, ein, state, city, type, limit, offset } = params;

  // Build SQL query
  let whereConditions: string[] = [];
  const queryParams: any[] = [];

  // Always exclude plans with zero participants (assets data not available)
  whereConditions.push('ps.participants > 0');

  if (ein) {
    whereConditions.push('CAST(ps.ein_plan_sponsor AS STRING) = ?');
    queryParams.push(ein);
  }

  if (state) {
    whereConditions.push('UPPER(ps.sponsor_state) = UPPER(?)');
    queryParams.push(state);
  }

  if (city) {
    whereConditions.push('UPPER(ps.sponsor_city) LIKE UPPER(?)');
    queryParams.push(`%${city}%`);
  }

  if (type) {
    whereConditions.push('ps.plan_type = ?');
    queryParams.push(mapPlanTypeQuery(type));
  }

  if (q && q.length > 2) {
    // Fuzzy search on multiple fields - support partial matches
    const searchTerm = q.trim();

    // Create variations for fuzzy matching
    whereConditions.push(`(
      UPPER(ps.plan_name) LIKE UPPER(?) OR
      UPPER(ps.sponsor_name) LIKE UPPER(?)
    )`);

    // Add different search patterns for fuzzy matching
    queryParams.push(
      `%${searchTerm}%`,  // Contains anywhere in plan name
      `%${searchTerm}%`   // Contains anywhere in sponsor name
    );
  }

  const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

  // Count query using unified dataset
  const countQuery = `
    SELECT COUNT(*) as total
    FROM \`trustrails-faa3e.dol_data.plan_sponsors\` ps
    ${whereClause}
  `;

  // Data query using our unified dataset with JOINs
  const dataQuery = `
    WITH priority_providers AS (
      SELECT
        cc.ack_id,
        cc.provider_other_name as provider_name,
        CAST(cc.provider_other_ein AS STRING) as provider_ein,
        cc.provider_other_relation as relation,
        -- Priority ranking based on provider type
        CASE
          WHEN UPPER(cc.provider_other_relation) LIKE '%RECORDKEEP%' THEN 1
          WHEN UPPER(cc.provider_other_relation) LIKE '%RECORD KEEP%' THEN 1
          WHEN UPPER(cc.provider_other_relation) IN ('ADMIN', 'ADMINISTRATOR') THEN 2
          WHEN UPPER(cc.provider_other_relation) IN ('TRUSTEE', 'CUSTODIAN') THEN 3
          WHEN UPPER(cc.provider_other_relation) LIKE '%INVESTMENT%' THEN 4
          WHEN UPPER(cc.provider_other_relation) = 'CONTRACT ADMINISTRATOR' THEN 5
          ELSE 6
        END as priority_rank,
        -- Row number to get top provider per plan
        ROW_NUMBER() OVER (
          PARTITION BY cc.ack_id
          ORDER BY
            CASE
              WHEN UPPER(cc.provider_other_relation) LIKE '%RECORDKEEP%' THEN 1
              WHEN UPPER(cc.provider_other_relation) LIKE '%RECORD KEEP%' THEN 1
              WHEN UPPER(cc.provider_other_relation) IN ('ADMIN', 'ADMINISTRATOR') THEN 2
              WHEN UPPER(cc.provider_other_relation) IN ('TRUSTEE', 'CUSTODIAN') THEN 3
              WHEN UPPER(cc.provider_other_relation) LIKE '%INVESTMENT%' THEN 4
              WHEN UPPER(cc.provider_other_relation) = 'CONTRACT ADMINISTRATOR' THEN 5
              ELSE 6
            END
        ) as provider_rank
      FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\` cc
      WHERE cc.provider_other_relation IS NOT NULL
    ),
    primary_contacts AS (
      SELECT * FROM priority_providers WHERE provider_rank = 1
    )
    SELECT
      ps.ein_plan_sponsor as ein,
      ps.plan_number as planNumber,
      ps.plan_name as planName,
      ps.sponsor_name as sponsorName,
      ps.sponsor_city as sponsorCity,
      ps.sponsor_state as sponsorState,
      ps.sponsor_zip as sponsorZip,
      ps.plan_type as planType,
      ps.participants,
      ps.total_assets as totalAssets,
      ps.form_tax_year as formYear,
      1 as searchRank,
      ps.ack_id as ACK_ID,
      -- Primary contact from Schedule C (priority-based)
      pc.provider_name as primaryContactName,
      CAST(pc.provider_ein AS STRING) as primaryContactEin,
      pc.relation as primaryContactRelation,
      pc.priority_rank as contactConfidence,
      -- Contact determination logic
      CASE
        WHEN pc.provider_name IS NOT NULL THEN 'schedule_c'
        ELSE 'none'
      END as contactSource
    FROM \`trustrails-faa3e.dol_data.plan_sponsors\` ps
    LEFT JOIN primary_contacts pc ON ps.ack_id = pc.ack_id
    ${whereClause}
    ORDER BY ps.participants DESC, ps.total_assets DESC
    LIMIT ? OFFSET ?
  `;

  queryParams.push(limit, offset);

  // Execute queries
  const [[countResult]] = await bigquery.query({
    query: countQuery,
    params: queryParams.slice(0, -2), // Exclude limit/offset for count
    location: GCP_CONFIG.region
  });

  const [dataResults] = await bigquery.query({
    query: dataQuery,
    params: queryParams,
    location: GCP_CONFIG.region
  });

  return {
    results: dataResults,
    totalCount: countResult.total
  };
}

/**
 * Format plan result for API response
 */
function formatPlanResult(plan: any) {
  // Determine primary contact with confidence level
  let primaryContact = null;
  let contactConfidence = 'low';
  let contactGuidance = '';

  if (plan.primaryContactName) {
    // Have Schedule C data with priority-based selection
    primaryContact = {
      name: plan.primaryContactName,
      ein: plan.primaryContactEin,
      relation: plan.primaryContactRelation,
      source: 'schedule_c'
    };

    // Set confidence based on priority rank
    if (plan.contactConfidence === 1) {
      contactConfidence = 'high';
      contactGuidance = 'This is your plan recordkeeper - contact them for account access and rollovers';
    } else if (plan.contactConfidence <= 3) {
      contactConfidence = 'medium';
      contactGuidance = 'Contact this provider for plan information. Ask for the recordkeeper if needed.';
    } else {
      contactConfidence = 'low';
      contactGuidance = 'This provider works with your plan. Ask them to connect you with the recordkeeper.';
    }
  } else if (plan.adminName) {
    // Fallback to Form 5500 administrator
    primaryContact = {
      name: plan.adminName,
      ein: plan.adminEin,
      relation: 'PLAN ADMINISTRATOR',
      source: 'form_5500'
    };
    contactConfidence = 'medium';
    contactGuidance = 'This is the plan administrator. They are legally required to assist with your request.';
  }

  return {
    ein: plan.ein,
    planNumber: plan.planNumber,
    planName: plan.planName || 'Retirement Plan',
    company: {
      name: plan.sponsorName,
      city: plan.sponsorCity,
      state: plan.sponsorState,
      zip: plan.sponsorZip
    },
    planDetails: {
      type: plan.planType,
      participants: plan.participants,
      assets: plan.totalAssets,
      assetFormatted: formatCurrency(plan.totalAssets)
    },
    primaryContact: primaryContact,
    contactConfidence: contactConfidence,
    contactGuidance: contactGuidance,
    metadata: {
      lastUpdated: plan.lastUpdated || plan.formYear,
      searchRank: plan.searchRank,
      ackId: plan.ACK_ID
    }
  };
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number): string {
  if (!amount) return '$0';

  if (amount >= 1000000000) {
    return `$${(amount / 1000000000).toFixed(1)}B`;
  } else if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }

  return `$${amount.toFixed(0)}`;
}

/**
 * Map user-friendly plan type to database values
 */
function mapPlanTypeQuery(userType: string): string {
  const typeMap: Record<string, string> = {
    '401k': '401(k)',
    '403b': '403(b)',
    'pension': 'Defined Benefit',
    'profit-sharing': 'Profit Sharing',
    'esop': 'ESOP',
    'sep': 'SEP',
    'simple': 'SIMPLE IRA'
  };

  return typeMap[userType.toLowerCase()] || userType;
}