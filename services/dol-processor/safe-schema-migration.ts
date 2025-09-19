/**
 * Safe Schema Migration: Add Enhanced Fields to plan_sponsors Table
 *
 * This script safely adds the 5 new fields to the existing BigQuery table
 * without breaking existing functionality or data.
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';
const DATASET_ID = 'dol_data';
const TABLE_ID = 'plan_sponsors';

async function safeSchemaUpdate() {
  console.log('🔧 Starting Safe Schema Migration for Enhanced DOL Fields');
  console.log('='.repeat(70));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Step 1: Check current schema
    console.log('\n📊 Step 1: Checking current table schema...');
    const dataset = bigquery.dataset(DATASET_ID);
    const table = dataset.table(TABLE_ID);

    const [metadata] = await table.getMetadata();
    const currentFields = metadata.schema.fields.map((f: any) => f.name);

    console.log('✅ Current fields:', currentFields.join(', '));

    // Step 2: Define new fields to add
    const newFields = [
      {
        name: 'is_final_filing',
        type: 'BOOLEAN',
        mode: 'NULLABLE',
        description: 'Whether this is a final filing (plan termination)'
      },
      {
        name: 'active_participants',
        type: 'INTEGER',
        mode: 'NULLABLE',
        description: 'Number of active plan participants'
      },
      {
        name: 'plan_effective_date',
        type: 'STRING',
        mode: 'NULLABLE',
        description: 'Plan effective date or plan maturity code'
      },
      {
        name: 'business_code',
        type: 'STRING',
        mode: 'NULLABLE',
        description: 'Business/industry classification code'
      },
      {
        name: 'filing_status',
        type: 'STRING',
        mode: 'NULLABLE',
        description: 'Plan entity type and filing status'
      }
    ];

    // Step 3: Check which fields need to be added
    const fieldsToAdd = newFields.filter(field => !currentFields.includes(field.name));

    if (fieldsToAdd.length === 0) {
      console.log('✅ All enhanced fields already exist in schema');
      return;
    }

    console.log(`\n🔧 Step 2: Adding ${fieldsToAdd.length} new fields...`);
    fieldsToAdd.forEach(field => {
      console.log(`  - ${field.name} (${field.type}): ${field.description}`);
    });

    // Step 4: Update schema (non-breaking operation)
    const currentSchema = metadata.schema;
    const newSchema = {
      fields: [
        ...currentSchema.fields,
        ...fieldsToAdd
      ]
    };

    await table.setMetadata({ schema: newSchema });
    console.log('✅ Schema updated successfully');

    // Step 5: Verify the new schema
    console.log('\n🔍 Step 3: Verifying updated schema...');
    const [updatedMetadata] = await table.getMetadata();
    const updatedFields = updatedMetadata.schema.fields.map((f: any) => f.name);

    console.log('✅ Updated fields:', updatedFields.join(', '));

    // Step 6: Test that existing queries still work
    console.log('\n🧪 Step 4: Testing backwards compatibility...');

    const testQuery = `
      SELECT
        COUNT(*) as total_records,
        COUNT(DISTINCT sponsor_name) as unique_sponsors
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      WHERE sponsor_name IS NOT NULL
      LIMIT 1
    `;

    const [results] = await bigquery.query({ query: testQuery, location: 'US' });
    console.log('✅ Existing queries work:', results[0]);

    // Step 7: Show enhanced schema ready for ingestion
    console.log('\n🎉 Enhanced Schema Migration Complete!');
    console.log('='.repeat(70));
    console.log('\n📋 Next Steps:');
    console.log('1. ✅ Schema updated with 5 new fields');
    console.log('2. ✅ All existing functionality preserved');
    console.log('3. 🚀 Ready for enhanced data ingestion');
    console.log('\nRe-run ingestion to populate new fields:');
    console.log('  npx tsx ingest-form5500-flexible.ts 2024');
    console.log('  npx tsx ingest-form5500-flexible.ts 2023');

  } catch (error: any) {
    console.error('❌ Schema migration failed:', error.message);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

// Run the migration
if (require.main === module) {
  safeSchemaUpdate()
    .then(() => {
      console.log('\n✨ Schema migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Schema migration failed:', error);
      process.exit(1);
    });
}

export { safeSchemaUpdate };