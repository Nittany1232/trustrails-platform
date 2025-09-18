/**
 * Check BigQuery Table Schema and Sample Data
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';
const DATASET_ID = 'dol_data';

async function checkTableSchema() {
  console.log('🔍 Checking BigQuery table schema and capabilities');
  console.log('='.repeat(60));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Get table metadata
    console.log('\n📊 Table Schema:');
    const [metadata] = await bigquery
      .dataset(DATASET_ID)
      .table('schedule_c_custodians')
      .getMetadata();

    console.log('Columns:');
    metadata.schema.fields.forEach((field: any) => {
      console.log(`  ${field.name}: ${field.type}`);
    });

    // Sample data to understand what we have
    console.log('\n📝 Sample Records (first 3):');
    const sampleQuery = `
      SELECT *
      FROM \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\`
      LIMIT 3
    `;

    const [sampleResults] = await bigquery.query({ query: sampleQuery, location: 'US' });

    sampleResults.forEach((record: any, i: number) => {
      console.log(`\nRecord ${i + 1}:`);
      Object.entries(record).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    });

    // Check for plan names that might contain company info
    console.log('\n🏢 Plan Names Analysis:');
    const planNamesQuery = `
      SELECT
        plan_name,
        CASE
          WHEN UPPER(plan_name) LIKE '%MICROSOFT%' THEN 'Microsoft'
          WHEN UPPER(plan_name) LIKE '%GOOGLE%' THEN 'Google'
          WHEN UPPER(plan_name) LIKE '%AMAZON%' THEN 'Amazon'
          WHEN UPPER(plan_name) LIKE '%APPLE%' THEN 'Apple'
          WHEN UPPER(plan_name) LIKE '%401%' THEN 'Generic 401k'
          ELSE 'Other'
        END as plan_type,
        COUNT(*) as count
      FROM \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\`
      WHERE plan_name IS NOT NULL
      GROUP BY plan_name, plan_type
      HAVING plan_type != 'Other' OR count > 10
      ORDER BY count DESC
      LIMIT 10
    `;

    const [planResults] = await bigquery.query({ query: planNamesQuery, location: 'US' });

    planResults.forEach((plan: any) => {
      console.log(`${plan.plan_type}: ${plan.plan_name} (${plan.count} records)`);
    });

    // Test sponsor extraction potential
    console.log('\n🎯 Sponsor Extraction Test:');
    const extractionQuery = `
      SELECT
        plan_name,
        REGEXP_EXTRACT(UPPER(plan_name), r'^([A-Z\\s&,\\.]+?)\\s+(401|403|RETIREMENT|PLAN)') as potential_sponsor,
        COUNT(*) as frequency
      FROM \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\`
      WHERE plan_name IS NOT NULL
        AND REGEXP_EXTRACT(UPPER(plan_name), r'^([A-Z\\s&,\\.]+?)\\s+(401|403|RETIREMENT|PLAN)') IS NOT NULL
      GROUP BY plan_name, potential_sponsor
      ORDER BY frequency DESC
      LIMIT 15
    `;

    const [extractionResults] = await bigquery.query({ query: extractionQuery, location: 'US' });

    console.log('Potential sponsors extracted from plan names:');
    extractionResults.forEach((result: any) => {
      console.log(`  "${result.potential_sponsor}" from "${result.plan_name}" (${result.frequency}x)`);
    });

    console.log('\n💡 Analysis Summary:');
    console.log('='.repeat(60));
    console.log('Current table contains:');
    console.log('✅ Custodian/provider information (complete)');
    console.log('✅ Plan identifiers (EIN, plan_number)');
    console.log('✅ Plan names (some contain sponsor info)');
    console.log('❌ Explicit sponsor/employer company names');
    console.log('❌ Sponsor business information');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run the analysis
checkTableSchema().catch(console.error);