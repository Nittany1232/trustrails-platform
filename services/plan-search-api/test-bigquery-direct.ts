/**
 * Test BigQuery directly to diagnose search issues
 */

import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery({
  projectId: 'trustrails-faa3e',
  keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
});

async function testBigQuery() {
  console.log('🔍 Testing BigQuery search for Microsoft...\n');

  try {
    // First test: Check if we have data in plan_sponsors
    const checkQuery = `
      SELECT COUNT(*) as total
      FROM \`trustrails-faa3e.dol_data.plan_sponsors\`
      WHERE UPPER(sponsor_name) LIKE '%MICROSOFT%'
    `;

    console.log('1️⃣ Checking plan_sponsors table:');
    const [checkResult] = await bigquery.query({
      query: checkQuery,
      location: 'US'
    });
    console.log(`   Found ${checkResult[0].total} Microsoft sponsors\n`);

    // Second test: Simple search without JOIN
    const simpleQuery = `
      SELECT
        ein_plan_sponsor,
        sponsor_name,
        plan_name,
        participants,
        total_assets
      FROM \`trustrails-faa3e.dol_data.plan_sponsors\`
      WHERE UPPER(sponsor_name) LIKE '%MICROSOFT%'
      LIMIT 5
    `;

    console.log('2️⃣ Simple search (no JOIN):');
    const [simpleResult] = await bigquery.query({
      query: simpleQuery,
      location: 'US'
    });

    simpleResult.forEach((row: any) => {
      console.log(`   ${row.sponsor_name}: ${row.participants} participants`);
    });

    // Third test: Check schedule_c_custodians
    console.log('\n3️⃣ Checking schedule_c_custodians:');
    const custodianQuery = `
      SELECT COUNT(*) as total
      FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\`
      WHERE ack_id IN (
        SELECT ack_id
        FROM \`trustrails-faa3e.dol_data.plan_sponsors\`
        WHERE UPPER(sponsor_name) LIKE '%MICROSOFT%'
      )
    `;

    const [custodianResult] = await bigquery.query({
      query: custodianQuery,
      location: 'US'
    });
    console.log(`   Found ${custodianResult[0].total} custodian records for Microsoft\n`);

    // Fourth test: Try the JOIN with proper casting
    console.log('4️⃣ Testing JOIN with custodians:');
    const joinQuery = `
      SELECT
        ps.sponsor_name,
        ps.plan_name,
        cc.provider_other_name as custodian_name,
        CAST(cc.provider_other_ein AS STRING) as custodian_ein,
        ps.participants
      FROM \`trustrails-faa3e.dol_data.plan_sponsors\` ps
      LEFT JOIN \`trustrails-faa3e.dol_data.schedule_c_custodians\` cc
        ON ps.ack_id = cc.ack_id
      WHERE UPPER(ps.sponsor_name) LIKE '%MICROSOFT%'
        AND cc.provider_other_name IS NOT NULL
      LIMIT 5
    `;

    const [joinResult] = await bigquery.query({
      query: joinQuery,
      location: 'US'
    });

    if (joinResult.length === 0) {
      console.log('   ❌ No results from JOIN - checking why...');

      // Debug: Check if ack_ids match
      const debugQuery = `
        SELECT
          ps.ack_id as sponsor_ack,
          cc.ack_id as custodian_ack
        FROM \`trustrails-faa3e.dol_data.plan_sponsors\` ps
        CROSS JOIN (
          SELECT DISTINCT ack_id
          FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\`
          LIMIT 1
        ) cc
        WHERE UPPER(ps.sponsor_name) LIKE '%MICROSOFT%'
        LIMIT 1
      `;

      const [debugResult] = await bigquery.query({
        query: debugQuery,
        location: 'US'
      });

      if (debugResult.length > 0) {
        console.log('\n   Debug: Sample ACK_IDs:');
        console.log(`   Sponsor ACK: ${debugResult[0].sponsor_ack}`);
        console.log(`   Custodian ACK: ${debugResult[0].custodian_ack}`);
      }
    } else {
      joinResult.forEach((row: any) => {
        console.log(`   ${row.sponsor_name} → ${row.custodian_name}`);
      });
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.errors) {
      console.error('Details:', JSON.stringify(error.errors, null, 2));
    }
  }
}

testBigQuery().catch(console.error);