/**
 * Test custodian search functionality
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';

async function testCustodianSearch() {
  console.log('🔍 Testing Custodian Search');
  console.log('='.repeat(60));
  
  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  const testQueries = [
    'fidelity',
    'empower',
    'principal',
    'vanguard',
    'schwab'
  ];

  for (const query of testQueries) {
    console.log(`\n📊 Searching for: "${query}"`);
    
    try {
      const sqlQuery = `
        SELECT DISTINCT
          provider_other_name as custodianName,
          provider_other_ein as ein,
          provider_other_us_city as city,
          provider_other_us_state as state,
          COUNT(*) as planCount,
          ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\`), 2) as marketShare
        FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\`
        WHERE UPPER(provider_other_name) LIKE UPPER(@query)
        GROUP BY provider_other_name, provider_other_ein, provider_other_us_city, provider_other_us_state
        ORDER BY planCount DESC
        LIMIT 5
      `;

      const options = {
        query: sqlQuery,
        params: { query: `%${query}%` },
        location: 'US'
      };

      const [results] = await bigquery.query(options);

      if (results.length === 0) {
        console.log('  No results found');
      } else {
        console.log(`  Found ${results.length} custodian(s):`);
        results.forEach((custodian: any) => {
          console.log(`  - ${custodian.custodianName}`);
          console.log(`    Plans: ${custodian.planCount} (${custodian.marketShare}% market share)`);
          console.log(`    Location: ${custodian.city || 'N/A'}, ${custodian.state || 'N/A'}`);
          if (custodian.ein) console.log(`    EIN: ${custodian.ein}`);
        });
      }
    } catch (error: any) {
      console.error(`  Error: ${error.message}`);
    }
  }

  // Test the API endpoint format
  console.log('\n🌐 Testing API Response Format:');
  console.log('='.repeat(60));
  
  const apiTestQuery = 'fidelity';
  const sqlQuery = `
    SELECT DISTINCT
      provider_other_name as custodianName,
      provider_other_ein as ein,
      provider_other_us_city as city,
      provider_other_us_state as state,
      COUNT(*) as planCount,
      ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\`), 2) as marketShare
    FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\`
    WHERE UPPER(provider_other_name) LIKE UPPER(@query)
    GROUP BY provider_other_name, provider_other_ein, provider_other_us_city, provider_other_us_state
    ORDER BY planCount DESC
    LIMIT 10
  `;

  const [results] = await bigquery.query({
    query: sqlQuery,
    params: { query: `%${apiTestQuery}%` },
    location: 'US'
  });

  // Format as API response
  const formattedResults = results.map((custodian: any) => ({
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

  console.log('\nAPI Response Format:');
  console.log(JSON.stringify({
    success: true,
    results: formattedResults.slice(0, 2), // Show first 2 for brevity
    pagination: {
      limit: 20,
      offset: 0,
      total: formattedResults.length,
      hasMore: false
    },
    metadata: {
      searchMethod: 'bigquery',
      cached: false,
      processingTime: '50ms'
    }
  }, null, 2));

  console.log('\n✅ Test complete!');
}

testCustodianSearch().catch(console.error);