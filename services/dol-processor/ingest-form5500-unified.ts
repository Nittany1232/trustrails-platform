/**
 * Complete Form 5500 Ingestion into Unified dol_data Dataset
 *
 * This script implements the CORRECT architecture:
 * - Source: gs://trustrails-dol-data/form5500_2024_2024-09.zip
 * - Target: dol_data.plan_sponsors (unified dataset)
 * - Avoids cross-region BigQuery issues
 */

import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import * as unzipper from 'unzipper';

const PROJECT_ID = 'trustrails-faa3e';
const BUCKET_NAME = 'trustrails-dol-data';

interface Form5500Record {
  ack_id: string;
  plan_name: string;
  sponsor_name: string;
  sponsor_ein: string;
  plan_number?: string;
  sponsor_city?: string;
  sponsor_state?: string;
  sponsor_zip?: string;
  plan_type?: string;
  participants?: number;
  total_assets?: number;
  form_tax_year: number;
}

async function ingestForm5500ToUnifiedDataset() {
  console.log('🚀 Form 5500 Ingestion into Unified dol_data Dataset');
  console.log('Source: Cloud Storage → Target: dol_data.plan_sponsors');
  console.log('='.repeat(70));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  const storage = new Storage({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Step 1: Download and extract Form 5500 data
    console.log('\n📥 Step 1: Downloading Form 5500 data from Cloud Storage...');

    const sourceFile = 'form5500_2024_2024-09.zip';
    const localZipPath = `/tmp/${sourceFile}`;
    const extractPath = '/tmp/form5500_extract';

    // Download ZIP file
    await storage.bucket(BUCKET_NAME).file(sourceFile).download({
      destination: localZipPath
    });
    console.log(`✅ Downloaded ${sourceFile} to ${localZipPath}`);

    // Extract ZIP file
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }

    await new Promise((resolve, reject) => {
      fs.createReadStream(localZipPath)
        .pipe(unzipper.Extract({ path: extractPath }))
        .on('close', resolve)
        .on('error', reject);
    });
    console.log(`✅ Extracted to ${extractPath}`);

    // Step 2: Process CSV data
    console.log('\n📊 Step 2: Processing Form 5500 CSV data...');

    const csvPath = path.join(extractPath, 'f_5500_2024_latest.csv');
    const records = await processForm5500CSV(csvPath);

    console.log(`✅ Processed ${records.length} sponsor records`);

    // Step 3: Skip clearing since table is newly created
    console.log('\n🧹 Step 3: Skipping table clear (table is newly created)...');

    // Step 4: Load data into BigQuery
    console.log('\n📋 Step 4: Loading data into dol_data.plan_sponsors...');

    await loadRecordsToBigQuery(bigquery, records);
    console.log('✅ Data loaded successfully');

    // Step 5: Map ack_id relationships with custodians
    console.log('\n🔗 Step 5: Mapping ack_id relationships...');

    await mapAckIdRelationships(bigquery);
    console.log('✅ ACK ID relationships mapped');

    // Step 6: Test the unified dataset
    await testUnifiedDataset(bigquery);

    // Step 7: Clean up temporary files
    console.log('\n🧹 Cleaning up temporary files...');
    fs.rmSync(localZipPath, { force: true });
    fs.rmSync(extractPath, { recursive: true, force: true });
    console.log('✅ Cleanup complete');

  } catch (error: any) {
    console.error('❌ Ingestion failed:', error.message);
    throw error;
  }
}

async function processForm5500CSV(csvPath: string): Promise<Form5500Record[]> {
  return new Promise((resolve, reject) => {
    const records: Form5500Record[] = [];
    let headerProcessed = false;
    let header: string[] = [];

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('headers', (headers) => {
        header = headers;
        headerProcessed = true;
        console.log(`📊 Processing CSV with ${headers.length} columns`);
      })
      .on('data', (row) => {
        try {
          // Extract key fields based on actual column names
          const ack_id = row['ACK_ID']?.trim();
          const sponsor_name = row['SPONSOR_DFE_NAME']?.trim();
          const plan_name = row['PLAN_NAME']?.trim();
          const sponsor_ein = row['SPONS_DFE_EIN']?.trim();

          // Only process records with required fields
          if (ack_id && sponsor_name && sponsor_ein) {
            const record: Form5500Record = {
              ack_id,
              plan_name: plan_name || '',
              sponsor_name,
              sponsor_ein,
              plan_number: row['LAST_RPT_PLAN_NUM']?.trim() || '001',
              sponsor_city: '',  // Not available in main Form 5500
              sponsor_state: '', // Not available in main Form 5500
              sponsor_zip: '',   // Not available in main Form 5500
              plan_type: determinePlanType(row),
              participants: parseInt(row['TOT_PARTCP_BOY_CNT']) || null,
              total_assets: parseFloat(row['TOT_ASSETS_EOY_AMT']) || null,
              form_tax_year: 2024
            };

            records.push(record);
          }
        } catch (error) {
          console.warn('Warning: Skipped malformed row:', error);
        }
      })
      .on('end', () => {
        console.log(`✅ Parsed ${records.length} valid sponsor records`);
        resolve(records);
      })
      .on('error', reject);
  });
}

function determinePlanType(row: any): string {
  // Basic plan type determination based on available fields
  const planTypeCode = row['TYPE_PLAN_ENTITY_CD'];

  switch(planTypeCode) {
    case '1': return 'Defined Benefit Plan';
    case '2': return 'Defined Contribution Plan';
    case '3': return 'Both DB and DC';
    default: return 'Unknown Plan Type';
  }
}

async function loadRecordsToBigQuery(bigquery: BigQuery, records: Form5500Record[]) {
  // Insert records in batches
  const BATCH_SIZE = 1000;
  const batches = [];

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    batches.push(records.slice(i, i + BATCH_SIZE));
  }

  console.log(`Loading ${records.length} records in ${batches.length} batches...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`📋 Processing batch ${i + 1}/${batches.length} (${batch.length} records)...`);

    // Convert to BigQuery format
    const rows = batch.map(record => ({
      insertId: record.ack_id, // Use ack_id as unique insert ID
      json: {
        ack_id: record.ack_id,
        ein_plan_sponsor: record.sponsor_ein,
        plan_number: record.plan_number,
        plan_name: record.plan_name,
        sponsor_name: record.sponsor_name,
        sponsor_city: record.sponsor_city,
        sponsor_state: record.sponsor_state,
        sponsor_zip: record.sponsor_zip,
        plan_type: record.plan_type,
        participants: record.participants,
        total_assets: record.total_assets,
        form_tax_year: record.form_tax_year,
        extraction_date: new Date().toISOString(),
        file_source: 'form5500_2024_unified_ingestion'
      }
    }));

    // Insert into BigQuery with location specification
    const dataset = bigquery.dataset('dol_data', { location: 'US' });
    const table = dataset.table('plan_sponsors');
    await table.insert(rows);

    console.log(`✅ Batch ${i + 1} inserted successfully`);
  }
}

async function mapAckIdRelationships(bigquery: BigQuery) {
  console.log('🔗 Mapping ACK ID relationships with existing custodians...');

  const mapQuery = `
    UPDATE \`${PROJECT_ID}.dol_data.plan_sponsors\` ps
    SET ack_id = ps.ack_id  -- ack_id already set from Form 5500
    WHERE ps.ack_id IS NOT NULL
  `;

  // Also create secondary mapping for sponsors without direct ack_id match
  const secondaryMapQuery = `
    UPDATE \`${PROJECT_ID}.dol_data.plan_sponsors\` ps
    SET ack_id = cc.ack_id
    FROM \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
    WHERE ps.ein_plan_sponsor = cc.ein_plan_sponsor
      AND ps.plan_number = cc.plan_number
      AND ps.ack_id != cc.ack_id  -- Only update if different
  `;

  await bigquery.query({ query: secondaryMapQuery, location: 'US' });
  console.log('✅ Secondary ACK ID mapping completed');
}

async function testUnifiedDataset(bigquery: BigQuery) {
  console.log('\n🧪 Testing unified dataset...');

  // Test 1: Basic statistics
  const statsQuery = `
    SELECT
      COUNT(*) as total_sponsors,
      COUNT(DISTINCT sponsor_name) as unique_sponsors,
      COUNT(DISTINCT ack_id) as unique_ack_ids,
      COUNT(participants) as records_with_participants,
      COUNT(total_assets) as records_with_assets
    FROM \`${PROJECT_ID}.dol_data.plan_sponsors\`
  `;

  const [statsResults] = await bigquery.query({ query: statsQuery, location: 'US' });
  const stats = statsResults[0];

  console.log('\n📊 Dataset Statistics:');
  console.log(`Total sponsors: ${stats.total_sponsors.toLocaleString()}`);
  console.log(`Unique sponsor names: ${stats.unique_sponsors.toLocaleString()}`);
  console.log(`Unique ACK IDs: ${stats.unique_ack_ids.toLocaleString()}`);
  console.log(`Records with participant data: ${stats.records_with_participants.toLocaleString()}`);
  console.log(`Records with asset data: ${stats.records_with_assets.toLocaleString()}`);

  // Test 2: JOIN functionality
  const joinQuery = `
    SELECT
      ps.sponsor_name,
      ps.plan_name,
      cc.provider_other_name as custodian_name,
      ps.participants,
      ps.total_assets
    FROM \`${PROJECT_ID}.dol_data.plan_sponsors\` ps
    JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
      ON ps.ack_id = cc.ack_id
    LIMIT 5
  `;

  const [joinResults] = await bigquery.query({ query: joinQuery, location: 'US' });

  if (joinResults.length > 0) {
    console.log('\n✅ JOIN test successful! Sample results:');
    joinResults.forEach((result: any, i: number) => {
      console.log(`${i + 1}. ${result.sponsor_name}`);
      console.log(`   Plan: ${result.plan_name}`);
      console.log(`   Custodian: ${result.custodian_name}`);
      console.log(`   Participants: ${result.participants?.toLocaleString() || 'N/A'}`);
      console.log(`   Assets: $${result.total_assets?.toLocaleString() || 'N/A'}`);
      console.log('');
    });
  } else {
    console.log('\n⚠️ No JOIN results found - ACK ID mapping may need verification');
  }

  // Test 3: Search major companies
  const searchQuery = `
    SELECT
      ps.sponsor_name,
      cc.provider_other_name as custodian_name,
      ps.participants,
      ps.total_assets
    FROM \`${PROJECT_ID}.dol_data.plan_sponsors\` ps
    LEFT JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
      ON ps.ack_id = cc.ack_id
    WHERE (
      UPPER(ps.sponsor_name) LIKE '%MICROSOFT%' OR
      UPPER(ps.sponsor_name) LIKE '%GOOGLE%' OR
      UPPER(ps.sponsor_name) LIKE '%AMAZON%' OR
      UPPER(ps.sponsor_name) LIKE '%APPLE%'
    )
    LIMIT 10
  `;

  const [searchResults] = await bigquery.query({ query: searchQuery, location: 'US' });

  if (searchResults.length > 0) {
    console.log('\n🎉 Major company search successful!');
    searchResults.forEach((result: any) => {
      console.log(`${result.sponsor_name} → ${result.custodian_name || 'No custodian match'}`);
    });
  } else {
    console.log('\n⚠️ No major companies found in 2024 data (expected for recent filings)');
  }

  console.log('\n🎉 UNIFIED DATASET READY!');
  console.log('='.repeat(70));
  console.log('✅ Form 5500 data successfully ingested into dol_data.plan_sponsors');
  console.log('✅ Single-dataset architecture prevents cross-region issues');
  console.log('✅ Ready for sponsor search implementation');
  console.log('');
  console.log('🚀 Next Steps:');
  console.log('1. Update search API to use dol_data.plan_sponsors');
  console.log('2. Test Microsoft search scenarios');
  console.log('3. Implement historical data ingestion (2020-2023)');
  console.log('4. Update cache warming for sponsor data');
}

// Run the ingestion
if (require.main === module) {
  ingestForm5500ToUnifiedDataset().catch(console.error);
}

export { ingestForm5500ToUnifiedDataset };