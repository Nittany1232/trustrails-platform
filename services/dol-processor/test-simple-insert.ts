/**
 * Test simple insert to plan_sponsors table
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';

async function testSimpleInsert() {
  console.log('🧪 Testing simple insert to plan_sponsors table...');

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Test 1: Simple query first
    console.log('\n📋 Step 1: Testing table exists...');

    const query = `SELECT COUNT(*) as count FROM \`${PROJECT_ID}.dol_data.plan_sponsors\``;
    const [results] = await bigquery.query({ query, location: 'US' });
    console.log(`✅ Table exists, current count: ${results[0].count}`);

    // Test 2: Simple insert
    console.log('\n📝 Step 2: Testing single record insert...');

    const dataset = bigquery.dataset('dol_data', { location: 'US' });
    const table = dataset.table('plan_sponsors');

    const testRow = {
      ack_id: 'test_' + Date.now(),
      ein_plan_sponsor: '123456789',
      plan_number: '001',
      plan_name: 'Test Plan',
      sponsor_name: 'Test Corporation',
      sponsor_city: 'Test City',
      sponsor_state: 'CA',
      sponsor_zip: '90210',
      plan_type: 'Defined Contribution Plan',
      participants: 100,
      total_assets: 1000000.00,
      form_tax_year: 2024,
      extraction_date: new Date().toISOString(),
      file_source: 'simple_test'
    };

    await table.insert([testRow]);
    console.log('✅ Simple insert successful');

    // Test 3: Verify data
    const verifyQuery = `SELECT * FROM \`${PROJECT_ID}.dol_data.plan_sponsors\` WHERE file_source = 'simple_test' LIMIT 1`;
    const [verifyResults] = await bigquery.query({ query: verifyQuery, location: 'US' });

    if (verifyResults.length > 0) {
      console.log('✅ Data verification successful:');
      console.log(`  Sponsor: ${verifyResults[0].sponsor_name}`);
      console.log(`  Plan: ${verifyResults[0].plan_name}`);
      console.log(`  ACK ID: ${verifyResults[0].ack_id}`);
    } else {
      console.log('⚠️ No data found after insert');
    }

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

testSimpleInsert().catch(console.error);