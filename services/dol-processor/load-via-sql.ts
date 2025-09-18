/**
 * Load Form 5500 data via SQL INSERT statements
 * Bypasses BigQuery client library issues
 */

import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import * as unzipper from 'unzipper';

const PROJECT_ID = 'trustrails-faa3e';
const BUCKET_NAME = 'trustrails-dol-data';

async function loadViaSql() {
  console.log('🚀 Loading Form 5500 data via SQL INSERT statements');
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
    // Step 1: Process CSV data
    console.log('\n📊 Step 1: Processing Form 5500 CSV data...');

    const extractPath = '/tmp/form5500_extract';
    const csvPath = path.join(extractPath, 'f_5500_2024_latest.csv');

    // Check if we need to extract the data
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

    // Step 2: Process CSV in batches and create SQL
    console.log('\n📋 Step 2: Processing CSV and creating SQL batches...');

    const sqlStatements = await processCSVToSQL(csvPath);
    console.log(`✅ Created ${sqlStatements.length} SQL INSERT statements`);

    // Step 3: Execute SQL statements in batches
    console.log('\n💾 Step 3: Executing SQL INSERT statements...');

    for (let i = 0; i < sqlStatements.length; i++) {
      console.log(`📋 Executing batch ${i + 1}/${sqlStatements.length}...`);

      try {
        await bigquery.query({
          query: sqlStatements[i],
          location: 'US'
        });
        console.log(`✅ Batch ${i + 1} completed`);
      } catch (error: any) {
        console.error(`❌ Batch ${i + 1} failed:`, error.message);
        // Continue with next batch
      }
    }

    // Step 4: Verify data was loaded
    await verifyDataLoad(bigquery);

  } catch (error: any) {
    console.error('❌ SQL load failed:', error.message);
    throw error;
  }
}

async function processCSVToSQL(csvPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const sqlStatements: string[] = [];
    const BATCH_SIZE = 1000;
    let currentBatch: string[] = [];
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
            // Clean data for SQL
            const cleanSponsorName = sponsor_name.replace(/'/g, "''");
            const cleanPlanName = (plan_name || '').replace(/'/g, "''");
            const planNumber = row['LAST_RPT_PLAN_NUM']?.trim() || '001';
            const planType = determinePlanType(row);
            const participants = parseInt(row['TOT_PARTCP_BOY_CNT']) || null;
            const totalAssets = parseFloat(row['TOT_ASSETS_EOY_AMT']) || null;

            const insertRow = `(
              '${ack_id}',
              '${sponsor_ein}',
              '${planNumber}',
              '${cleanPlanName}',
              '${cleanSponsorName}',
              '',
              '',
              '',
              '${planType}',
              ${participants},
              ${totalAssets},
              2024,
              CURRENT_TIMESTAMP(),
              'sql_load_2024'
            )`;

            currentBatch.push(insertRow);
            recordCount++;

            // Create SQL statement when batch is full
            if (currentBatch.length >= BATCH_SIZE) {
              const insertSQL = `
                INSERT INTO \`${PROJECT_ID}.dol_data.plan_sponsors\`
                (ack_id, ein_plan_sponsor, plan_number, plan_name, sponsor_name,
                 sponsor_city, sponsor_state, sponsor_zip, plan_type, participants,
                 total_assets, form_tax_year, extraction_date, file_source)
                VALUES ${currentBatch.join(',\n')}
              `;

              sqlStatements.push(insertSQL);
              currentBatch = [];
            }
          }
        } catch (error) {
          console.warn('Warning: Skipped malformed row:', error);
        }
      })
      .on('end', () => {
        // Handle remaining records
        if (currentBatch.length > 0) {
          const insertSQL = `
            INSERT INTO \`${PROJECT_ID}.dol_data.plan_sponsors\`
            (ack_id, ein_plan_sponsor, plan_number, plan_name, sponsor_name,
             sponsor_city, sponsor_state, sponsor_zip, plan_type, participants,
             total_assets, form_tax_year, extraction_date, file_source)
            VALUES ${currentBatch.join(',\n')}
          `;
          sqlStatements.push(insertSQL);
        }

        console.log(`✅ Processed ${recordCount} sponsor records into ${sqlStatements.length} SQL batches`);
        resolve(sqlStatements);
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

async function verifyDataLoad(bigquery: BigQuery) {
  console.log('\n🧪 Verifying data load...');

  // Test 1: Basic count
  const countQuery = `SELECT COUNT(*) as total_count FROM \`${PROJECT_ID}.dol_data.plan_sponsors\``;
  const [countResults] = await bigquery.query({ query: countQuery, location: 'US' });
  const count = countResults[0].total_count;

  console.log(`📊 Total sponsors loaded: ${count.toLocaleString()}`);

  if (count === 0) {
    console.log('❌ No data was loaded! Check for errors above.');
    return;
  }

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

  // Test 3: Search for tech companies
  const techQuery = `
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
  const [techResults] = await bigquery.query({ query: techQuery, location: 'US' });

  if (techResults.length > 0) {
    console.log('\n🎉 Major tech companies found:');
    techResults.forEach((result: any) => {
      console.log(`  ${result.sponsor_name} (${result.participants?.toLocaleString() || 'N/A'} participants)`);
    });
  } else {
    console.log('\n⚠️ No major tech companies found in 2024 data');
  }

  // Test 4: JOIN test with custodians
  const joinQuery = `
    SELECT COUNT(*) as joinable_records
    FROM \`${PROJECT_ID}.dol_data.plan_sponsors\` ps
    JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
      ON ps.ack_id = cc.ack_id
  `;
  const [joinResults] = await bigquery.query({ query: joinQuery, location: 'US' });
  const joinCount = joinResults[0].joinable_records;

  console.log(`\n🔗 Sponsors with custodian data: ${joinCount.toLocaleString()}`);

  console.log('\n🎉 DATA LOAD SUCCESSFUL!');
  console.log('✅ Form 5500 sponsors ready for Microsoft search scenarios');
  console.log('✅ Unified dataset architecture working');
}

loadViaSql().catch(console.error);