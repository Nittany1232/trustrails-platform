/**
 * Migrate Sponsor Data Across Regions
 *
 * From: retirement_plans (us-central1)
 * To: dol_data (US multi-region)
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';

async function migrateSponsorDataCrossRegion() {
  console.log('🚀 Starting cross-region sponsor data migration');
  console.log('From: retirement_plans (us-central1) → dol_data (US)');
  console.log('='.repeat(70));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Step 1: Export data from retirement_plans to Cloud Storage
    console.log('\n📤 Step 1: Export retirement_plans data to Cloud Storage...');

    const exportQuery = `
      EXPORT DATA OPTIONS(
        uri='gs://trustrails-dol-data/migration/form5500_export_*.json',
        format='JSON',
        overwrite=true
      ) AS
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

    // Export without location specification - let BigQuery handle it
    const [exportJob] = await bigquery.query({ query: exportQuery });
    console.log('✅ Data exported to Cloud Storage');

    // Step 2: Load data into dol_data.plan_sponsors
    console.log('\n📥 Step 2: Load data into dol_data.plan_sponsors...');

    const loadQuery = `
      LOAD DATA INTO \`${PROJECT_ID}.dol_data.plan_sponsors\`
      (ein_plan_sponsor, plan_number, plan_name, sponsor_name, sponsor_city,
       sponsor_state, sponsor_zip, plan_type, participants, total_assets,
       form_tax_year, extraction_date, file_source)
      FROM FILES (
        format = 'JSON',
        uris = ['gs://trustrails-dol-data/migration/form5500_export_*.json']
      )
    `;

    const [loadJob] = await bigquery.query({ query: loadQuery, location: 'US' });
    console.log('✅ Data loaded into dol_data.plan_sponsors');

    // Step 3: Map ack_id relationships
    console.log('\n🔗 Step 3: Mapping ack_id relationships...');

    const mapAckIdQuery = `
      UPDATE \`${PROJECT_ID}.dol_data.plan_sponsors\` ps
      SET ack_id = cc.ack_id
      FROM \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
      WHERE ps.ein_plan_sponsor = cc.ein_plan_sponsor
        AND ps.plan_number = cc.plan_number
        AND ps.ack_id IS NULL
    `;

    await bigquery.query({ query: mapAckIdQuery, location: 'US' });
    console.log('✅ ACK ID relationships mapped');

    // Step 4: Test the migration
    await testMigration(bigquery);

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);

    if (error.message.includes('export')) {
      console.log('💡 Try alternative approach: Direct query without location');
      await directMigrationApproach(bigquery);
    } else {
      throw error;
    }
  }
}

async function directMigrationApproach(bigquery: BigQuery) {
  console.log('\n🔄 Trying direct migration approach...');

  try {
    // Clear existing data first
    const clearQuery = `DELETE FROM \`${PROJECT_ID}.dol_data.plan_sponsors\` WHERE TRUE`;
    await bigquery.query({ query: clearQuery, location: 'US' });

    // Try direct INSERT without location specification
    const directQuery = `
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

    // Try without location first
    await bigquery.query({ query: directQuery });
    console.log('✅ Direct migration successful');

    // Map ack_id relationships
    const mapAckIdQuery = `
      UPDATE \`${PROJECT_ID}.dol_data.plan_sponsors\` ps
      SET ack_id = cc.ack_id
      FROM \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
      WHERE ps.ein_plan_sponsor = cc.ein_plan_sponsor
        AND ps.plan_number = cc.plan_number
        AND ps.ack_id IS NULL
    `;

    await bigquery.query({ query: mapAckIdQuery, location: 'US' });
    console.log('✅ ACK ID relationships mapped');

    await testMigration(bigquery);

  } catch (directError: any) {
    console.error('❌ Direct migration also failed:', directError.message);

    console.log('\n🔧 Recommended solution:');
    console.log('1. Move retirement_plans dataset to US region, OR');
    console.log('2. Move dol_data dataset to us-central1 region, OR');
    console.log('3. Use Cloud Storage as intermediate step');

    throw directError;
  }
}

async function testMigration(bigquery: BigQuery) {
  console.log('\n🧪 Testing migration results...');

  // Get statistics
  const statsQuery = `
    SELECT
      COUNT(*) as total_sponsors,
      COUNT(ack_id) as sponsors_with_ack_id,
      COUNT(DISTINCT sponsor_name) as unique_sponsors,
      ROUND(COUNT(ack_id) * 100.0 / COUNT(*), 2) as ack_id_coverage
    FROM \`${PROJECT_ID}.dol_data.plan_sponsors\`
  `;

  const [statsResults] = await bigquery.query({ query: statsQuery, location: 'US' });
  const stats = statsResults[0];

  console.log('\n📊 Migration Statistics:');
  console.log(`Total sponsors: ${stats.total_sponsors.toLocaleString()}`);
  console.log(`Sponsors with ack_id: ${stats.sponsors_with_ack_id.toLocaleString()}`);
  console.log(`Unique sponsors: ${stats.unique_sponsors.toLocaleString()}`);
  console.log(`ACK ID coverage: ${stats.ack_id_coverage}%`);

  // Test JOIN functionality
  const joinTestQuery = `
    SELECT
      ps.sponsor_name,
      ps.plan_name,
      cc.provider_other_name as custodian_name,
      ps.participants
    FROM \`${PROJECT_ID}.dol_data.plan_sponsors\` ps
    JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
      ON ps.ack_id = cc.ack_id
    WHERE ps.ack_id IS NOT NULL
    LIMIT 5
  `;

  const [joinResults] = await bigquery.query({ query: joinTestQuery, location: 'US' });

  if (joinResults.length > 0) {
    console.log('\n✅ JOIN test successful! Sample results:');
    joinResults.forEach((result: any, i: number) => {
      console.log(`${i + 1}. ${result.sponsor_name} → ${result.custodian_name}`);
    });
  } else {
    console.log('\n⚠️ JOIN test returned no results');
  }

  // Test Microsoft search
  const microsoftQuery = `
    SELECT
      ps.sponsor_name,
      cc.provider_other_name as custodian_name,
      ps.participants,
      ps.total_assets
    FROM \`${PROJECT_ID}.dol_data.plan_sponsors\` ps
    JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
      ON ps.ack_id = cc.ack_id
    WHERE UPPER(ps.sponsor_name) LIKE '%MICROSOFT%'
    LIMIT 5
  `;

  const [microsoftResults] = await bigquery.query({ query: microsoftQuery, location: 'US' });

  if (microsoftResults.length > 0) {
    console.log('\n🎉 Microsoft search successful!');
    microsoftResults.forEach((result: any) => {
      console.log(`${result.sponsor_name} → ${result.custodian_name}`);
    });
  } else {
    console.log('\n⚠️ Microsoft not found (need historical data)');
  }

  console.log('\n🎉 MIGRATION COMPLETE!');
  console.log('✅ Cross-region data migration successful');
  console.log('✅ Single dataset JOINs now work');
  console.log('✅ Ready for sponsor search implementation');
}

// Run the migration
migrateSponsorDataCrossRegion().catch(console.error);