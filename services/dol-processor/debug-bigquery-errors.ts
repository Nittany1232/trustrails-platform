/**
 * Debug BigQuery Insert Errors
 * Check table schema and test sample inserts
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';

async function debugBigQueryErrors() {
  console.log('🔍 Debugging BigQuery insert errors...');

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Step 1: Get table schema
    console.log('\n📋 Step 1: Getting plan_sponsors table schema...');

    const table = bigquery.dataset('dol_data').table('plan_sponsors');
    const [metadata] = await table.getMetadata();

    console.log('Current table schema:');
    metadata.schema.fields.forEach((field: any) => {
      console.log(`  ${field.name}: ${field.type} (${field.mode || 'NULLABLE'})`);
    });

    // Step 2: Test a simple insert
    console.log('\n🧪 Step 2: Testing simple insert...');

    const testRow = {
      ack_id: 'test123',
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
      file_source: 'debug_test'
    };

    const insertResult = await table.insert([testRow]);
    console.log('✅ Test insert successful');

    // Step 3: Sample actual data to see format issues
    console.log('\n📊 Step 3: Checking sample data format...');

    // Let's check what data we're trying to insert
    console.log('Sample data structure:', JSON.stringify(testRow, null, 2));

  } catch (error: any) {
    console.error('❌ Debug failed:', error.message);

    if (error.errors && error.errors.length > 0) {
      console.log('\nFirst few insert errors:');
      error.errors.slice(0, 3).forEach((errObj: any, i: number) => {
        console.log(`\nError ${i + 1}:`);
        console.log('Errors:', errObj.errors);
        console.log('Row data:', errObj.row);
      });
    }
  }
}

debugBigQueryErrors().catch(console.error);