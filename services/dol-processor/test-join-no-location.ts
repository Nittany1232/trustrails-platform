/**
 * Test JOIN without location specification
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';

async function testJoinNoLocation() {
  console.log('🔗 Testing JOIN without location specification');
  console.log('='.repeat(60));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Test simple JOIN without location
    const joinQuery = `
      SELECT
        rp.sponsorName,
        rp.planName,
        cc.provider_other_name as custodian_name,
        COUNT(*) as record_count
      FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\` rp
      JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
        ON rp.ein = cc.ein_plan_sponsor
        AND rp.planNumber = cc.plan_number
      WHERE rp.sponsorName IS NOT NULL
        AND cc.provider_other_name IS NOT NULL
      GROUP BY rp.sponsorName, rp.planName, cc.provider_other_name
      LIMIT 5
    `;

    console.log('🔗 Running JOIN query...');
    const [joinResults] = await bigquery.query({ query: joinQuery });

    if (joinResults.length > 0) {
      console.log(`🎉 SUCCESS! Found ${joinResults.length} joined records:`);
      joinResults.forEach((result: any, i: number) => {
        console.log(`${i + 1}. ${result.sponsorName} → ${result.custodian_name} (${result.record_count} records)`);
        console.log(`   Plan: ${result.planName}`);
      });

      // Test Microsoft search
      const microsoftQuery = `
        SELECT
          rp.sponsorName,
          rp.planName,
          cc.provider_other_name as custodian,
          rp.participants,
          rp.totalAssets
        FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\` rp
        JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
          ON rp.ein = cc.ein_plan_sponsor
          AND rp.planNumber = cc.plan_number
        WHERE UPPER(rp.sponsorName) LIKE '%MICROSOFT%'
        LIMIT 5
      `;

      console.log('\n🔍 Testing Microsoft search...');
      const [microsoftResults] = await bigquery.query({ query: microsoftQuery });

      if (microsoftResults.length > 0) {
        console.log(`🎯 Microsoft found! ${microsoftResults.length} results:`);
        microsoftResults.forEach((result: any) => {
          console.log(`• ${result.sponsorName}`);
          console.log(`  Plan: ${result.planName}`);
          console.log(`  Custodian: ${result.custodian}`);
          console.log(`  Participants: ${result.participants?.toLocaleString()}`);
          console.log(`  Assets: $${result.totalAssets?.toLocaleString()}`);
          console.log('');
        });
      } else {
        console.log('⚠️ Microsoft not found in joined data');
      }

      console.log('\n💡 FINAL ANSWER:');
      console.log('='.repeat(60));
      console.log('🎉 NO ADDITIONAL TABLES NEEDED!');
      console.log('✅ retirement_plans.form5500_latest + dol_data.schedule_c_custodians');
      console.log('✅ JOIN on: ein = ein_plan_sponsor AND planNumber = plan_number');
      console.log('✅ Provides sponsor → custodian mapping');
      console.log('✅ Supports employer search scenarios');

    } else {
      console.log('⚠️ No JOIN results - different approach needed');

      // Check if we should use the plan_sponsors table instead
      console.log('\n📋 Alternative: Populate dol_data.plan_sponsors table');
      console.log('✅ Table exists but empty - populate with retirement_plans data');
      console.log('✅ Same dataset = easier queries, no location issues');
      console.log('✅ Maintain ack_id relationship with schedule_c_custodians');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);

    console.log('\n💡 RECOMMENDATION:');
    console.log('='.repeat(60));
    console.log('Given location/JOIN issues with cross-dataset queries:');
    console.log('');
    console.log('🎯 BEST APPROACH: Populate dol_data.plan_sponsors table');
    console.log('✅ Copy sponsor data from retirement_plans.form5500_latest');
    console.log('✅ Add ack_id mapping for JOIN with schedule_c_custodians');
    console.log('✅ Single dataset = no location/permission issues');
    console.log('✅ Simpler queries and better performance');
  }
}

// Run the test
testJoinNoLocation().catch(console.error);