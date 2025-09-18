/**
 * Check retirement_plans table and join with schedule_c_custodians
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';
const DATASET_ID = 'dol_data';

async function checkRetirementPlansTable() {
  console.log('🔍 Checking retirement_plans table and join capabilities');
  console.log('='.repeat(60));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Check retirement_plans table schema
    console.log('\n📊 retirement_plans Table Schema:');
    const [retirementMetadata] = await bigquery
      .dataset(DATASET_ID)
      .table('retirement_plans')
      .getMetadata();

    console.log('Columns:');
    retirementMetadata.schema.fields.forEach((field: any) => {
      console.log(`  ${field.name}: ${field.type}`);
    });

    // Sample retirement_plans data
    console.log('\n📝 Sample retirement_plans Records:');
    const sampleRetirementQuery = `
      SELECT *
      FROM \`${PROJECT_ID}.${DATASET_ID}.retirement_plans\`
      LIMIT 3
    `;

    const [retirementSample] = await bigquery.query({ query: sampleRetirementQuery, location: 'US' });

    retirementSample.forEach((record: any, i: number) => {
      console.log(`\nRetirement Plan Record ${i + 1}:`);
      Object.entries(record).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    });

    // Test JOIN between tables
    console.log('\n🔗 Testing JOIN between tables:');
    const joinQuery = `
      SELECT
        rp.ack_id,
        rp.sponsor_name,
        rp.sponsor_ein,
        rp.plan_name as retirement_plan_name,
        cc.provider_other_name as custodian_name,
        cc.provider_other_relation,
        cc.plan_name as custodian_plan_name
      FROM \`${PROJECT_ID}.${DATASET_ID}.retirement_plans\` rp
      JOIN \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\` cc
        ON rp.ack_id = cc.ack_id
      WHERE rp.sponsor_name IS NOT NULL
        AND cc.provider_other_name IS NOT NULL
      LIMIT 5
    `;

    const [joinResults] = await bigquery.query({ query: joinQuery, location: 'US' });

    if (joinResults.length > 0) {
      console.log('✅ Successfully joined tables:');
      joinResults.forEach((result: any, i: number) => {
        console.log(`\nJoin Result ${i + 1}:`);
        console.log(`  Sponsor: ${result.sponsor_name} (EIN: ${result.sponsor_ein})`);
        console.log(`  Plan: ${result.retirement_plan_name}`);
        console.log(`  Custodian: ${result.custodian_name}`);
        console.log(`  Relation: ${result.provider_other_relation}`);
      });
    } else {
      console.log('⚠️ No matching records found in JOIN');
    }

    // Test Microsoft search with joined data
    console.log('\n🔍 Testing Microsoft search with joined data:');
    const microsoftQuery = `
      SELECT
        rp.sponsor_name,
        rp.sponsor_ein,
        rp.plan_name,
        cc.provider_other_name as custodian,
        COUNT(*) as records
      FROM \`${PROJECT_ID}.${DATASET_ID}.retirement_plans\` rp
      JOIN \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\` cc
        ON rp.ack_id = cc.ack_id
      WHERE UPPER(rp.sponsor_name) LIKE '%MICROSOFT%'
      GROUP BY rp.sponsor_name, rp.sponsor_ein, rp.plan_name, cc.provider_other_name
      ORDER BY records DESC
      LIMIT 10
    `;

    const [microsoftResults] = await bigquery.query({ query: microsoftQuery, location: 'US' });

    if (microsoftResults.length > 0) {
      console.log('🎉 Microsoft found in joined data:');
      microsoftResults.forEach((result: any) => {
        console.log(`  ${result.sponsor_name} → ${result.custodian} (${result.records} records)`);
      });
    } else {
      console.log('⚠️ Microsoft not found in current year data');
    }

    // Check record counts
    console.log('\n📈 Record Counts:');
    const countQuery = `
      SELECT
        'retirement_plans' as table_name,
        COUNT(*) as total_records,
        COUNT(DISTINCT ack_id) as unique_ack_ids,
        COUNT(DISTINCT sponsor_name) as unique_sponsors
      FROM \`${PROJECT_ID}.${DATASET_ID}.retirement_plans\`
      UNION ALL
      SELECT
        'schedule_c_custodians' as table_name,
        COUNT(*) as total_records,
        COUNT(DISTINCT ack_id) as unique_ack_ids,
        COUNT(DISTINCT provider_other_name) as unique_sponsors
      FROM \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\`
      UNION ALL
      SELECT
        'joined_data' as table_name,
        COUNT(*) as total_records,
        COUNT(DISTINCT rp.ack_id) as unique_ack_ids,
        COUNT(DISTINCT rp.sponsor_name) as unique_sponsors
      FROM \`${PROJECT_ID}.${DATASET_ID}.retirement_plans\` rp
      JOIN \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\` cc
        ON rp.ack_id = cc.ack_id
    `;

    const [countResults] = await bigquery.query({ query: countQuery, location: 'US' });

    countResults.forEach((count: any) => {
      console.log(`${count.table_name}: ${count.total_records} records, ${count.unique_ack_ids} unique ACK IDs, ${count.unique_sponsors} unique sponsors`);
    });

    console.log('\n💡 Analysis Summary:');
    console.log('='.repeat(60));

    if (joinResults.length > 0) {
      console.log('✅ We CAN use existing tables with JOIN!');
      console.log('✅ retirement_plans contains sponsor/employer data');
      console.log('✅ schedule_c_custodians contains custodian data');
      console.log('✅ ack_id provides the relationship between them');
      console.log('');
      console.log('🎯 Recommendation: UPDATE search API to use JOIN query');
      console.log('   - No additional tables needed');
      console.log('   - Can search both custodians AND sponsors');
      console.log('   - Single query for complete plan information');
    } else {
      console.log('❌ Tables exist but no matching records found');
      console.log('   - Need to investigate data integrity');
      console.log('   - May need additional data sources');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run the analysis
checkRetirementPlansTable().catch(console.error);