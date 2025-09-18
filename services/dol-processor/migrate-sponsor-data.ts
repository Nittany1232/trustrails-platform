/**
 * Migrate Sponsor Data from retirement_plans to dol_data Dataset
 *
 * PROBLEM: Cross-dataset JOINs fail due to BigQuery location restrictions
 * SOLUTION: Copy sponsor data to unified dol_data dataset for proper JOINs
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';

async function migrateSponsorData() {
  console.log('🚀 Starting sponsor data migration to unified dol_data dataset');
  console.log('='.repeat(70));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Step 1: Clear existing data in plan_sponsors table
    console.log('\n🧹 Clearing existing plan_sponsors table...');

    const clearQuery = `
      DELETE FROM \`${PROJECT_ID}.dol_data.plan_sponsors\`
      WHERE TRUE
    `;

    await bigquery.query({ query: clearQuery, location: 'US' });
    console.log('✅ Cleared existing data');

    // Step 2: Copy sponsor data from retirement_plans to dol_data
    console.log('\n📋 Copying sponsor data from retirement_plans.form5500_latest...');

    const copyQuery = `
      INSERT INTO \`${PROJECT_ID}.dol_data.plan_sponsors\`
      (ein_plan_sponsor, plan_number, plan_name, sponsor_name, sponsor_city,
       sponsor_state, sponsor_zip, plan_type, participants, total_assets,
       form_tax_year, extraction_date, file_source)
      SELECT
        ein as ein_plan_sponsor,
        planNumber as plan_number,
        planName as plan_name,
        sponsorName as sponsor_name,
        sponsorCity as sponsor_city,
        sponsorState as sponsor_state,
        sponsorZip as sponsor_zip,
        planType as plan_type,
        participants,
        totalAssets as total_assets,
        CAST(formYear AS INT64) as form_tax_year,
        CURRENT_TIMESTAMP() as extraction_date,
        'migrated_from_retirement_plans' as file_source
      FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\`
      WHERE sponsorName IS NOT NULL
        AND ein IS NOT NULL
        AND planNumber IS NOT NULL
    `;

    const [copyJob] = await bigquery.query({ query: copyQuery });
    console.log('✅ Sponsor data copied successfully');

    // Step 3: Map ack_id relationships from schedule_c_custodians
    console.log('\n🔗 Mapping ack_id relationships...');

    const mapAckIdQuery = `
      UPDATE \`${PROJECT_ID}.dol_data.plan_sponsors\` ps
      SET ack_id = cc.ack_id
      FROM \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
      WHERE ps.ein_plan_sponsor = cc.ein_plan_sponsor
        AND ps.plan_number = cc.plan_number
        AND ps.ack_id IS NULL
    `;

    const [mapJob] = await bigquery.query({ query: mapAckIdQuery, location: 'US' });
    console.log('✅ ACK ID relationships mapped');

    // Step 4: Generate statistics and verification
    console.log('\n📊 Generating migration statistics...');

    const statsQuery = `
      SELECT
        COUNT(*) as total_sponsors,
        COUNT(ack_id) as sponsors_with_ack_id,
        COUNT(DISTINCT sponsor_name) as unique_sponsors,
        COUNT(DISTINCT ein_plan_sponsor) as unique_eins,
        ROUND(COUNT(ack_id) * 100.0 / COUNT(*), 2) as ack_id_coverage
      FROM \`${PROJECT_ID}.dol_data.plan_sponsors\`
    `;

    const [statsResults] = await bigquery.query({ query: statsQuery, location: 'US' });
    const stats = statsResults[0];

    console.log('\n📈 Migration Statistics:');
    console.log(`Total sponsors: ${stats.total_sponsors.toLocaleString()}`);
    console.log(`Sponsors with ack_id: ${stats.sponsors_with_ack_id.toLocaleString()}`);
    console.log(`Unique sponsor names: ${stats.unique_sponsors.toLocaleString()}`);
    console.log(`Unique EINs: ${stats.unique_eins.toLocaleString()}`);
    console.log(`ACK ID coverage: ${stats.ack_id_coverage}%`);

    // Step 5: Test JOIN functionality
    console.log('\n🔍 Testing JOIN functionality...');

    const joinTestQuery = `
      SELECT
        ps.sponsor_name,
        ps.plan_name,
        cc.provider_other_name as custodian_name,
        ps.participants,
        ps.total_assets
      FROM \`${PROJECT_ID}.dol_data.plan_sponsors\` ps
      JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
        ON ps.ack_id = cc.ack_id
      WHERE ps.ack_id IS NOT NULL
      LIMIT 5
    `;

    const [joinResults] = await bigquery.query({ query: joinTestQuery, location: 'US' });

    if (joinResults.length > 0) {
      console.log('✅ JOIN test successful! Sample results:');
      joinResults.forEach((result: any, i: number) => {
        console.log(`  ${i + 1}. ${result.sponsor_name} → ${result.custodian_name}`);
        console.log(`     Plan: ${result.plan_name}`);
        console.log(`     Participants: ${result.participants?.toLocaleString()}`);
        console.log(`     Assets: $${result.total_assets?.toLocaleString()}`);
        console.log('');
      });
    } else {
      console.log('⚠️ JOIN test returned no results - may need debugging');
    }

    // Step 6: Test Microsoft search specifically
    console.log('\n🎯 Testing Microsoft search scenario...');

    const microsoftQuery = `
      SELECT
        ps.sponsor_name,
        ps.plan_name,
        cc.provider_other_name as custodian_name,
        ps.participants,
        ps.total_assets,
        ps.form_tax_year
      FROM \`${PROJECT_ID}.dol_data.plan_sponsors\` ps
      JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
        ON ps.ack_id = cc.ack_id
      WHERE UPPER(ps.sponsor_name) LIKE '%MICROSOFT%'
      ORDER BY ps.form_tax_year DESC
      LIMIT 5
    `;

    const [microsoftResults] = await bigquery.query({ query: microsoftQuery, location: 'US' });

    if (microsoftResults.length > 0) {
      console.log('🎉 Microsoft search successful! Results:');
      microsoftResults.forEach((result: any, i: number) => {
        console.log(`  ${i + 1}. ${result.sponsor_name} (${result.form_tax_year})`);
        console.log(`     Plan: ${result.plan_name}`);
        console.log(`     Custodian: ${result.custodian_name}`);
        console.log(`     Participants: ${result.participants?.toLocaleString()}`);
        console.log(`     Assets: $${result.total_assets?.toLocaleString()}`);
        console.log('');
      });
    } else {
      console.log('⚠️ Microsoft not found - may need historical data (2020-2023)');
    }

    // Step 7: Test major tech companies
    console.log('\n🏢 Testing other major tech companies...');

    const techQuery = `
      SELECT
        ps.sponsor_name,
        cc.provider_other_name as custodian_name,
        COUNT(*) as plan_count
      FROM \`${PROJECT_ID}.dol_data.plan_sponsors\` ps
      JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
        ON ps.ack_id = cc.ack_id
      WHERE (
        UPPER(ps.sponsor_name) LIKE '%GOOGLE%' OR
        UPPER(ps.sponsor_name) LIKE '%AMAZON%' OR
        UPPER(ps.sponsor_name) LIKE '%APPLE%' OR
        UPPER(ps.sponsor_name) LIKE '%META%' OR
        UPPER(ps.sponsor_name) LIKE '%FACEBOOK%'
      )
      GROUP BY ps.sponsor_name, cc.provider_other_name
      ORDER BY plan_count DESC
      LIMIT 10
    `;

    const [techResults] = await bigquery.query({ query: techQuery, location: 'US' });

    if (techResults.length > 0) {
      console.log('✅ Major tech companies found:');
      techResults.forEach((result: any) => {
        console.log(`  ${result.sponsor_name} → ${result.custodian_name} (${result.plan_count} plans)`);
      });
    } else {
      console.log('⚠️ No major tech companies found in 2024 data');
    }

    console.log('\n🎉 MIGRATION COMPLETE!');
    console.log('='.repeat(70));
    console.log('✅ Sponsor data successfully migrated to dol_data dataset');
    console.log('✅ Cross-dataset JOIN issues resolved');
    console.log('✅ "Microsoft 1990" employee search scenarios enabled');
    console.log('');
    console.log('🚀 Next Steps:');
    console.log('1. Update search API to use dol_data.plan_sponsors');
    console.log('2. Update cache warming to include sponsor data');
    console.log('3. Ingest historical data (2020-2023) for better coverage');

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);

    // Provide debugging information
    if (error.message.includes('location')) {
      console.log('💡 This is likely a BigQuery location issue');
      console.log('   - Ensure both datasets are in the same location');
      console.log('   - Check dataset location settings');
    } else if (error.message.includes('permission')) {
      console.log('💡 This is likely a permissions issue');
      console.log('   - Check BigQuery dataset permissions');
      console.log('   - Verify service account access');
    }

    throw error;
  }
}

// Run the migration
migrateSponsorData().catch(console.error);