/**
 * Retirement Plan Search API - Cloud Functions Gen 2
 * Fast search endpoint for widget to find 401(k) plans
 */

import { HttpFunction } from '@google-cloud/functions-framework';
import { requireAdminApp, GCP_CONFIG, getGCPClientConfig } from '../../lib/gcp-config';
import { BigQuery } from '@google-cloud/bigquery';

// Initialize services
const { adminDb } = requireAdminApp();
const bigquery = new BigQuery(getGCPClientConfig());

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
    const forceBigQuery = force_bigquery === 'true';

    // Check if we need any search criteria
    if (!q && !ein && !state && !city) {
      return res.status(400).set(corsHeaders).json({
        error: 'At least one search parameter required (q, ein, state, or city)'
      });
    }

    // Create cache key
    const cacheKey = JSON.stringify({ q, ein, state, city, type, limit, offset, force_bigquery });

    // Check memory cache first
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('✅ Returning cached search results');
      return res.set(corsHeaders).json(cached.data);
    }

    let results: any[] = [];
    let totalCount = 0;
    let searchMethod = '';

    // Choose search method based on force_bigquery flag
    if (forceBigQuery) {
      // Force BigQuery for custodian searches and comprehensive results
      searchMethod = 'bigquery';
      const bigQueryResults = await searchBigQuery({ q, ein, state, city, type, limit: searchLimit, offset: searchOffset });
      results = bigQueryResults.results;
      totalCount = bigQueryResults.totalCount;
    } else {
      // Try Firestore first for common searches (fastest)
      if ((q || ein) && searchLimit <= 20) {
        searchMethod = 'firestore';
        results = await searchFirestore({ q, ein, state, city, type, limit: searchLimit, offset: searchOffset });
      }

      // Fall back to BigQuery for complex or large queries
      if (results.length === 0) {
        searchMethod = 'bigquery';
        const bigQueryResults = await searchBigQuery({ q, ein, state, city, type, limit: searchLimit, offset: searchOffset });
        results = bigQueryResults.results;
        totalCount = bigQueryResults.totalCount;
      }
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

  let query = adminDb.collection(GCP_CONFIG.collections.retirement_plans);

  // Build query based on parameters
  if (ein) {
    // Direct EIN lookup (fastest)
    const einDoc = await query.doc(`${ein}_001`).get();
    if (einDoc.exists) {
      return [einDoc.data()];
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

  // For text search, use array-contains on searchTokens
  if (q && q.length > 2) {
    const searchToken = q.toLowerCase().trim();
    query = query.where('searchTokens', 'array-contains', searchToken);
  }

  // Apply pagination
  query = query.orderBy('searchRank', 'desc').limit(limit);

  if (offset > 0) {
    // Note: Firestore doesn't have true offset, this is inefficient for large offsets
    // Better to use cursor-based pagination in production
    const skipDocs = await query.limit(offset).get();
    if (!skipDocs.empty) {
      const lastDoc = skipDocs.docs[skipDocs.docs.length - 1];
      query = query.startAfter(lastDoc);
    }
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data());
}

/**
 * Search BigQuery (comprehensive, slower)
 */
async function searchBigQuery(params: any): Promise<{ results: any[]; totalCount: number }> {
  const { q, ein, state, city, type, limit, offset } = params;

  // Check if searching for a custodian by searching the custodian table
  if (q && q.length > 2) {
    const custodianResults = await searchCustodians(q, state, limit);
    if (custodianResults.length > 0) {
      // Return custodian-focused results
      return {
        results: custodianResults,
        totalCount: custodianResults.length
      };
    }
  }

  // Build SQL query for retirement plans
  let whereConditions: string[] = [];
  const queryParams: any[] = [];

  if (ein) {
    whereConditions.push('ein = ?');
    queryParams.push(ein);
  }

  if (state) {
    whereConditions.push('UPPER(sponsorState) = UPPER(?)');
    queryParams.push(state);
  }

  if (city) {
    whereConditions.push('UPPER(sponsorCity) LIKE UPPER(?)');
    queryParams.push(`%${city}%`);
  }

  if (type) {
    whereConditions.push('planType = ?');
    queryParams.push(mapPlanTypeQuery(type));
  }

  if (q && q.length > 2) {
    // Full text search on multiple fields
    whereConditions.push(`(
      UPPER(planName) LIKE UPPER(?) OR
      UPPER(sponsorName) LIKE UPPER(?) OR
      ein = ?
    )`);
    queryParams.push(`%${q}%`, `%${q}%`, q);
  }

  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(' AND ')}`
    : 'WHERE totalAssets > 0'; // Default filter

  // Count query
  const countQuery = `
    SELECT COUNT(*) as total
    FROM \`${GCP_CONFIG.bigquery.datasets.retirement_plans}.form5500_latest\`
    ${whereClause}
  `;

  // Data query
  const dataQuery = `
    SELECT
      ein,
      planNumber,
      planName,
      sponsorName,
      sponsorCity,
      sponsorState,
      sponsorZip,
      planType,
      participants,
      totalAssets,
      formYear,
      searchRank
    FROM \`${GCP_CONFIG.bigquery.datasets.retirement_plans}.form5500_latest\`
    ${whereClause}
    ORDER BY searchRank DESC, totalAssets DESC
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
 * Search for custodians in BigQuery
 */
async function searchCustodians(query: string, state?: string, limit: number = 10): Promise<any[]> {
  try {
    let whereConditions: string[] = [];
    const queryParams: any[] = [];

    // Search by custodian name
    whereConditions.push('UPPER(provider_other_name) LIKE UPPER(?)');
    queryParams.push(`%${query}%`);

    if (state) {
      whereConditions.push('provider_other_us_state = ?');
      queryParams.push(state.toUpperCase());
    }

    const sqlQuery = `
      SELECT DISTINCT
        provider_other_name as custodianName,
        provider_other_ein as ein,
        provider_other_us_city as city,
        provider_other_us_state as state,
        COUNT(*) as planCount,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\`), 2) as marketShare
      FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\`
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY provider_other_name, provider_other_ein, provider_other_us_city, provider_other_us_state
      ORDER BY planCount DESC
      LIMIT ?
    `;

    queryParams.push(limit);

    const [results] = await bigquery.query({
      query: sqlQuery,
      params: queryParams,
      location: 'US'
    });

    // Format as plan-like results for consistency
    return results.map((custodian: any) => ({
      ein: custodian.ein || 'N/A',
      planNumber: '000',
      planName: `${custodian.custodianName} - Custodian/Administrator`,
      sponsorName: custodian.custodianName,
      sponsorCity: custodian.city,
      sponsorState: custodian.state,
      sponsorZip: '',
      planType: 'Custodian Services',
      participants: custodian.planCount,
      totalAssets: 0,
      formYear: 2024,
      searchRank: 100,
      isCustodian: true,
      marketShare: custodian.marketShare
    }));
  } catch (error) {
    console.error('Custodian search error:', error);
    return [];
  }
}

/**
 * Format plan result for API response
 */
function formatPlanResult(plan: any) {
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
    metadata: {
      lastUpdated: plan.lastUpdated || plan.formYear,
      searchRank: plan.searchRank
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