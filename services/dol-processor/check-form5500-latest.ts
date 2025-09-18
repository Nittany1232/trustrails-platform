/**
 * Check form5500_latest table and join with schedule_c_custodians
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';
const DATASET_ID = 'dol_data';

async function checkForm5500Latest() {
  console.log('🔍 Checking form5500_latest table and join capabilities');
  console.log('='.repeat(60));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Check form5500_latest table schema
    console.log('\n📊 form5500_latest Table Schema:');
    const [form5500Metadata] = await bigquery
      .dataset(DATASET_ID)
      .table('form5500_latest')
      .getMetadata();

    console.log('Columns:');
    form5500Metadata.schema.fields.forEach((field: any) => {
      console.log(`  ${field.name}: ${field.type}`);
    });

    // Sample form5500_latest data
    console.log('\n📝 Sample form5500_latest Records:');
    const sampleForm5500Query = `
      SELECT *
      FROM \`${PROJECT_ID}.${DATASET_ID}.form5500_latest\`
      LIMIT 3
    `;

    const [form5500Sample] = await bigquery.query({ query: sampleForm5500Query, location: 'US' });

    form5500Sample.forEach((record: any, i: number) => {
      console.log(`\nForm 5500 Record ${i + 1}:`);
      Object.entries(record).forEach(([key, value]) => {
        if (key.toLowerCase().includes('sponsor') || key.toLowerCase().includes('name') || key.toLowerCase().includes('plan') || key === 'ack_id') {
          console.log(`  ${key}: ${value}`);
        }
      });
    });

    // Test JOIN between tables
    console.log('\n🔗 Testing JOIN between form5500_latest and schedule_c_custodians:');
    const joinQuery = `
      SELECT
        f5.ack_id,
        f5.sponsor_dfe_name as sponsor_name,
        f5.plan_name as sponsor_plan_name,
        cc.provider_other_name as custodian_name,
        cc.provider_other_relation,
        cc.plan_name as custodian_plan_name
      FROM \`${PROJECT_ID}.${DATASET_ID}.form5500_latest\` f5
      JOIN \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\` cc
        ON f5.ack_id = cc.ack_id
      WHERE f5.sponsor_dfe_name IS NOT NULL
        AND cc.provider_other_name IS NOT NULL
      LIMIT 5
    `;

    const [joinResults] = await bigquery.query({ query: joinQuery, location: 'US' });

    if (joinResults.length > 0) {
      console.log('✅ Successfully joined tables:');
      joinResults.forEach((result: any, i: number) => {
        console.log(`\nJoin Result ${i + 1}:`);
        console.log(`  Sponsor: ${result.sponsor_name}`);
        console.log(`  Plan: ${result.sponsor_plan_name}`);
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
        f5.sponsor_dfe_name as sponsor_name,
        f5.plan_name,
        cc.provider_other_name as custodian,
        COUNT(*) as records
      FROM \`${PROJECT_ID}.${DATASET_ID}.form5500_latest\` f5
      JOIN \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\` cc
        ON f5.ack_id = cc.ack_id
      WHERE UPPER(f5.sponsor_dfe_name) LIKE '%MICROSOFT%'
      GROUP BY f5.sponsor_dfe_name, f5.plan_name, cc.provider_other_name
      ORDER BY records DESC
      LIMIT 10
    `;

    const [microsoftResults] = await bigquery.query({ query: microsoftQuery, location: 'US' });

    if (microsoftResults.length > 0) {
      console.log('🎉 Microsoft found in joined data:');
      microsoftResults.forEach((result: any) => {
        console.log(`  ${result.sponsor_name} → ${result.custodian} (${result.records} records)`);
        console.log(`    Plan: ${result.plan_name}`);
      });
    } else {
      console.log('⚠️ Microsoft not found in current year data');
    }

    // Check record counts and data quality
    console.log('\n📈 Data Quality Analysis:');
    const qualityQuery = `
      SELECT
        'form5500_latest' as table_name,
        COUNT(*) as total_records,
        COUNT(DISTINCT ack_id) as unique_ack_ids,
        COUNT(DISTINCT sponsor_dfe_name) as unique_sponsors,
        COUNT(sponsor_dfe_name) as sponsors_with_names,
        ROUND(COUNT(sponsor_dfe_name) * 100.0 / COUNT(*), 2) as sponsor_name_coverage
      FROM \`${PROJECT_ID}.${DATASET_ID}.form5500_latest\`
      UNION ALL
      SELECT
        'schedule_c_custodians' as table_name,
        COUNT(*) as total_records,
        COUNT(DISTINCT ack_id) as unique_ack_ids,
        COUNT(DISTINCT provider_other_name) as unique_sponsors,
        COUNT(provider_other_name) as sponsors_with_names,
        ROUND(COUNT(provider_other_name) * 100.0 / COUNT(*), 2) as sponsor_name_coverage
      FROM \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\`
      UNION ALL
      SELECT
        'joined_data' as table_name,
        COUNT(*) as total_records,
        COUNT(DISTINCT f5.ack_id) as unique_ack_ids,
        COUNT(DISTINCT f5.sponsor_dfe_name) as unique_sponsors,
        COUNT(f5.sponsor_dfe_name) as sponsors_with_names,
        ROUND(COUNT(f5.sponsor_dfe_name) * 100.0 / COUNT(*), 2) as sponsor_name_coverage
      FROM \`${PROJECT_ID}.${DATASET_ID}.form5500_latest\` f5
      JOIN \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\` cc
        ON f5.ack_id = cc.ack_id
    `;

    const [qualityResults] = await bigquery.query({ query: qualityQuery, location: 'US' });

    qualityResults.forEach((stat: any) => {
      console.log(`${stat.table_name}:`);
      console.log(`  Records: ${stat.total_records?.toLocaleString()}`);
      console.log(`  Unique ACK IDs: ${stat.unique_ack_ids?.toLocaleString()}`);
      console.log(`  Unique Sponsors: ${stat.unique_sponsors?.toLocaleString()}`);
      console.log(`  Name Coverage: ${stat.sponsor_name_coverage}%`);
      console.log('');
    });

    console.log('\n💡 Final Analysis:');
    console.log('='.repeat(60));

    if (joinResults.length > 0) {
      console.log('🎉 PERFECT! We can use existing tables with JOIN!');
      console.log('✅ form5500_latest contains sponsor/employer data');
      console.log('✅ schedule_c_custodians contains custodian data');
      console.log('✅ ack_id provides the relationship between them');
      console.log('');
      console.log('🎯 RECOMMENDATION: Update search API to use JOIN query');
      console.log('   - NO additional tables needed');
      console.log('   - Can search both custodians AND sponsors');
      console.log('   - Single query for complete plan information');
      console.log('   - Supports "Microsoft 1990" employee scenarios');
    } else {
      console.log('❌ Tables exist but JOIN fails - need data alignment');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run the analysis
checkForm5500Latest().catch(console.error);