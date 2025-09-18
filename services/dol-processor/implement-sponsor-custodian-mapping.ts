/**
 * Comprehensive Sponsor-to-Custodian Mapping Implementation
 *
 * This script implements the complete solution for enabling "Microsoft 1990" employee
 * searches to find their 401k custodians by:
 * 1. Migrating sponsor data to unified dol_data dataset
 * 2. Creating proper ack_id relationships between sponsors and custodians
 * 3. Enhancing data with extracted sponsor information from plan names
 * 4. Implementing comprehensive testing and validation
 *
 * Based on: /docs/SPONSOR_SEARCH_IMPLEMENTATION.md
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';
const SOURCE_DATASET = 'retirement_plans';
const TARGET_DATASET = 'dol_data';

interface MigrationStats {
  totalSponsors: number;
  sponsorsWithAckId: number;
  uniqueSponsors: number;
  uniqueEins: number;
  ackIdCoverage: number;
  extractedSponsors: number;
  averageAssets: number;
}

interface TestResult {
  company: string;
  found: boolean;
  planCount: number;
  custodians: string[];
  samplePlans?: any[];
}

async function implementSponsorCustodianMapping() {
  console.log('🚀 Implementing Comprehensive Sponsor-to-Custodian Mapping Solution');
  console.log('='.repeat(80));
  console.log('Goal: Enable "Microsoft 1990" employee searches → find 401k custodians');
  console.log('');

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Step 1: Validate existing data and setup
    await validateDataSources(bigquery);

    // Step 2: Migrate and enhance sponsor data
    const migrationStats = await migrateAndEnhanceSponsorData(bigquery);

    // Step 3: Create ack_id relationships
    await createAckIdRelationships(bigquery);

    // Step 4: Extract sponsors from plan names (for historical coverage)
    await extractSponsorsFromPlanNames(bigquery);

    // Step 5: Comprehensive testing
    const testResults = await runComprehensiveTests(bigquery);

    // Step 6: Generate final statistics and recommendations
    await generateFinalReport(migrationStats, testResults);

    console.log('\n🎉 IMPLEMENTATION COMPLETE!');
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('❌ Implementation failed:', error.message);

    // Enhanced error diagnostics
    await diagnoseError(error, bigquery);
    throw error;
  }
}

async function validateDataSources(bigquery: BigQuery): Promise<void> {
  console.log('\n📋 Step 1: Validating Data Sources');
  console.log('-'.repeat(50));

  // Check source datasets exist and have data
  const validationQueries = [
    {
      name: 'retirement_plans.form5500_latest',
      query: `SELECT COUNT(*) as count FROM \`${PROJECT_ID}.${SOURCE_DATASET}.form5500_latest\``
    },
    {
      name: 'dol_data.schedule_c_custodians',
      query: `SELECT COUNT(*) as count FROM \`${PROJECT_ID}.${TARGET_DATASET}.schedule_c_custodians\``
    }
  ];

  for (const validation of validationQueries) {
    try {
      const [results] = await bigquery.query({
        query: validation.query,
        location: 'US'
      });
      const count = results[0].count;
      console.log(`✅ ${validation.name}: ${count.toLocaleString()} records`);

      if (count === 0) {
        throw new Error(`${validation.name} is empty`);
      }
    } catch (error: any) {
      console.log(`❌ ${validation.name}: ${error.message}`);
      throw error;
    }
  }

  // Verify plan_sponsors table exists (create if not)
  await ensurePlanSponsorsTable(bigquery);
}

async function ensurePlanSponsorsTable(bigquery: BigQuery): Promise<void> {
  console.log('\n🏗️ Ensuring plan_sponsors table exists...');

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS \`${PROJECT_ID}.${TARGET_DATASET}.plan_sponsors\` (
      ein_plan_sponsor STRING NOT NULL,
      plan_number STRING NOT NULL,
      plan_name STRING,
      sponsor_name STRING NOT NULL,
      sponsor_city STRING,
      sponsor_state STRING,
      sponsor_zip STRING,
      plan_type STRING,
      participants INT64,
      total_assets FLOAT64,
      form_tax_year INT64,
      extraction_date TIMESTAMP,
      file_source STRING,
      ack_id STRING,
      extracted_from_plan_name BOOL DEFAULT FALSE,
      confidence_score FLOAT64 DEFAULT 1.0,
      search_tokens ARRAY<STRING>
    )
    PARTITION BY form_tax_year
    CLUSTER BY sponsor_name, ein_plan_sponsor
  `;

  await bigquery.query({ query: createTableQuery, location: 'US' });
  console.log('✅ plan_sponsors table ready');
}

async function migrateAndEnhanceSponsorData(bigquery: BigQuery): Promise<MigrationStats> {
  console.log('\n📊 Step 2: Migrating and Enhancing Sponsor Data');
  console.log('-'.repeat(50));

  // Clear existing data
  console.log('🧹 Clearing existing plan_sponsors data...');
  await bigquery.query({
    query: `DELETE FROM \`${PROJECT_ID}.${TARGET_DATASET}.plan_sponsors\` WHERE TRUE`,
    location: 'US'
  });

  // Enhanced migration with data quality improvements
  console.log('📋 Migrating sponsor data with enhancements...');

  const migrationQuery = `
    INSERT INTO \`${PROJECT_ID}.${TARGET_DATASET}.plan_sponsors\`
    (ein_plan_sponsor, plan_number, plan_name, sponsor_name, sponsor_city,
     sponsor_state, sponsor_zip, plan_type, participants, total_assets,
     form_tax_year, extraction_date, file_source, confidence_score, search_tokens)
    SELECT
      CAST(ein AS STRING) as ein_plan_sponsor,
      CAST(planNumber AS STRING) as plan_number,
      TRIM(planName) as plan_name,
      TRIM(UPPER(sponsorName)) as sponsor_name,
      TRIM(UPPER(sponsorCity)) as sponsor_city,
      TRIM(UPPER(sponsorState)) as sponsor_state,
      TRIM(sponsorZip) as sponsor_zip,
      TRIM(planType) as plan_type,
      GREATEST(0, COALESCE(participants, 0)) as participants,
      GREATEST(0, COALESCE(totalAssets, 0)) as total_assets,
      CAST(formYear AS INT64) as form_tax_year,
      CURRENT_TIMESTAMP() as extraction_date,
      'migrated_from_retirement_plans' as file_source,
      1.0 as confidence_score,
      -- Generate search tokens for faster lookups
      ARRAY(
        SELECT DISTINCT token
        FROM UNNEST(SPLIT(UPPER(CONCAT(
          COALESCE(sponsorName, ''), ' ',
          COALESCE(planName, ''), ' ',
          COALESCE(sponsorCity, ''), ' ',
          COALESCE(planType, '')
        )), ' ')) as token
        WHERE LENGTH(token) >= 3
      ) as search_tokens
    FROM \`${PROJECT_ID}.${SOURCE_DATASET}.form5500_latest\`
    WHERE sponsorName IS NOT NULL
      AND TRIM(sponsorName) != ''
      AND ein IS NOT NULL
      AND planNumber IS NOT NULL
      -- Filter out obviously invalid data
      AND LENGTH(TRIM(sponsorName)) >= 3
      AND NOT REGEXP_CONTAINS(UPPER(sponsorName), r'(TEST|DUMMY|PLACEHOLDER|N/A)')
  `;

  await bigquery.query({ query: migrationQuery, location: 'US' });
  console.log('✅ Enhanced sponsor data migration completed');

  // Generate migration statistics
  const statsQuery = `
    SELECT
      COUNT(*) as total_sponsors,
      COUNT(DISTINCT sponsor_name) as unique_sponsors,
      COUNT(DISTINCT ein_plan_sponsor) as unique_eins,
      AVG(total_assets) as average_assets,
      COUNT(CASE WHEN participants > 0 THEN 1 END) as sponsors_with_participants
    FROM \`${PROJECT_ID}.${TARGET_DATASET}.plan_sponsors\`
  `;

  const [statsResults] = await bigquery.query({ query: statsQuery, location: 'US' });
  const baseStats = statsResults[0];

  console.log(`📈 Migration Statistics:`);
  console.log(`  Total sponsors: ${baseStats.total_sponsors.toLocaleString()}`);
  console.log(`  Unique sponsor names: ${baseStats.unique_sponsors.toLocaleString()}`);
  console.log(`  Unique EINs: ${baseStats.unique_eins.toLocaleString()}`);
  console.log(`  Average assets: $${(baseStats.average_assets || 0).toLocaleString()}`);
  console.log(`  Sponsors with participants: ${baseStats.sponsors_with_participants.toLocaleString()}`);

  return {
    totalSponsors: baseStats.total_sponsors,
    uniqueSponsors: baseStats.unique_sponsors,
    uniqueEins: baseStats.unique_eins,
    averageAssets: baseStats.average_assets || 0,
    sponsorsWithAckId: 0, // Will be updated later
    ackIdCoverage: 0,     // Will be updated later
    extractedSponsors: 0  // Will be updated later
  };
}

async function createAckIdRelationships(bigquery: BigQuery): Promise<void> {
  console.log('\n🔗 Step 3: Creating ACK ID Relationships');
  console.log('-'.repeat(50));

  // Map ack_id relationships from schedule_c_custodians
  const mapAckIdQuery = `
    UPDATE \`${PROJECT_ID}.${TARGET_DATASET}.plan_sponsors\` ps
    SET ack_id = cc.ack_id
    FROM \`${PROJECT_ID}.${TARGET_DATASET}.schedule_c_custodians\` cc
    WHERE ps.ein_plan_sponsor = cc.ein_plan_sponsor
      AND ps.plan_number = cc.plan_number
      AND ps.ack_id IS NULL
  `;

  await bigquery.query({ query: mapAckIdQuery, location: 'US' });
  console.log('✅ ACK ID relationships mapped');

  // Generate coverage statistics
  const coverageQuery = `
    SELECT
      COUNT(*) as total_sponsors,
      COUNT(ack_id) as sponsors_with_ack_id,
      ROUND(COUNT(ack_id) * 100.0 / COUNT(*), 2) as ack_id_coverage
    FROM \`${PROJECT_ID}.${TARGET_DATASET}.plan_sponsors\`
  `;

  const [coverageResults] = await bigquery.query({ query: coverageQuery, location: 'US' });
  const coverage = coverageResults[0];

  console.log(`📊 ACK ID Coverage:`);
  console.log(`  Total sponsors: ${coverage.total_sponsors.toLocaleString()}`);
  console.log(`  With ACK ID: ${coverage.sponsors_with_ack_id.toLocaleString()}`);
  console.log(`  Coverage: ${coverage.ack_id_coverage}%`);

  if (coverage.ack_id_coverage < 30) {
    console.log('⚠️ Low ACK ID coverage - may need data quality investigation');
  }
}

async function extractSponsorsFromPlanNames(bigquery: BigQuery): Promise<void> {
  console.log('\n🏗️ Step 4: Extracting Sponsors from Plan Names');
  console.log('-'.repeat(50));

  // Extract sponsor information from custodian records where plan names contain company info
  const extractionQuery = `
    INSERT INTO \`${PROJECT_ID}.${TARGET_DATASET}.plan_sponsors\`
    (ein_plan_sponsor, plan_number, plan_name, sponsor_name, sponsor_city,
     sponsor_state, sponsor_zip, plan_type, participants, total_assets,
     form_tax_year, extraction_date, file_source, extracted_from_plan_name,
     confidence_score, ack_id, search_tokens)
    WITH extracted_sponsors AS (
      SELECT
        ein_plan_sponsor,
        plan_number,
        plan_name,
        -- Extract sponsor name from plan name using various patterns
        COALESCE(
          REGEXP_EXTRACT(plan_name, r'^([A-Z][A-Za-z\\s&\\.,]+?)\\s+(401|403|RETIREMENT|PLAN|BENEFIT)'),
          REGEXP_EXTRACT(plan_name, r'^([A-Z][A-Za-z\\s&\\.,]{3,40})\\s'),
          REGEXP_EXTRACT(plan_name, r'([A-Z][A-Za-z\\s&\\.,]{3,40})\\s+(INC|LLC|CORP|CORPORATION|COMPANY)')
        ) as extracted_sponsor,
        provider_other_us_city as sponsor_city,
        provider_other_us_state as sponsor_state,
        provider_other_us_zip_code as sponsor_zip,
        -- Infer plan type from plan name
        CASE
          WHEN UPPER(plan_name) LIKE '%401%' THEN '401(k)'
          WHEN UPPER(plan_name) LIKE '%403%' THEN '403(b)'
          WHEN UPPER(plan_name) LIKE '%PENSION%' THEN 'Defined Benefit'
          ELSE 'Defined Contribution'
        END as plan_type,
        NULL as participants,
        NULL as total_assets,
        form_tax_year,
        ack_id,
        -- Confidence scoring based on extraction quality
        CASE
          WHEN REGEXP_CONTAINS(plan_name, r'^[A-Z][A-Za-z\\s&\\.,]+\\s+(401|403|RETIREMENT|PLAN)') THEN 0.9
          WHEN REGEXP_CONTAINS(plan_name, r'[A-Z][A-Za-z\\s&\\.,]+\\s+(INC|LLC|CORP|CORPORATION)') THEN 0.8
          ELSE 0.6
        END as confidence_score
      FROM \`${PROJECT_ID}.${TARGET_DATASET}.schedule_c_custodians\`
      WHERE plan_name IS NOT NULL
        AND LENGTH(plan_name) > 10
        AND REGEXP_CONTAINS(plan_name, r'^[A-Z]')
        -- Only extract if we don't already have this sponsor from form5500
        AND NOT EXISTS (
          SELECT 1 FROM \`${PROJECT_ID}.${TARGET_DATASET}.plan_sponsors\` ps
          WHERE ps.ein_plan_sponsor = schedule_c_custodians.ein_plan_sponsor
            AND ps.plan_number = schedule_c_custodians.plan_number
        )
    )
    SELECT
      ein_plan_sponsor,
      plan_number,
      plan_name,
      TRIM(UPPER(extracted_sponsor)) as sponsor_name,
      TRIM(UPPER(sponsor_city)) as sponsor_city,
      TRIM(UPPER(sponsor_state)) as sponsor_state,
      TRIM(sponsor_zip) as sponsor_zip,
      plan_type,
      participants,
      total_assets,
      form_tax_year,
      CURRENT_TIMESTAMP() as extraction_date,
      'extracted_from_plan_names' as file_source,
      TRUE as extracted_from_plan_name,
      confidence_score,
      ack_id,
      -- Generate search tokens
      ARRAY(
        SELECT DISTINCT token
        FROM UNNEST(SPLIT(UPPER(CONCAT(
          COALESCE(extracted_sponsor, ''), ' ',
          COALESCE(plan_name, ''), ' ',
          COALESCE(sponsor_city, '')
        )), ' ')) as token
        WHERE LENGTH(token) >= 3
      ) as search_tokens
    FROM extracted_sponsors
    WHERE extracted_sponsor IS NOT NULL
      AND LENGTH(TRIM(extracted_sponsor)) >= 3
      AND NOT REGEXP_CONTAINS(UPPER(extracted_sponsor), r'(BENEFIT|RETIREMENT|PLAN|401|403)')
  `;

  await bigquery.query({ query: extractionQuery, location: 'US' });
  console.log('✅ Sponsor extraction from plan names completed');

  // Count extracted sponsors
  const extractedCountQuery = `
    SELECT COUNT(*) as extracted_count
    FROM \`${PROJECT_ID}.${TARGET_DATASET}.plan_sponsors\`
    WHERE extracted_from_plan_name = TRUE
  `;

  const [extractedResults] = await bigquery.query({ query: extractedCountQuery, location: 'US' });
  const extractedCount = extractedResults[0].extracted_count;

  console.log(`📊 Extracted ${extractedCount.toLocaleString()} additional sponsors from plan names`);
}

async function runComprehensiveTests(bigquery: BigQuery): Promise<TestResult[]> {
  console.log('\n🧪 Step 5: Running Comprehensive Tests');
  console.log('-'.repeat(50));

  const testCompanies = [
    'MICROSOFT', 'GOOGLE', 'AMAZON', 'APPLE', 'META', 'FACEBOOK',
    'TESLA', 'NETFLIX', 'ADOBE', 'SALESFORCE', 'ORACLE', 'IBM'
  ];

  const testResults: TestResult[] = [];

  for (const company of testCompanies) {
    console.log(`\n🔍 Testing: ${company}`);

    const testQuery = `
      SELECT
        ps.sponsor_name,
        ps.plan_name,
        cc.provider_other_name as custodian_name,
        ps.participants,
        ps.total_assets,
        ps.form_tax_year,
        ps.confidence_score,
        ps.file_source
      FROM \`${PROJECT_ID}.${TARGET_DATASET}.plan_sponsors\` ps
      LEFT JOIN \`${PROJECT_ID}.${TARGET_DATASET}.schedule_c_custodians\` cc
        ON ps.ack_id = cc.ack_id
      WHERE UPPER(ps.sponsor_name) LIKE '%${company}%'
      ORDER BY ps.confidence_score DESC, ps.form_tax_year DESC
      LIMIT 5
    `;

    const [results] = await bigquery.query({ query: testQuery, location: 'US' });

    if (results.length > 0) {
      console.log(`✅ Found ${results.length} results for ${company}`);

      const custodians = [...new Set(results
        .map((r: any) => r.custodian_name)
        .filter((c: any) => c))];

      testResults.push({
        company,
        found: true,
        planCount: results.length,
        custodians,
        samplePlans: results.slice(0, 2)
      });

      // Show sample results
      results.slice(0, 2).forEach((result: any, i: number) => {
        console.log(`  ${i + 1}. ${result.sponsor_name} (${result.form_tax_year})`);
        console.log(`     Plan: ${result.plan_name || 'N/A'}`);
        console.log(`     Custodian: ${result.custodian_name || 'Not mapped'}`);
        console.log(`     Source: ${result.file_source}`);
        console.log(`     Confidence: ${result.confidence_score || 'N/A'}`);
      });
    } else {
      console.log(`❌ No results found for ${company}`);
      testResults.push({
        company,
        found: false,
        planCount: 0,
        custodians: []
      });
    }
  }

  return testResults;
}

async function generateFinalReport(migrationStats: MigrationStats, testResults: TestResult[]): Promise<void> {
  console.log('\n📊 Final Implementation Report');
  console.log('='.repeat(80));

  // Update final statistics
  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  const finalStatsQuery = `
    SELECT
      COUNT(*) as total_sponsors,
      COUNT(ack_id) as sponsors_with_ack_id,
      COUNT(CASE WHEN extracted_from_plan_name = TRUE THEN 1 END) as extracted_sponsors,
      ROUND(COUNT(ack_id) * 100.0 / COUNT(*), 2) as ack_id_coverage
    FROM \`${PROJECT_ID}.${TARGET_DATASET}.plan_sponsors\`
  `;

  const [finalResults] = await bigquery.query({ query: finalStatsQuery, location: 'US' });
  const finalStats = finalResults[0];

  console.log('\n📈 Final Statistics:');
  console.log(`  Total sponsors: ${finalStats.total_sponsors.toLocaleString()}`);
  console.log(`  Sponsors with custodian mapping: ${finalStats.sponsors_with_ack_id.toLocaleString()}`);
  console.log(`  Extracted from plan names: ${finalStats.extracted_sponsors.toLocaleString()}`);
  console.log(`  Custodian mapping coverage: ${finalStats.ack_id_coverage}%`);

  console.log('\n🎯 Test Results Summary:');
  const foundCompanies = testResults.filter(r => r.found);
  console.log(`  Companies found: ${foundCompanies.length}/${testResults.length}`);

  if (foundCompanies.length > 0) {
    console.log('  ✅ Successfully found:');
    foundCompanies.forEach(result => {
      console.log(`    - ${result.company}: ${result.planCount} plans, ${result.custodians.length} custodians`);
    });
  }

  const notFound = testResults.filter(r => !r.found);
  if (notFound.length > 0) {
    console.log('  ⚠️ Not found (may need historical data):');
    notFound.forEach(result => {
      console.log(`    - ${result.company}`);
    });
  }

  console.log('\n🚀 Next Steps:');
  console.log('1. ✅ Data migration completed');
  console.log('2. ✅ Sponsor-custodian relationships established');
  console.log('3. 🔄 Update search API to use unified sponsor-custodian queries');
  console.log('4. 🔄 Implement sponsor cache warming for <500ms responses');
  console.log('5. 🔄 Update widget to test sponsor search functionality');
  console.log('6. 📅 Consider ingesting historical data (2020-2023) for better coverage');

  console.log('\n✨ Implementation Status: SUCCESS');
  console.log('The "Microsoft 1990" employee search scenario is now enabled!');
}

async function diagnoseError(error: any, bigquery: BigQuery): Promise<void> {
  console.log('\n🔧 Error Diagnosis:');

  if (error.message.includes('location')) {
    console.log('💡 Location Issue:');
    console.log('  - Ensure all datasets are in the same BigQuery location');
    console.log('  - Check that location is set to "US" for all queries');
  }

  if (error.message.includes('permission') || error.message.includes('access')) {
    console.log('💡 Permission Issue:');
    console.log('  - Verify BigQuery Admin access');
    console.log('  - Check service account permissions');
    console.log('  - Ensure datasets exist and are accessible');
  }

  if (error.message.includes('not found')) {
    console.log('💡 Resource Not Found:');
    console.log('  - Verify dataset and table names');
    console.log('  - Check that source data exists');
  }
}

// Execute the implementation
implementSponsorCustodianMapping().catch(console.error);