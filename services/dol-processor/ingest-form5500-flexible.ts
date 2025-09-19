/**
 * Flexible Form 5500 Ingestion Script for Any Year
 *
 * Usage:
 *   npx tsx ingest-form5500-flexible.ts 2021
 *   npx tsx ingest-form5500-flexible.ts 2020
 *   npx tsx ingest-form5500-flexible.ts 2019
 *
 * CRITICAL REQUIREMENTS (proven from 2022-2024 ingestions):
 * 1. Convert EIN and plan_number to INTEGER (BigQuery schema requirement)
 * 2. Use direct object format for table.insert() (NO insertId/json wrapper)
 * 3. Unified table structure across all years
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
  // Enhanced fields for improved search relevance
  is_final_filing?: boolean;
  active_participants?: number;
  plan_effective_date?: string;
  business_code?: string;
  filing_status?: string;
}

function determinePlanType(row: any): string {
  const planTypeCode = row['TYPE_PLAN_ENTITY_CD'];
  switch(planTypeCode) {
    case '1': return 'Defined Benefit Plan';
    case '2': return 'Defined Contribution Plan';
    case '3': return 'Both DB and DC';
    default: return 'Unknown Plan Type';
  }
}

function parseFilingIndicator(value: any): boolean | undefined {
  if (!value || value === '') return undefined;
  const str = value.toString().trim();
  if (str === '1' || str.toLowerCase() === 'y' || str.toLowerCase() === 'yes') return true;
  if (str === '0' || str.toLowerCase() === 'n' || str.toLowerCase() === 'no') return false;
  return undefined;
}

function parseActiveParticipants(value: any): number | undefined {
  if (!value || value === '') return undefined;
  const num = parseInt(value.toString().trim());
  return isNaN(num) || num < 0 ? undefined : num;
}

function parsePlanEffectiveDate(value: any): string | undefined {
  if (!value || value === '') return undefined;
  const str = value.toString().trim();

  // Handle date formats (YYYY-MM-DD)
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return str;
  }

  // Handle numeric codes (like "501", "502", etc.)
  if (str.match(/^\d{3,4}$/)) {
    return str;
  }

  return undefined;
}

function parseBusinessCode(value: any): string | undefined {
  if (!value || value === '') return undefined;
  const str = value.toString().trim();
  return str.length > 0 ? str : undefined;
}

function parseFilingStatus(value: any): string | undefined {
  if (!value || value === '') return undefined;
  const str = value.toString().trim();
  return str.length > 0 ? str : undefined;
}

function isValidRecord(row: any): boolean {
  if (!row['ACK_ID'] || !row['SPONSOR_DFE_NAME'] || !row['SPONS_DFE_EIN']) {
    return false;
  }

  const sponsorName = row['SPONSOR_DFE_NAME'].toString().trim();
  if (sponsorName.length < 3) {
    return false;
  }

  // Filter out test/dummy data
  const testPatterns = ['TEST', 'DUMMY', 'PLACEHOLDER', 'N/A'];
  if (testPatterns.some(pattern => sponsorName.toUpperCase().includes(pattern))) {
    return false;
  }

  return true;
}

async function processForm5500CSV(csvPath: string, year: number): Promise<Form5500Record[]> {
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
              form_tax_year: year, // Use the provided year
              // Enhanced fields for better search relevance
              is_final_filing: parseFilingIndicator(row['FINAL_FILING_IND']),
              active_participants: parseActiveParticipants(row['TOT_ACTIVE_PARTCP_CNT']),
              plan_effective_date: parsePlanEffectiveDate(row['PLAN_EFF_DATE']),
              business_code: parseBusinessCode(row['BUSINESS_CODE']),
              filing_status: parseFilingStatus(row['TYPE_DFE_PLAN_ENTITY_CD'])
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

    // CRITICAL: Direct object format, NO insertId/json wrapper
    const rows = batch.map(record => ({
      ack_id: record.ack_id,
      ein_plan_sponsor: parseInt(record.sponsor_ein) || null,  // Convert to INTEGER
      plan_number: parseInt(record.plan_number) || null,  // Convert to INTEGER
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
      file_source: `form5500_${record.form_tax_year}_ingestion`,
      // Enhanced fields for better search relevance
      is_final_filing: record.is_final_filing,
      active_participants: record.active_participants,
      plan_effective_date: record.plan_effective_date,
      business_code: record.business_code,
      filing_status: record.filing_status
    }));

    // Insert into BigQuery with location specification
    const dataset = bigquery.dataset('dol_data', { location: 'US' });
    const table = dataset.table('plan_sponsors');
    await table.insert(rows);

    console.log(`✅ Batch ${i + 1} inserted successfully`);
  }
}

async function downloadAndExtractData(storage: Storage, year: number): Promise<{ csvPath: string, extractPath: string }> {
  const sourceFile = `${year}/F_5500_${year}_Latest.zip`;
  const localZipPath = `/tmp/form5500_${year}.zip`;
  const extractPath = `/tmp/form5500_${year}_extract`;

  console.log(`\n📥 Downloading ${year} Form 5500 data from Cloud Storage...`);

  // Check if file exists
  const [exists] = await storage.bucket(BUCKET_NAME).file(sourceFile).exists();

  if (!exists) {
    // Try to download from DOL website first
    console.log(`⚠️  ${year} data not found in Cloud Storage. Attempting to download from DOL...`);

    const dolUrl = `https://askebsa.dol.gov/FOIA%20Files/${year}/Latest/F_5500_${year}_Latest.zip`;
    console.log(`📥 Downloading from: ${dolUrl}`);

    // Download from DOL using wget
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      await execAsync(`wget -nv "${dolUrl}" -O ${localZipPath}`);
      console.log(`✅ Downloaded from DOL to ${localZipPath}`);

      // Upload to Cloud Storage for future use
      console.log(`☁️  Uploading to Cloud Storage for future use...`);
      await storage.bucket(BUCKET_NAME).upload(localZipPath, {
        destination: sourceFile,
      });
      console.log(`✅ Uploaded to gs://${BUCKET_NAME}/${sourceFile}`);
    } catch (error) {
      console.error(`❌ Failed to download ${year} data from DOL:`, error);
      console.log(`Please manually download from: ${dolUrl}`);
      console.log(`And upload to: gs://${BUCKET_NAME}/${sourceFile}`);
      throw error;
    }
  } else {
    // Download from Cloud Storage
    await storage.bucket(BUCKET_NAME).file(sourceFile).download({
      destination: localZipPath
    });
    console.log(`✅ Downloaded ${sourceFile} to ${localZipPath}`);
  }

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

  // Find the CSV file (case-insensitive)
  const files = fs.readdirSync(extractPath);
  const csvFile = files.find(f => f.toLowerCase().includes('f_5500') && f.toLowerCase().endsWith('.csv'));

  if (!csvFile) {
    throw new Error(`No CSV file found in extracted data for year ${year}`);
  }

  const csvPath = path.join(extractPath, csvFile);
  return { csvPath, extractPath };
}

async function ingestForm5500ForYear(year: number) {
  console.log(`🚀 Form 5500 ${year} Ingestion - Flexible Year-Based Script`);
  console.log(`Source: DOL/Cloud Storage → Target: dol_data.plan_sponsors`);
  console.log('='.repeat(70));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  const storage = new Storage({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  let extractPath = '';

  try {
    // Step 1: Download and extract data
    console.log(`\n📥 Step 1: Obtaining ${year} Form 5500 data...`);
    const { csvPath, extractPath: tmpPath } = await downloadAndExtractData(storage, year);
    extractPath = tmpPath;

    // Step 2: Process CSV data
    console.log(`\n📊 Step 2: Processing Form 5500 ${year} CSV data...`);
    const records = await processForm5500CSV(csvPath, year);
    console.log(`✅ Processed ${records.length} sponsor records`);

    // Step 3: Load data into BigQuery
    console.log(`\n📋 Step 3: Loading data into dol_data.plan_sponsors...`);
    await loadRecordsToBigQuery(bigquery, records);
    console.log('✅ Data loaded successfully');

    // Step 4: Verify the data
    console.log(`\n🔍 Step 4: Verifying ${year} data...`);

    const verifyQuery = `
      SELECT
        form_tax_year,
        COUNT(*) as count,
        COUNT(DISTINCT ein_plan_sponsor) as unique_eins
      FROM \`${PROJECT_ID}.dol_data.plan_sponsors\`
      WHERE form_tax_year >= ${year}
      GROUP BY form_tax_year
      ORDER BY form_tax_year DESC
    `;

    const [job] = await bigquery.createQueryJob({ query: verifyQuery, location: 'US' });
    const [rows] = await job.getQueryResults();
    console.log('\n📊 Multi-year comparison:');
    console.table(rows);

    // Test Microsoft specifically
    const msQuery = `
      SELECT sponsor_name, plan_name, participants, form_tax_year
      FROM \`${PROJECT_ID}.dol_data.plan_sponsors\`
      WHERE ein_plan_sponsor = 911144442
        AND form_tax_year >= ${year}
      ORDER BY form_tax_year DESC
      LIMIT 10
    `;

    const [msJob] = await bigquery.createQueryJob({ query: msQuery, location: 'US' });
    const [msRows] = await msJob.getQueryResults();

    if (msRows.some(r => r.form_tax_year === year)) {
      console.log(`\n✅ SUCCESS: Microsoft found in ${year} data!`);
      console.table(msRows);
    } else {
      console.log(`\n⚠️  Microsoft not found in ${year} data (may not have filed that year)`);
    }

    // Clean up
    console.log('\n🧹 Cleaning up temporary files...');
    fs.rmSync(extractPath, { recursive: true, force: true });
    fs.unlinkSync(`/tmp/form5500_${year}.zip`);

    console.log(`\n🎉 ${year} Data Ingestion Complete!`);
    console.log(`Successfully loaded ${records.length} records`);
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error(`\n❌ Error during ${year} ingestion:`, error);

    // Clean up on error
    if (extractPath && fs.existsSync(extractPath)) {
      fs.rmSync(extractPath, { recursive: true, force: true });
    }

    throw error;
  }
}

// Main execution
async function main() {
  // Get year from command line argument
  const year = parseInt(process.argv[2]);

  if (!year || year < 2000 || year > 2030) {
    console.error('❌ Please provide a valid year as argument');
    console.log('Usage: npx tsx ingest-form5500-flexible.ts 2021');
    process.exit(1);
  }

  try {
    await ingestForm5500ForYear(year);
  } catch (error) {
    console.error('Failed to ingest data:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { ingestForm5500ForYear };