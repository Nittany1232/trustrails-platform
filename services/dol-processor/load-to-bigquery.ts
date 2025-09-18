import { BigQuery } from '@google-cloud/bigquery';
import * as fs from 'fs';

const PROJECT_ID = 'trustrails-faa3e';
const DATASET_ID = 'dol_data';
const TABLE_ID = 'schedule_c_custodians';

async function loadToBigQuery() {
  console.log('🚀 Loading Schedule C data to BigQuery');
  console.log('='.repeat(60));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Step 1: Create dataset if it doesn't exist
    const [datasets] = await bigquery.getDatasets();
    const datasetExists = datasets.some(dataset => dataset.id === DATASET_ID);

    if (!datasetExists) {
      console.log(`📊 Creating dataset: ${DATASET_ID}`);
      const [dataset] = await bigquery.createDataset(DATASET_ID, {
        location: 'US'
      });
      console.log(`✅ Dataset ${dataset.id} created`);
    } else {
      console.log(`✅ Dataset ${DATASET_ID} already exists`);
    }

    // Step 2: Create table with schema
    const dataset = bigquery.dataset(DATASET_ID);
    const [tables] = await dataset.getTables();
    const tableExists = tables.some(table => table.id === TABLE_ID);

    if (tableExists) {
      console.log(`⚠️  Table ${TABLE_ID} already exists, deleting it first...`);
      await dataset.table(TABLE_ID).delete();
      console.log(`✅ Old table deleted`);
    }

    console.log(`📋 Creating table: ${TABLE_ID}`);

    const schema = JSON.parse(fs.readFileSync('/tmp/schedule_c_schema.json', 'utf-8'));

    const options = {
      schema,
      location: 'US',
      description: 'Schedule C Part 1 Item 2 custodian data from DOL Form 5500',
      clustering: {
        fields: ['provider_other_name', 'provider_other_state']
      },
      timePartitioning: {
        type: 'DAY',
        field: 'extraction_date'
      }
    };

    const [table] = await dataset.createTable(TABLE_ID, options);
    console.log(`✅ Table ${table.id} created with partitioning and clustering`);

    // Step 3: Load the NDJSON data
    console.log('📥 Loading data from NDJSON file...');

    const metadata = {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      autodetect: false,
      schema,
      maxBadRecords: 0,
      ignoreUnknownValues: false
    };

    const [job] = await table.load('/tmp/schedule_c_bigquery.ndjson', metadata);

    console.log(`⏳ Load job ${job.id} started...`);

    // Wait for the job to complete
    const [jobResult] = await job.promise();

    const errors = jobResult.status?.errors;
    if (errors && errors.length > 0) {
      console.error('❌ Load errors:', errors);
      throw new Error('BigQuery load job failed');
    }

    console.log('✅ Data loaded successfully!');

    // Step 4: Run a quick query to verify
    console.log('\\n🔍 Verifying data...');

    const query = `
      SELECT
        COUNT(*) as total_records,
        COUNT(DISTINCT provider_other_name) as unique_custodians,
        APPROX_TOP_COUNT(provider_other_name, 5) as top_5_custodians
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
    `;

    const [rows] = await bigquery.query(query);

    console.log('\\n📊 Data Summary:');
    console.log(`Total records: ${rows[0].total_records.toLocaleString()}`);
    console.log(`Unique custodians: ${rows[0].unique_custodians.toLocaleString()}`);
    console.log('\\nTop 5 Custodians:');
    rows[0].top_5_custodians.forEach((item: any, index: number) => {
      console.log(`${index + 1}. ${item.value} (${item.count.toLocaleString()} plans)`);
    });

    // Step 5: Create an aggregate view
    console.log('\\n📊 Creating aggregate view...');

    const viewQuery = `
      CREATE OR REPLACE VIEW \`${PROJECT_ID}.${DATASET_ID}.custodian_summary\` AS
      SELECT
        provider_other_name AS custodian_name,
        COUNT(*) AS plan_count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`), 2) AS market_share_percent,
        ANY_VALUE(provider_other_ein) AS ein,
        ANY_VALUE(provider_other_us_state) AS state,
        ANY_VALUE(provider_other_us_city) AS city,
        ARRAY_AGG(DISTINCT provider_other_relation IGNORE NULLS) AS relation_types
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      WHERE provider_other_name IS NOT NULL
      GROUP BY provider_other_name
      ORDER BY plan_count DESC
    `;

    await bigquery.query(viewQuery);
    console.log('✅ View created: custodian_summary');

    console.log('\\n✨ BigQuery ingestion complete!');
    console.log('\\n📍 Access your data at:');
    console.log(`   https://console.cloud.google.com/bigquery?project=${PROJECT_ID}&ws=!1m5!1m4!4m3!1s${PROJECT_ID}!2s${DATASET_ID}!3s${TABLE_ID}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.errors && error.errors.length > 0) {
      console.error('Details:', JSON.stringify(error.errors, null, 2));
    }
    throw error;
  }
}

// Run the loader
loadToBigQuery().catch(console.error);