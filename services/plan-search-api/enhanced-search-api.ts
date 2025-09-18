/**
 * Enhanced Retirement Plan Search API with Real Custodian Data
 * Provides hierarchical search: Companies → Plans → Custodians
 */

import { HttpFunction } from '@google-cloud/functions-framework';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';
const DATASET_ID = 'dol_data';

// Initialize BigQuery
const bigquery = new BigQuery({ projectId: PROJECT_ID });

// Cache for frequent searches
const searchCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Enhanced search endpoint with real custodian data
 * GET /searchPlans?q=company&type=custodian&limit=20
 */
export const enhancedSearchPlans: HttpFunction = async (req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };

  if (req.method === 'OPTIONS') {
    return res.status(204).set(corsHeaders).send('');
  }

  try {
    const {
      q,                    // Search query
      type = 'plans',       // Search type: 'plans', 'custodians', 'companies', 'all'
      ein,                  // Company EIN filter
      state,                // State filter
      custodian,            // Filter by specific custodian
      limit = '20',
      offset = '0'
    } = req.query as Record<string, string>;

    const searchLimit = Math.min(parseInt(limit) || 20, 100);
    const searchOffset = parseInt(offset) || 0;

    if (!q && !ein && !state && !custodian) {
      return res.status(400).set(corsHeaders).json({
        error: 'At least one search parameter required (q, ein, state, or custodian)'
      });
    }

    const cacheKey = JSON.stringify({ q, type, ein, state, custodian, limit, offset });
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.set(corsHeaders).json(cached.data);
    }

    let results: any[] = [];
    let searchMethod = '';

    // Route to appropriate search method
    switch (type) {
      case 'custodians':
        results = await searchCustodians(q, state, searchLimit, searchOffset);
        searchMethod = 'custodians';
        break;
      case 'companies':
        results = await searchCompanies(q, ein, state, custodian, searchLimit, searchOffset);
        searchMethod = 'companies';
        break;
      case 'plans':
        results = await searchPlans(q, ein, state, custodian, searchLimit, searchOffset);
        searchMethod = 'plans';
        break;
      case 'all':
        results = await searchAll(q, state, searchLimit);
        searchMethod = 'all';
        break;
      default:
        results = await searchPlans(q, ein, state, custodian, searchLimit, searchOffset);
        searchMethod = 'plans';
    }

    const response = {
      success: true,
      results,
      searchType: type,
      pagination: {
        limit: searchLimit,
        offset: searchOffset,
        hasMore: results.length === searchLimit
      },
      metadata: {
        searchMethod,
        cached: false,
        count: results.length
      }
    };

    searchCache.set(cacheKey, { data: response, timestamp: Date.now() });
    return res.set(corsHeaders).json(response);

  } catch (error: any) {
    console.error('Enhanced search error:', error);
    return res.status(500).set(corsHeaders).json({
      error: 'Search failed',
      message: error.message
    });
  }
};

/**
 * Search custodians with their client companies
 */
async function searchCustodians(query?: string, state?: string, limit: number = 20, offset: number = 0): Promise<any[]> {
  let whereConditions: string[] = ['sc.provider_other_name IS NOT NULL'];
  const queryParams: any[] = [];

  if (query && query.length > 2) {
    whereConditions.push('UPPER(sc.provider_other_name) LIKE UPPER(?)');
    queryParams.push(`%${query}%`);
  }

  if (state) {
    whereConditions.push('sc.provider_other_us_state = ?');
    queryParams.push(state.toUpperCase());
  }

  const sqlQuery = `
    SELECT
      sc.provider_other_name as custodian_name,
      sc.provider_other_ein as custodian_ein,
      sc.provider_other_us_city as custodian_city,
      sc.provider_other_us_state as custodian_state,
      sc.provider_other_relation as relation_type,
      COUNT(DISTINCT ps.ack_id) as total_plans,
      COUNT(DISTINCT ps.sponsor_name) as total_companies,
      ARRAY_AGG(DISTINCT ps.sponsor_name IGNORE NULLS LIMIT 5) as sample_companies,
      ROUND(COUNT(DISTINCT ps.ack_id) * 100.0 / (
        SELECT COUNT(DISTINCT ack_id)
        FROM \`${PROJECT_ID}.${DATASET_ID}.plan_sponsors\`
      ), 2) as market_share
    FROM \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\` sc
    LEFT JOIN \`${PROJECT_ID}.${DATASET_ID}.plan_sponsors\` ps
      ON sc.ack_id = ps.ack_id
    WHERE ${whereConditions.join(' AND ')}
    GROUP BY
      sc.provider_other_name,
      sc.provider_other_ein,
      sc.provider_other_us_city,
      sc.provider_other_us_state,
      sc.provider_other_relation
    ORDER BY total_plans DESC
    LIMIT ? OFFSET ?
  `;

  queryParams.push(limit, offset);

  const [results] = await bigquery.query({
    query: sqlQuery,
    params: queryParams,
    location: 'US'
  });

  return results.map((row: any) => ({
    type: 'custodian',
    id: row.custodian_ein || row.custodian_name.replace(/[^a-zA-Z0-9]/g, ''),
    name: row.custodian_name,
    ein: row.custodian_ein,
    location: {
      city: row.custodian_city,
      state: row.custodian_state
    },
    services: {
      relationType: row.relation_type,
      totalPlans: row.total_plans,
      totalCompanies: row.total_companies,
      marketShare: row.market_share
    },
    sampleClients: row.sample_companies,
    searchScore: Math.min(100, (row.total_plans / 100) * 10) // Scale for relevance
  }));
}

/**
 * Search companies with their plans and custodians
 */
async function searchCompanies(query?: string, ein?: string, state?: string, custodian?: string, limit: number = 20, offset: number = 0): Promise<any[]> {
  let whereConditions: string[] = ['ps.sponsor_name IS NOT NULL'];
  const queryParams: any[] = [];

  if (query && query.length > 2) {
    whereConditions.push('UPPER(ps.sponsor_name) LIKE UPPER(?)');
    queryParams.push(`%${query}%`);
  }

  if (ein) {
    whereConditions.push('ps.ein_plan_sponsor = ?');
    queryParams.push(ein);
  }

  if (state) {
    whereConditions.push('ps.sponsor_state = ?');
    queryParams.push(state.toUpperCase());
  }

  if (custodian) {
    whereConditions.push('UPPER(sc.provider_other_name) LIKE UPPER(?)');
    queryParams.push(`%${custodian}%`);
  }

  const sqlQuery = `
    SELECT
      ps.sponsor_name,
      ps.ein_plan_sponsor,
      ps.sponsor_city,
      ps.sponsor_state,
      COUNT(DISTINCT ps.plan_name) as plan_count,
      SUM(CASE WHEN ps.participants IS NOT NULL THEN ps.participants ELSE 0 END) as total_participants,
      SUM(CASE WHEN ps.total_assets IS NOT NULL THEN ps.total_assets ELSE 0 END) as total_assets,
      ARRAY_AGG(DISTINCT ps.plan_name IGNORE NULLS LIMIT 3) as sample_plans,
      ARRAY_AGG(DISTINCT sc.provider_other_name IGNORE NULLS) as custodians,
      STRING_AGG(DISTINCT sc.provider_other_relation, ', ') as custodian_relations
    FROM \`${PROJECT_ID}.${DATASET_ID}.plan_sponsors\` ps
    LEFT JOIN \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\` sc
      ON ps.ack_id = sc.ack_id
    WHERE ${whereConditions.join(' AND ')}
    GROUP BY
      ps.sponsor_name,
      ps.ein_plan_sponsor,
      ps.sponsor_city,
      ps.sponsor_state
    ORDER BY plan_count DESC, total_participants DESC
    LIMIT ? OFFSET ?
  `;

  queryParams.push(limit, offset);

  const [results] = await bigquery.query({
    query: sqlQuery,
    params: queryParams,
    location: 'US'
  });

  return results.map((row: any) => ({
    type: 'company',
    id: row.ein_plan_sponsor || row.sponsor_name.replace(/[^a-zA-Z0-9]/g, ''),
    name: row.sponsor_name,
    ein: row.ein_plan_sponsor,
    location: {
      city: row.sponsor_city,
      state: row.sponsor_state
    },
    planSummary: {
      planCount: row.plan_count,
      totalParticipants: row.total_participants,
      totalAssets: row.total_assets,
      assetsFormatted: formatCurrency(row.total_assets)
    },
    samplePlans: row.sample_plans,
    custodians: row.custodians,
    custodianRelations: row.custodian_relations,
    searchScore: Math.min(100, row.plan_count * 10 + (row.total_participants / 1000))
  }));
}

/**
 * Search individual plans with company and custodian details
 */
async function searchPlans(query?: string, ein?: string, state?: string, custodian?: string, limit: number = 20, offset: number = 0): Promise<any[]> {
  let whereConditions: string[] = ['ps.plan_name IS NOT NULL'];
  const queryParams: any[] = [];

  if (query && query.length > 2) {
    whereConditions.push(`(
      UPPER(ps.plan_name) LIKE UPPER(?) OR
      UPPER(ps.sponsor_name) LIKE UPPER(?)
    )`);
    queryParams.push(`%${query}%`, `%${query}%`);
  }

  if (ein) {
    whereConditions.push('ps.ein_plan_sponsor = ?');
    queryParams.push(ein);
  }

  if (state) {
    whereConditions.push('ps.sponsor_state = ?');
    queryParams.push(state.toUpperCase());
  }

  if (custodian) {
    whereConditions.push('UPPER(sc.provider_other_name) LIKE UPPER(?)');
    queryParams.push(`%${custodian}%`);
  }

  const sqlQuery = `
    SELECT
      ps.ack_id,
      ps.plan_name,
      ps.sponsor_name,
      ps.ein_plan_sponsor,
      ps.plan_number,
      ps.sponsor_city,
      ps.sponsor_state,
      ps.sponsor_zip,
      ps.plan_type,
      ps.participants,
      ps.total_assets,
      ps.form_tax_year,
      sc.provider_other_name as custodian_name,
      sc.provider_other_relation as custodian_relation,
      sc.provider_other_us_city as custodian_city,
      sc.provider_other_us_state as custodian_state
    FROM \`${PROJECT_ID}.${DATASET_ID}.plan_sponsors\` ps
    LEFT JOIN \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\` sc
      ON ps.ack_id = sc.ack_id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY ps.total_assets DESC, ps.participants DESC
    LIMIT ? OFFSET ?
  `;

  queryParams.push(limit, offset);

  const [results] = await bigquery.query({
    query: sqlQuery,
    params: queryParams,
    location: 'US'
  });

  return results.map((row: any) => ({
    type: 'plan',
    id: row.ack_id,
    planName: row.plan_name,
    planNumber: row.plan_number,
    planType: row.plan_type,
    company: {
      name: row.sponsor_name,
      ein: row.ein_plan_sponsor,
      city: row.sponsor_city,
      state: row.sponsor_state,
      zip: row.sponsor_zip
    },
    planDetails: {
      participants: row.participants,
      assets: row.total_assets,
      assetsFormatted: formatCurrency(row.total_assets),
      lastUpdated: row.form_tax_year
    },
    custodian: row.custodian_name ? {
      name: row.custodian_name,
      relation: row.custodian_relation,
      location: {
        city: row.custodian_city,
        state: row.custodian_state
      }
    } : null,
    searchScore: calculatePlanScore(row)
  }));
}

/**
 * Search all types and return categorized results
 */
async function searchAll(query: string, state?: string, limit: number = 20): Promise<any[]> {
  if (!query || query.length < 2) return [];

  // Get top results from each category
  const [custodians, companies, plans] = await Promise.all([
    searchCustodians(query, state, 5, 0),
    searchCompanies(query, undefined, state, undefined, 5, 0),
    searchPlans(query, undefined, state, undefined, 10, 0)
  ]);

  // Combine and sort by relevance
  const allResults = [...custodians, ...companies, ...plans];
  return allResults
    .sort((a, b) => b.searchScore - a.searchScore)
    .slice(0, limit);
}

/**
 * Calculate search relevance score for plans
 */
function calculatePlanScore(plan: any): number {
  let score = 50; // Base score

  // Asset size scoring
  if (plan.total_assets) {
    if (plan.total_assets > 1000000000) score += 30; // $1B+
    else if (plan.total_assets > 100000000) score += 20; // $100M+
    else if (plan.total_assets > 10000000) score += 10; // $10M+
  }

  // Participant count scoring
  if (plan.participants) {
    if (plan.participants > 10000) score += 20;
    else if (plan.participants > 1000) score += 15;
    else if (plan.participants > 100) score += 10;
  }

  // Recent data scoring
  if (plan.form_tax_year >= 2023) score += 10;

  // Has custodian data
  if (plan.custodian_name) score += 5;

  return Math.min(100, score);
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

// Export for testing
export {
  searchCustodians,
  searchCompanies,
  searchPlans,
  searchAll
};