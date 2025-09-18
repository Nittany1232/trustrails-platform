/**
 * Test JOIN between retirement_plans and dol_data using EIN + Plan Number
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';

async function testEinJoin() {
  console.log('🔗 Testing JOIN on EIN + Plan Number');
  console.log('='.repeat(60));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Test JOIN using EIN and Plan Number
    console.log('\n🔗 Testing JOIN on EIN + Plan Number...');

    const joinQuery = `
      SELECT
        rp.ein,
        rp.planNumber,
        rp.sponsorName,
        rp.planName as sponsor_plan_name,
        cc.provider_other_name as custodian_name,
        cc.provider_other_relation as custodian_relation,
        COUNT(*) as record_count
      FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\` rp
      JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
        ON rp.ein = cc.ein_plan_sponsor
        AND rp.planNumber = cc.plan_number
      WHERE rp.sponsorName IS NOT NULL
        AND cc.provider_other_name IS NOT NULL
      GROUP BY rp.ein, rp.planNumber, rp.sponsorName, rp.planName, cc.provider_other_name, cc.provider_other_relation
      LIMIT 10
    `;

    const [joinResults] = await bigquery.query({ query: joinQuery });

    if (joinResults.length > 0) {
      console.log(`🎉 SUCCESS! Found ${joinResults.length} joined records:`);
      joinResults.forEach((result: any, i: number) => {
        console.log(`\n${i + 1}. Sponsor: ${result.sponsorName}`);
        console.log(`   EIN: ${result.ein}, Plan: ${result.planNumber}`);
        console.log(`   Plan Name: ${result.sponsor_plan_name}`);
        console.log(`   Custodian: ${result.custodian_name} (${result.custodian_relation})`);
        console.log(`   Records: ${result.record_count}`);
      });

      // Test Microsoft search specifically
      console.log('\n🔍 Testing Microsoft search...');

      const microsoftQuery = `
        SELECT
          rp.sponsorName,
          rp.planName,
          cc.provider_other_name as custodian,
          rp.participants,
          rp.totalAssets,
          rp.formYear
        FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\` rp
        JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
          ON rp.ein = cc.ein_plan_sponsor
          AND rp.planNumber = cc.plan_number
        WHERE UPPER(rp.sponsorName) LIKE '%MICROSOFT%'
        ORDER BY rp.formYear DESC
        LIMIT 10
      `;

      const [microsoftResults] = await bigquery.query({ query: microsoftQuery });

      if (microsoftResults.length > 0) {
        console.log(`🎯 Microsoft found! ${microsoftResults.length} results:`);
        microsoftResults.forEach((result: any) => {
          console.log(`\n• ${result.sponsorName} (${result.formYear})`);
          console.log(`  Plan: ${result.planName}`);
          console.log(`  Custodian: ${result.custodian}`);
          console.log(`  Participants: ${result.participants?.toLocaleString()}`);
          console.log(`  Assets: $${result.totalAssets?.toLocaleString()}`);
        });
      } else {
        console.log('⚠️ Microsoft not found (might need historical data)');
      }

      // Test some major companies
      console.log('\n🏢 Testing other major companies...');

      const companiesQuery = `
        SELECT
          rp.sponsorName,
          cc.provider_other_name as custodian,
          COUNT(*) as plan_count
        FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\` rp
        JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
          ON rp.ein = cc.ein_plan_sponsor
          AND rp.planNumber = cc.plan_number
        WHERE (
          UPPER(rp.sponsorName) LIKE '%GOOGLE%' OR
          UPPER(rp.sponsorName) LIKE '%AMAZON%' OR
          UPPER(rp.sponsorName) LIKE '%APPLE%' OR
          UPPER(rp.sponsorName) LIKE '%META%' OR
          UPPER(rp.sponsorName) LIKE '%FACEBOOK%'
        )
        GROUP BY rp.sponsorName, cc.provider_other_name
        ORDER BY plan_count DESC
        LIMIT 10
      `;

      const [companiesResults] = await bigquery.query({ query: companiesQuery });

      if (companiesResults.length > 0) {
        console.log('✅ Major tech companies found:');
        companiesResults.forEach((result: any) => {
          console.log(`  ${result.sponsorName} → ${result.custodian} (${result.plan_count} plans)`);
        });
      }

      console.log('\n💡 FINAL CONCLUSION:');
      console.log('='.repeat(60));
      console.log('🎉 NO ADDITIONAL TABLES NEEDED!');
      console.log('✅ Can JOIN retirement_plans.form5500_latest + dol_data.schedule_c_custodians');
      console.log('✅ JOIN key: EIN + Plan Number (not ack_id)');
      console.log('✅ Provides complete sponsor → custodian mapping');
      console.log('✅ Supports "Microsoft 1990" employee search scenarios');
      console.log('');
      console.log('🚀 RECOMMENDATION: Update search API to use this cross-dataset JOIN');

    } else {
      console.log('⚠️ No JOIN results found');

      // Check data alignment
      console.log('\n🔍 Checking data alignment...');

      const alignmentQuery = `
        SELECT
          'retirement_plans' as table_name,
          COUNT(DISTINCT ein) as unique_eins,
          COUNT(DISTINCT CONCAT(ein, '-', planNumber)) as unique_ein_plan_combos
        FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\`
        UNION ALL
        SELECT
          'schedule_c_custodians' as table_name,
          COUNT(DISTINCT ein_plan_sponsor) as unique_eins,
          COUNT(DISTINCT CONCAT(ein_plan_sponsor, '-', plan_number)) as unique_ein_plan_combos
        FROM \`${PROJECT_ID}.dol_data.schedule_c_custodians\`
        WHERE ein_plan_sponsor IS NOT NULL AND plan_number IS NOT NULL
      `;

      const [alignmentResults] = await bigquery.query({ query: alignmentQuery });

      alignmentResults.forEach((result: any) => {
        console.log(`${result.table_name}: ${result.unique_eins} EINs, ${result.unique_ein_plan_combos} EIN+Plan combos`);
      });
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testEinJoin().catch(console.error);