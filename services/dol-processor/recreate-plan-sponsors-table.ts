/**
 * Recreate plan_sponsors table with correct Form 5500 schema
 *
 * Current table has wrong schema (schedule_c_custodians format)
 * Need to recreate with proper sponsor fields
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';

async function recreatePlanSponsorsTable() {
  console.log('🔧 Recreating plan_sponsors table with correct schema');
  console.log('='.repeat(70));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    const dataset = bigquery.dataset('dol_data');
    const table = dataset.table('plan_sponsors');

    // Step 1: Check if table exists and get current data count
    console.log('\n📊 Step 1: Checking current table...');

    let currentCount = 0;
    try {
      const countQuery = `SELECT COUNT(*) as count FROM \`${PROJECT_ID}.dol_data.plan_sponsors\``;
      const [results] = await bigquery.query({ query: countQuery, location: 'US' });
      currentCount = results[0].count;
      console.log(`Current table has ${currentCount} records`);
    } catch (error) {
      console.log('Table does not exist or is empty');
    }

    // Step 2: Drop existing table
    console.log('\n🗑️ Step 2: Dropping existing table...');

    try {
      await table.delete();
      console.log('✅ Table dropped successfully');
    } catch (error) {
      console.log('Table did not exist or already dropped');
    }

    // Step 3: Create new table with correct schema
    console.log('\n🏗️ Step 3: Creating new table with Form 5500 schema...');

    const schema = [
      { name: 'ack_id', type: 'STRING', mode: 'NULLABLE' },
      { name: 'ein_plan_sponsor', type: 'STRING', mode: 'NULLABLE' },
      { name: 'plan_number', type: 'STRING', mode: 'NULLABLE' },
      { name: 'plan_name', type: 'STRING', mode: 'NULLABLE' },
      { name: 'sponsor_name', type: 'STRING', mode: 'NULLABLE' },
      { name: 'sponsor_city', type: 'STRING', mode: 'NULLABLE' },
      { name: 'sponsor_state', type: 'STRING', mode: 'NULLABLE' },
      { name: 'sponsor_zip', type: 'STRING', mode: 'NULLABLE' },
      { name: 'plan_type', type: 'STRING', mode: 'NULLABLE' },
      { name: 'participants', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'total_assets', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'form_tax_year', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'extraction_date', type: 'TIMESTAMP', mode: 'NULLABLE' },
      { name: 'file_source', type: 'STRING', mode: 'NULLABLE' }
    ];

    const options = {
      schema: schema,
      location: 'US',
      timePartitioning: {
        type: 'DAY',
        field: 'extraction_date'
      },
      clustering: {
        fields: ['sponsor_name', 'ack_id']
      }
    };

    await table.create(options);
    console.log('✅ New table created with Form 5500 schema');

    // Step 4: Display new schema
    console.log('\n📋 New table schema:');
    schema.forEach(field => {
      console.log(`  ${field.name}: ${field.type} (${field.mode})`);
    });

    console.log('\n🎉 Table recreation complete!');
    console.log('✅ Ready for Form 5500 sponsor data ingestion');
    console.log('✅ Partitioned by extraction_date for performance');
    console.log('✅ Clustered by sponsor_name and ack_id for fast searches');

  } catch (error: any) {
    console.error('❌ Table recreation failed:', error.message);
    throw error;
  }
}

recreatePlanSponsorsTable().catch(console.error);