/**
 * Extract CSV from ZIP and upload to Cloud Storage for BigQuery loading
 */

import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import * as unzipper from 'unzipper';

const PROJECT_ID = 'trustrails-faa3e';
const BUCKET_NAME = 'trustrails-dol-data';

async function uploadCsvToStorage() {
  console.log('📤 Uploading Form 5500 CSV to Cloud Storage for BigQuery loading');
  console.log('='.repeat(70));

  const storage = new Storage({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Step 1: Extract ZIP if needed
    const extractPath = '/tmp/form5500_extract';
    const csvPath = path.join(extractPath, 'f_5500_2024_latest.csv');

    if (!fs.existsSync(csvPath)) {
      console.log('\n📥 Extracting Form 5500 ZIP file...');

      const sourceFile = 'form5500_2024_2024-09.zip';
      const localZipPath = `/tmp/${sourceFile}`;

      // Download ZIP
      await storage.bucket(BUCKET_NAME).file(sourceFile).download({
        destination: localZipPath
      });

      // Extract
      if (!fs.existsSync(extractPath)) {
        fs.mkdirSync(extractPath, { recursive: true });
      }

      await new Promise((resolve, reject) => {
        fs.createReadStream(localZipPath)
          .pipe(unzipper.Extract({ path: extractPath }))
          .on('close', resolve)
          .on('error', reject);
      });

      console.log('✅ ZIP file extracted');
    }

    // Step 2: Upload CSV to Cloud Storage
    console.log('\n📤 Uploading CSV to Cloud Storage...');

    const csvDestination = 'form5500_2024_latest.csv';
    await storage.bucket(BUCKET_NAME).upload(csvPath, {
      destination: csvDestination,
      metadata: {
        contentType: 'text/csv',
      }
    });

    console.log(`✅ CSV uploaded to gs://${BUCKET_NAME}/${csvDestination}`);

    // Step 3: Provide BigQuery load commands
    console.log('\n📋 BigQuery Load Commands:');
    console.log('Copy and paste these commands in BigQuery console:');
    console.log('='.repeat(50));

    const loadCommand = `
-- Option 1: Create external table (for testing)
CREATE OR REPLACE EXTERNAL TABLE \`${PROJECT_ID}.dol_data.temp_form5500_external\`
OPTIONS (
  format = 'CSV',
  uris = ['gs://${BUCKET_NAME}/${csvDestination}'],
  skip_leading_rows = 1,
  allow_quoted_newlines = true,
  allow_jagged_rows = true
);

-- Option 2: Load directly into plan_sponsors table
LOAD DATA INTO \`${PROJECT_ID}.dol_data.plan_sponsors\`
(ack_id, ein_plan_sponsor, plan_number, plan_name, sponsor_name,
 sponsor_city, sponsor_state, sponsor_zip, plan_type, participants,
 total_assets, form_tax_year, extraction_date, file_source)
FROM FILES (
  format = 'CSV',
  uris = ['gs://${BUCKET_NAME}/${csvDestination}'],
  skip_leading_rows = 1,
  field_delimiter = ',',
  allow_quoted_newlines = true,
  allow_jagged_rows = true
)
WITH CONNECTION \`${PROJECT_ID}.us.trustrails-connection\`;

-- Option 3: Simple INSERT with manual column mapping
INSERT INTO \`${PROJECT_ID}.dol_data.plan_sponsors\`
(ack_id, ein_plan_sponsor, plan_number, plan_name, sponsor_name,
 sponsor_city, sponsor_state, sponsor_zip, plan_type, participants,
 total_assets, form_tax_year, extraction_date, file_source)
SELECT
  ACK_ID,
  SPONS_DFE_EIN,
  COALESCE(LAST_RPT_PLAN_NUM, '001'),
  COALESCE(PLAN_NAME, ''),
  SPONSOR_DFE_NAME,
  '',
  '',
  '',
  CASE TYPE_PLAN_ENTITY_CD
    WHEN '1' THEN 'Defined Benefit Plan'
    WHEN '2' THEN 'Defined Contribution Plan'
    WHEN '3' THEN 'Both DB and DC'
    ELSE 'Unknown Plan Type'
  END,
  SAFE_CAST(TOT_PARTCP_BOY_CNT AS INT64),
  SAFE_CAST(TOT_ASSETS_EOY_AMT AS FLOAT64),
  2024,
  CURRENT_TIMESTAMP(),
  'bigquery_load_2024'
FROM \`${PROJECT_ID}.dol_data.temp_form5500_external\`
WHERE SPONSOR_DFE_NAME IS NOT NULL
  AND SPONS_DFE_EIN IS NOT NULL
  AND ACK_ID IS NOT NULL;
`;

    console.log(loadCommand);

    console.log('\n🎯 Manual Steps:');
    console.log('1. Go to BigQuery console: https://console.cloud.google.com/bigquery');
    console.log(`2. Select project: ${PROJECT_ID}`);
    console.log('3. Copy and paste the commands above');
    console.log('4. Run the external table creation first');
    console.log('5. Test with: SELECT COUNT(*) FROM temp_form5500_external LIMIT 1');
    console.log('6. Then run the INSERT command to load data');

    console.log('\n📊 Verification Query:');
    console.log(`SELECT COUNT(*) as total_records FROM \`${PROJECT_ID}.dol_data.plan_sponsors\`;`);

  } catch (error: any) {
    console.error('❌ Upload failed:', error.message);
    throw error;
  }
}

uploadCsvToStorage().catch(console.error);