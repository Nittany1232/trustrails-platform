/**
 * Create Plan Sponsor Tables and Views in BigQuery
 * Links employers to their custodians for historical search
 */

import { BigQuery } from '@google-cloud/bigquery';
import * as fs from 'fs';

const PROJECT_ID = 'trustrails-faa3e';
const DATASET_ID = 'dol_data';

async function createSponsorTables() {
  console.log('🏢 Creating Plan Sponsor Tables in BigQuery');
  console.log('='.repeat(60));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Step 1: Create plan_sponsors table from Schedule C data
    console.log('\n📊 Creating plan_sponsors table...');
    
    const createTableQuery = `
      CREATE OR REPLACE TABLE \`${PROJECT_ID}.${DATASET_ID}.plan_sponsors\` AS
      SELECT DISTINCT
        ein_plan_sponsor,
        plan_number,
        plan_name,
        provider_other_name as custodian_name,
        provider_other_ein as custodian_ein,
        provider_other_relation as relation_type,
        provider_other_us_state as custodian_state,
        form_tax_year,
        extraction_date,
        -- Generate searchable sponsor name from plan name
        CASE 
          WHEN plan_name LIKE '%401(K)%' THEN 
            TRIM(REPLACE(REPLACE(UPPER(plan_name), '401(K)', ''), 'PLAN', ''))
          WHEN plan_name LIKE '%RETIREMENT%' THEN
            TRIM(REPLACE(UPPER(plan_name), 'RETIREMENT PLAN', ''))
          ELSE UPPER(plan_name)
        END as sponsor_name_derived
      FROM \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\`
      WHERE ein_plan_sponsor IS NOT NULL
        AND provider_other_name IS NOT NULL
    `;

    await bigquery.query({ query: createTableQuery, location: 'US' });
    console.log('✅ Created plan_sponsors table');

    // Step 2: Create sponsor summary view
    console.log('\n📊 Creating sponsor_summary view...');
    
    const createSummaryView = `
      CREATE OR REPLACE VIEW \`${PROJECT_ID}.${DATASET_ID}.sponsor_summary\` AS
      WITH sponsor_stats AS (
        SELECT 
          ein_plan_sponsor,
          sponsor_name_derived,
          COUNT(DISTINCT plan_number) as plan_count,
          COUNT(DISTINCT provider_other_name) as custodian_count,
          ARRAY_AGG(DISTINCT provider_other_name IGNORE NULLS ORDER BY provider_other_name) as custodians,
          ARRAY_AGG(DISTINCT plan_name IGNORE NULLS LIMIT 5) as plan_names,
          MAX(form_tax_year) as latest_year
        FROM \`${PROJECT_ID}.${DATASET_ID}.plan_sponsors\`
        GROUP BY ein_plan_sponsor, sponsor_name_derived
      )
      SELECT 
        ein_plan_sponsor,
        sponsor_name_derived as sponsor_name,
        plan_count,
        custodian_count,
        custodians[OFFSET(0)] as primary_custodian,
        custodians,
        plan_names,
        latest_year
      FROM sponsor_stats
      WHERE plan_count > 0
      ORDER BY plan_count DESC
    `;

    await bigquery.query({ query: createSummaryView, location: 'US' });
    console.log('✅ Created sponsor_summary view');

    // Step 3: Create sponsor-custodian relationships view
    console.log('\n📊 Creating sponsor_custodian_relationships view...');
    
    const createRelationshipView = `
      CREATE OR REPLACE VIEW \`${PROJECT_ID}.${DATASET_ID}.sponsor_custodian_relationships\` AS
      SELECT 
        ein_plan_sponsor,
        sponsor_name_derived as sponsor_name,
        provider_other_name as custodian_name,
        provider_other_ein as custodian_ein,
        COUNT(*) as plan_count,
        ARRAY_AGG(DISTINCT plan_name IGNORE NULLS LIMIT 3) as sample_plans,
        ARRAY_AGG(DISTINCT provider_other_relation IGNORE NULLS) as relation_types,
        MAX(form_tax_year) as latest_year
      FROM \`${PROJECT_ID}.${DATASET_ID}.plan_sponsors\`
      WHERE ein_plan_sponsor IS NOT NULL 
        AND provider_other_name IS NOT NULL
      GROUP BY 
        ein_plan_sponsor, 
        sponsor_name_derived, 
        provider_other_name, 
        provider_other_ein
      ORDER BY plan_count DESC
    `;

    await bigquery.query({ query: createRelationshipView, location: 'US' });
    console.log('✅ Created sponsor_custodian_relationships view');

    // Step 4: Create popular sponsors materialized table
    console.log('\n📊 Creating popular_sponsors table...');
    
    const createPopularSponsors = `
      CREATE OR REPLACE TABLE \`${PROJECT_ID}.${DATASET_ID}.popular_sponsors\` AS
      WITH ranked_sponsors AS (
        SELECT 
          ein_plan_sponsor,
          sponsor_name_derived as sponsor_name,
          provider_other_name as custodian_name,
          COUNT(*) as record_count,
          ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as rank
        FROM \`${PROJECT_ID}.${DATASET_ID}.plan_sponsors\`
        WHERE ein_plan_sponsor IS NOT NULL
        GROUP BY ein_plan_sponsor, sponsor_name_derived, provider_other_name
      )
      SELECT * FROM ranked_sponsors
      WHERE rank <= 1000  -- Top 1000 sponsors
    `;

    await bigquery.query({ query: createPopularSponsors, location: 'US' });
    console.log('✅ Created popular_sponsors table');

    // Step 5: Get statistics
    console.log('\n📈 Analyzing sponsor data...');
    
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT ein_plan_sponsor) as unique_sponsors,
        COUNT(DISTINCT sponsor_name_derived) as unique_sponsor_names,
        COUNT(DISTINCT CONCAT(ein_plan_sponsor, '-', provider_other_name)) as unique_relationships,
        COUNT(*) as total_records
      FROM \`${PROJECT_ID}.${DATASET_ID}.plan_sponsors\`
    `;

    const [stats] = await bigquery.query({ query: statsQuery, location: 'US' });
    
    console.log('\n📊 Sponsor Data Statistics:');
    console.log('='.repeat(60));
    console.log(`Unique Sponsors (EINs): ${stats[0].unique_sponsors.toLocaleString()}`);
    console.log(`Unique Sponsor Names: ${stats[0].unique_sponsor_names.toLocaleString()}`);
    console.log(`Sponsor-Custodian Relationships: ${stats[0].unique_relationships.toLocaleString()}`);
    console.log(`Total Records: ${stats[0].total_records.toLocaleString()}`);

    // Step 6: Show top sponsors
    const topSponsorsQuery = `
      SELECT 
        sponsor_name,
        primary_custodian,
        plan_count
      FROM \`${PROJECT_ID}.${DATASET_ID}.sponsor_summary\`
      ORDER BY plan_count DESC
      LIMIT 10
    `;

    const [topSponsors] = await bigquery.query({ query: topSponsorsQuery, location: 'US' });
    
    console.log('\n🏆 Top 10 Plan Sponsors:');
    console.log('='.repeat(60));
    topSponsors.forEach((sponsor: any, i: number) => {
      console.log(`${(i + 1).toString().padStart(2)}. ${sponsor.sponsor_name}`);
      console.log(`    Plans: ${sponsor.plan_count} | Custodian: ${sponsor.primary_custodian || 'N/A'}`);
    });

    // Step 7: Test Microsoft search
    console.log('\n🔍 Testing Microsoft search...');
    
    const microsoftQuery = `
      SELECT 
        sponsor_name,
        custodian_name,
        plan_count
      FROM \`${PROJECT_ID}.${DATASET_ID}.sponsor_custodian_relationships\`
      WHERE UPPER(sponsor_name) LIKE '%MICROSOFT%'
      ORDER BY plan_count DESC
      LIMIT 5
    `;

    const [microsoftResults] = await bigquery.query({ query: microsoftQuery, location: 'US' });
    
    if (microsoftResults.length > 0) {
      console.log('\n✅ Microsoft found in sponsor data:');
      microsoftResults.forEach((result: any) => {
        console.log(`  ${result.sponsor_name} → ${result.custodian_name} (${result.plan_count} plans)`);
      });
    } else {
      console.log('⚠️ Microsoft not found in current data (may need historical data)');
    }

    console.log('\n✨ Sponsor tables and views created successfully!');
    console.log('\n📌 Next Steps:');
    console.log('1. Update cache-warmer.ts to include sponsor data');
    console.log('2. Modify search API to query sponsors');
    console.log('3. Load historical DOL data (2020-2023) for better coverage');

  } catch (error: any) {
    console.error('❌ Error creating sponsor tables:', error.message);
    throw error;
  }
}

// Run the creation
createSponsorTables().catch(console.error);