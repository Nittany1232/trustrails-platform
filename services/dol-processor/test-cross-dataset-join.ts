/**
 * Test cross-dataset JOIN between retirement_plans.form5500_latest and dol_data.schedule_c_custodians
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';

async function testCrossDatasetJoin() {
  console.log('🔍 Testing cross-dataset JOIN for sponsor search');
  console.log('='.repeat(60));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // First, let's try to sample the retirement_plans.form5500_latest table
    console.log('\n📊 Testing access to retirement_plans.form5500_latest...');

    const sampleQuery = `
      SELECT
        ack_id,
        sponsor_dfe_name,
        plan_name,
        form_tax_year
      FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\`
      WHERE sponsor_dfe_name IS NOT NULL
      LIMIT 3
    `;

    try {
      const [sampleResults] = await bigquery.query({
        query: sampleQuery,
        location: 'US',
        dryRun: false
      });

      console.log('✅ Successfully accessed retirement_plans.form5500_latest');
      console.log(`Found ${sampleResults.length} sample records:`);

      sampleResults.forEach((record: any, i: number) => {
        console.log(`  ${i + 1}. ${record.sponsor_dfe_name} (${record.plan_name}) - ${record.form_tax_year}`);
        console.log(`     ACK ID: ${record.ack_id}`);
      });

      // Now test the JOIN
      console.log('\n🔗 Testing JOIN between datasets...');

      const joinQuery = `
        SELECT
          f5.ack_id,
          f5.sponsor_dfe_name as sponsor_name,
          f5.plan_name as sponsor_plan_name,
          cc.provider_other_name as custodian_name,
          cc.provider_other_relation as custodian_relation
        FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\` f5
        JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
          ON f5.ack_id = cc.ack_id
        WHERE f5.sponsor_dfe_name IS NOT NULL
          AND cc.provider_other_name IS NOT NULL
        LIMIT 5
      `;

      const [joinResults] = await bigquery.query({
        query: joinQuery,
        location: 'US'
      });

      if (joinResults.length > 0) {
        console.log(`🎉 SUCCESS! Found ${joinResults.length} joined records:`);
        joinResults.forEach((result: any, i: number) => {
          console.log(`  ${i + 1}. Sponsor: ${result.sponsor_name}`);
          console.log(`     Plan: ${result.sponsor_plan_name}`);
          console.log(`     Custodian: ${result.custodian_name} (${result.custodian_relation})`);
          console.log(`     ACK ID: ${result.ack_id}`);
          console.log('');
        });

        // Test Microsoft search specifically
        console.log('🔍 Testing Microsoft search across datasets...');

        const microsoftQuery = `
          SELECT
            f5.sponsor_dfe_name as sponsor_name,
            f5.plan_name,
            cc.provider_other_name as custodian,
            f5.form_tax_year
          FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\` f5
          JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
            ON f5.ack_id = cc.ack_id
          WHERE UPPER(f5.sponsor_dfe_name) LIKE '%MICROSOFT%'
          ORDER BY f5.form_tax_year DESC
          LIMIT 10
        `;

        const [microsoftResults] = await bigquery.query({
          query: microsoftQuery,
          location: 'US'
        });

        if (microsoftResults.length > 0) {
          console.log(`🎯 Microsoft found! ${microsoftResults.length} results:`);
          microsoftResults.forEach((result: any) => {
            console.log(`  ${result.sponsor_name} (${result.form_tax_year})`);
            console.log(`    Plan: ${result.plan_name}`);
            console.log(`    Custodian: ${result.custodian}`);
            console.log('');
          });
        } else {
          console.log('⚠️ Microsoft not found in 2024 data');
        }

        console.log('\n💡 FINAL CONCLUSION:');
        console.log('='.repeat(60));
        console.log('🎉 NO ADDITIONAL TABLES NEEDED!');
        console.log('✅ We can use existing tables with cross-dataset JOIN');
        console.log('✅ retirement_plans.form5500_latest has sponsor data');
        console.log('✅ dol_data.schedule_c_custodians has custodian data');
        console.log('✅ ack_id provides perfect JOIN key');
        console.log('');
        console.log('🚀 Next step: Update search API to use this JOIN query');

      } else {
        console.log('⚠️ JOIN returned no results - checking data alignment...');

        // Check if ACK IDs overlap
        const overlapQuery = `
          SELECT COUNT(*) as overlap_count
          FROM (
            SELECT DISTINCT ack_id FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\`
          ) f5
          JOIN (
            SELECT DISTINCT ack_id FROM \`${PROJECT_ID}.dol_data.schedule_c_custodians\`
          ) cc ON f5.ack_id = cc.ack_id
        `;

        const [overlapResults] = await bigquery.query({
          query: overlapQuery,
          location: 'US'
        });

        console.log(`ACK ID overlap: ${overlapResults[0].overlap_count} records`);
      }

    } catch (queryError: any) {
      console.log(`❌ Query error: ${queryError.message}`);

      if (queryError.message.includes('not found in location')) {
        console.log('🔧 Trying different location...');

        // Try without location specified
        const [retryResults] = await bigquery.query({
          query: sampleQuery
        });

        console.log('✅ Query worked without location specification');
        console.log(`Found ${retryResults.length} records`);
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);

    if (error.message.includes('permission')) {
      console.log('💡 This might be a permissions issue');
    } else if (error.message.includes('not found')) {
      console.log('💡 Table might be in different project or location');
    }
  }
}

// Run the test
testCrossDatasetJoin().catch(console.error);