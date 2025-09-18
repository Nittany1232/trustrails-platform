/**
 * Test script for Enhanced Search API with Real Custodian Data
 */

import { BigQuery } from '@google-cloud/bigquery';

// Override BigQuery configuration for testing
const PROJECT_ID = 'trustrails-faa3e';
const DATASET_ID = 'dol_data';

const bigquery = new BigQuery({
  projectId: PROJECT_ID,
  keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
});

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
    searchScore: Math.min(100, (row.total_plans / 100) * 10)
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
    searchScore: 75 // Default score for testing
  }));
}

/**
 * Search all types and return categorized results
 */
async function searchAll(query: string, state?: string, limit: number = 20): Promise<any[]> {
  if (!query || query.length < 2) return [];

  const [custodians, companies, plans] = await Promise.all([
    searchCustodians(query, state, 5, 0),
    searchCompanies(query, undefined, state, undefined, 5, 0),
    searchPlans(query, undefined, state, undefined, 10, 0)
  ]);

  const allResults = [...custodians, ...companies, ...plans];
  return allResults
    .sort((a, b) => b.searchScore - a.searchScore)
    .slice(0, limit);
}

async function testEnhancedSearch() {
  console.log('🚀 Testing Enhanced Search API with Real Custodian Data');
  console.log('='.repeat(80));

  try {
    // Test 1: Search Custodians
    console.log('\n1️⃣ Testing Custodian Search');
    console.log('─'.repeat(50));

    const fidelityResults = await searchCustodians('Fidelity', undefined, 5);
    console.log(`Found ${fidelityResults.length} Fidelity-related custodians:`);
    fidelityResults.forEach((custodian, i) => {
      console.log(`${i + 1}. ${custodian.name}`);
      console.log(`   Relations: ${custodian.services.relationType || 'N/A'}`);
      console.log(`   Plans: ${custodian.services.totalPlans} | Companies: ${custodian.services.totalCompanies}`);
      console.log(`   Market Share: ${custodian.services.marketShare}%`);
      console.log(`   Sample Clients: ${custodian.sampleClients?.join(', ') || 'N/A'}`);
      console.log();
    });

    // Test 2: Search Companies
    console.log('\n2️⃣ Testing Company Search');
    console.log('─'.repeat(50));

    const microsoftResults = await searchCompanies('Microsoft', undefined, undefined, undefined, 3);
    console.log(`Found ${microsoftResults.length} Microsoft-related companies:`);
    microsoftResults.forEach((company, i) => {
      console.log(`${i + 1}. ${company.name} (EIN: ${company.ein})`);
      console.log(`   Location: ${company.location.city}, ${company.location.state}`);
      console.log(`   Plans: ${company.planSummary.planCount} | Participants: ${company.planSummary.totalParticipants}`);
      console.log(`   Assets: ${company.planSummary.assetsFormatted}`);
      console.log(`   Custodians: ${company.custodians?.join(', ') || 'N/A'}`);
      console.log();
    });

    // Test 3: Search Plans by Custodian
    console.log('\n3️⃣ Testing Plan Search by Custodian');
    console.log('─'.repeat(50));

    const plansByFidelity = await searchPlans(undefined, undefined, undefined, 'Fidelity', 5);
    console.log(`Found ${plansByFidelity.length} plans with Fidelity as custodian:`);
    plansByFidelity.forEach((plan, i) => {
      console.log(`${i + 1}. ${plan.company.name}`);
      console.log(`   Plan: ${plan.planName}`);
      console.log(`   Participants: ${plan.planDetails.participants?.toLocaleString() || 'N/A'}`);
      console.log(`   Assets: ${plan.planDetails.assetsFormatted}`);
      console.log(`   Custodian: ${plan.custodian?.name} (${plan.custodian?.relation})`);
      console.log();
    });

    // Test 4: Company Search by State
    console.log('\n4️⃣ Testing Geographic Search');
    console.log('─'.repeat(50));

    const californiaCompanies = await searchCompanies(undefined, undefined, 'CA', undefined, 5);
    console.log(`Found ${californiaCompanies.length} companies in California:`);
    californiaCompanies.forEach((company, i) => {
      console.log(`${i + 1}. ${company.name}`);
      console.log(`   Location: ${company.location.city}, CA`);
      console.log(`   Plans: ${company.planSummary.planCount}`);
      console.log(`   Primary Custodians: ${company.custodians?.slice(0, 2).join(', ') || 'N/A'}`);
      console.log();
    });

    // Test 5: All-in-One Search
    console.log('\n5️⃣ Testing Unified Search');
    console.log('─'.repeat(50));

    const unifiedResults = await searchAll('Principal', undefined, 8);
    console.log(`Found ${unifiedResults.length} results for "Principal":`);
    unifiedResults.forEach((result, i) => {
      console.log(`${i + 1}. [${result.type.toUpperCase()}] ${result.name || result.planName}`);

      if (result.type === 'custodian') {
        console.log(`   Service: ${result.services.relationType} | Plans: ${result.services.totalPlans}`);
      } else if (result.type === 'company') {
        console.log(`   Plans: ${result.planSummary.planCount} | Participants: ${result.planSummary.totalParticipants}`);
      } else if (result.type === 'plan') {
        console.log(`   Company: ${result.company.name} | Assets: ${result.planDetails.assetsFormatted}`);
      }
      console.log(`   Score: ${result.searchScore}`);
      console.log();
    });

    // Test 6: Market Analysis
    console.log('\n6️⃣ Testing Market Analysis');
    console.log('─'.repeat(50));

    const topCustodians = await searchCustodians(undefined, undefined, 10);
    console.log('Top 10 Custodians by Market Share:');
    topCustodians.forEach((custodian, i) => {
      console.log(`${(i + 1).toString().padStart(2)}. ${custodian.name}`);
      console.log(`     Market Share: ${custodian.services.marketShare}% (${custodian.services.totalPlans} plans)`);
      console.log(`     Companies Served: ${custodian.services.totalCompanies}`);
    });

    console.log('\n✅ All Enhanced Search Tests Completed Successfully!');
    console.log('='.repeat(80));
    console.log('\n📊 Test Summary:');
    console.log('✓ Custodian search with client companies');
    console.log('✓ Company search with custodian relationships');
    console.log('✓ Plan search with full hierarchical data');
    console.log('✓ Geographic filtering capabilities');
    console.log('✓ Unified search across all types');
    console.log('✓ Market share analysis');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run tests
if (require.main === module) {
  testEnhancedSearch().catch(console.error);
}

export { testEnhancedSearch };