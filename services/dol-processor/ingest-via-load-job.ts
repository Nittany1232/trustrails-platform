/**
 * Form 5500 Ingestion using BigQuery Load Jobs
 *
 * This approach creates NDJSON files and uploads them via load jobs
 * to avoid the direct insert table ID issues
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

async function ingestViaLoadJob() {
  console.log('🚀 Form 5500 Ingestion via BigQuery Load Job');
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
    // Step 1: Process CSV and create NDJSON
    console.log('\n📊 Step 1: Processing Form 5500 CSV data...');

    const extractPath = '/tmp/form5500_extract';
    const csvPath = path.join(extractPath, 'f_5500_2024_latest.csv');
    const ndjsonPath = '/tmp/sponsors.ndjson';

    // Check if extracted data exists, if not extract it
    if (!fs.existsSync(csvPath)) {
      console.log('Extracting Form 5500 data...');

      const sourceFile = 'form5500_2024_2024-09.zip';
      const localZipPath = `/tmp/${sourceFile}`;

      await storage.bucket(BUCKET_NAME).file(sourceFile).download({
        destination: localZipPath
      });

      if (!fs.existsSync(extractPath)) {
        fs.mkdirSync(extractPath, { recursive: true });
      }

      await new Promise((resolve, reject) => {
        fs.createReadStream(localZipPath)
          .pipe(unzipper.Extract({ path: extractPath }))
          .on('close', resolve)
          .on('error', reject);
      });
    }

    // Process CSV to NDJSON
    const records = await processCSVToNDJSON(csvPath, ndjsonPath);
    console.log(`✅ Created NDJSON with ${records} sponsor records`);

    // Step 2: Upload NDJSON to Cloud Storage
    console.log('\n📤 Step 2: Uploading NDJSON to Cloud Storage...');

    const uploadFile = 'temp/sponsors_load.ndjson';
    await storage.bucket(BUCKET_NAME).upload(ndjsonPath, {
      destination: uploadFile
    });
    console.log(`✅ Uploaded to gs://${BUCKET_NAME}/${uploadFile}`);

    // Step 3: Load data via BigQuery load job
    console.log('\n📋 Step 3: Loading data via BigQuery load job...');

    const dataset = bigquery.dataset('dol_data');
    const table = dataset.table('plan_sponsors');

    const loadJobConfig = {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      sourceUris: [`gs://${BUCKET_NAME}/${uploadFile}`],
      location: 'US',
      writeDisposition: 'WRITE_TRUNCATE', // Replace existing data
      autodetect: false,
      schema: {
        fields: [
          { name: 'ack_id', type: 'STRING', mode: 'NULLABLE' },
          { name: 'ein_plan_sponsor', type: 'STRING', mode: 'NULLABLE' },
          { name: 'plan_number', type: 'STRING', mode: 'NULLABLE' },
          { name: 'plan_name', type: 'STRING', mode: 'NULLABLE' },
          { name: 'sponsor_name', type: 'STRING', mode: 'NULLABLE' },
          { name: 'sponsor_city', type: 'STRING', mode: 'NULLABLE' },
          { name: 'sponsor_state', type: 'STRING', mode: 'NULLABLE' },
          { name: 'sponsor_zip', type: 'STRING', mode: 'NULLABLE' },
          { name: 'plan_type', type: 'STRING', mode: 'NULLABLE' },
          { name: 'participants', type: 'INTEGER', mode: 'NULLABLE' },
          { name: 'total_assets', type: 'FLOAT', mode: 'NULLABLE' },
          { name: 'form_tax_year', type: 'INTEGER', mode: 'NULLABLE' },
          { name: 'extraction_date', type: 'TIMESTAMP', mode: 'NULLABLE' },
          { name: 'file_source', type: 'STRING', mode: 'NULLABLE' }
        ]
      }
    };

    const [loadJob] = await table.createLoadJob(loadJobConfig);
    await loadJob.promise();
    console.log('✅ Load job completed successfully');

    // Step 4: Test the loaded data
    await testLoadedData(bigquery);

    // Step 5: Clean up
    console.log('\n🧹 Cleaning up temporary files...');
    fs.rmSync(ndjsonPath, { force: true });
    await storage.bucket(BUCKET_NAME).file(uploadFile).delete();
    console.log('✅ Cleanup complete');

  } catch (error: any) {
    console.error('❌ Load job failed:', error.message);
    throw error;
  }
}

async function processCSVToNDJSON(csvPath: string, outputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(outputPath);
    let recordCount = 0;

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        try {
          const ack_id = row['ACK_ID']?.trim();
          const sponsor_name = row['SPONSOR_DFE_NAME']?.trim();
          const plan_name = row['PLAN_NAME']?.trim();
          const sponsor_ein = row['SPONS_DFE_EIN']?.trim();

          if (ack_id && sponsor_name && sponsor_ein) {
            const record = {
              ack_id,
              ein_plan_sponsor: sponsor_ein,
              plan_number: row['LAST_RPT_PLAN_NUM']?.trim() || '001',
              plan_name: plan_name || '',
              sponsor_name,
              sponsor_city: '', // Not in main Form 5500
              sponsor_state: '', // Not in main Form 5500
              sponsor_zip: '', // Not in main Form 5500
              plan_type: determinePlanType(row),
              participants: parseInt(row['TOT_PARTCP_BOY_CNT']) || null,
              total_assets: parseFloat(row['TOT_ASSETS_EOY_AMT']) || null,
              form_tax_year: 2024,
              extraction_date: new Date().toISOString(),
              file_source: 'form5500_2024_load_job'
            };

            writeStream.write(JSON.stringify(record) + '\n');
            recordCount++;
          }
        } catch (error) {
          console.warn('Warning: Skipped malformed row:', error);
        }
      })
      .on('end', () => {
        writeStream.end();
        resolve(recordCount);
      })
      .on('error', reject);
  });
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

async function testLoadedData(bigquery: BigQuery) {
  console.log('\n🧪 Testing loaded data...');

  // Test 1: Basic count
  const countQuery = `SELECT COUNT(*) as total_count FROM \`${PROJECT_ID}.dol_data.plan_sponsors\``;
  const [countResults] = await bigquery.query({ query: countQuery, location: 'US' });
  const count = countResults[0].total_count;

  console.log(`📊 Total sponsors loaded: ${count.toLocaleString()}`);

  // Test 2: Sample data
  const sampleQuery = `
    SELECT sponsor_name, plan_name, ack_id, participants, total_assets
    FROM \`${PROJECT_ID}.dol_data.plan_sponsors\`
    WHERE sponsor_name IS NOT NULL
    LIMIT 5
  `;
  const [sampleResults] = await bigquery.query({ query: sampleQuery, location: 'US' });

  console.log('\n📋 Sample sponsor records:');
  sampleResults.forEach((record: any, i: number) => {
    console.log(`${i + 1}. ${record.sponsor_name}`);
    console.log(`   Plan: ${record.plan_name}`);
    console.log(`   ACK ID: ${record.ack_id}`);
    console.log(`   Participants: ${record.participants?.toLocaleString() || 'N/A'}`);
    console.log('');
  });

  // Test 3: Search for major companies
  const searchQuery = `
    SELECT sponsor_name, plan_name, participants, total_assets
    FROM \`${PROJECT_ID}.dol_data.plan_sponsors\`
    WHERE (
      UPPER(sponsor_name) LIKE '%MICROSOFT%' OR
      UPPER(sponsor_name) LIKE '%GOOGLE%' OR
      UPPER(sponsor_name) LIKE '%AMAZON%' OR
      UPPER(sponsor_name) LIKE '%APPLE%'
    )
    LIMIT 10
  `;
  const [searchResults] = await bigquery.query({ query: searchQuery, location: 'US' });

  if (searchResults.length > 0) {
    console.log('🎉 Major companies found:');
    searchResults.forEach((result: any) => {
      console.log(`  ${result.sponsor_name} (${result.participants?.toLocaleString() || 'N/A'} participants)`);
    });
  } else {
    console.log('⚠️ No major tech companies found in 2024 data');
  }

  console.log('\n🎉 DATA LOAD SUCCESSFUL!');
  console.log('✅ Form 5500 sponsors ready for search functionality');
}

ingestViaLoadJob().catch(console.error);