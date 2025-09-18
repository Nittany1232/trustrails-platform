/**
 * List all tables in the dol_data dataset
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';
const DATASET_ID = 'dol_data';

async function listDatasetTables() {
  console.log('📊 Listing all tables in dol_data dataset');
  console.log('='.repeat(60));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // List all tables in the dataset
    const [tables] = await bigquery.dataset(DATASET_ID).getTables();

    console.log(`Found ${tables.length} tables in ${DATASET_ID} dataset:`);
    console.log('');

    for (const table of tables) {
      console.log(`📋 Table: ${table.id}`);

      // Get table metadata
      const [metadata] = await table.getMetadata();
      console.log(`   Rows: ${metadata.numRows || 'Unknown'}`);
      console.log(`   Size: ${metadata.numBytes ? (parseInt(metadata.numBytes) / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}`);
      console.log(`   Created: ${metadata.creationTime ? new Date(parseInt(metadata.creationTime)).toLocaleDateString() : 'Unknown'}`);

      // Show schema
      console.log('   Columns:');
      if (metadata.schema?.fields) {
        metadata.schema.fields.slice(0, 5).forEach((field: any) => {
          console.log(`     ${field.name}: ${field.type}`);
        });
        if (metadata.schema.fields.length > 5) {
          console.log(`     ... and ${metadata.schema.fields.length - 5} more columns`);
        }
      }
      console.log('');
    }

    // If we have the right table structure, show what we can do
    if (tables.length > 0) {
      console.log('💡 Analysis:');
      console.log('='.repeat(60));

      const tableNames = tables.map(t => t.id);

      if (tableNames.includes('schedule_c_custodians')) {
        console.log('✅ We have schedule_c_custodians (custodian data)');
      }

      if (tableNames.includes('retirement_plans')) {
        console.log('✅ We have retirement_plans (sponsor data)');
        console.log('🎯 Can JOIN on ack_id for complete sponsor-custodian data');
      } else {
        console.log('❌ Missing retirement_plans table');
        console.log('🔍 Need to create this table from Form 5500 main filings');
      }

      if (tableNames.some(name => name.includes('form5500') || name.includes('main'))) {
        console.log('✅ Found Form 5500 related tables');
      } else {
        console.log('❌ No Form 5500 main filing data found');
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run the analysis
listDatasetTables().catch(console.error);