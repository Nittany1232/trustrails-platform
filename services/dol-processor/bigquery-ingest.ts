import { BigQuery } from '@google-cloud/bigquery';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import csv from 'csv-parser';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import * as unzipper from 'unzipper';

const DATASET_ID = 'dol_data';
const TABLE_ID = 'schedule_c_custodians';
const PROJECT_ID = 'trustrails-faa3e';

interface ScheduleCRecord {
  // Plan identifiers
  ack_id: string;
  plan_number: string;

  // Provider/Custodian information from Part 1 Item 2
  provider_other_name: string | null;
  provider_other_ein: string | null;
  provider_other_relation: string | null;
  provider_other_us_address1: string | null;
  provider_other_us_address2: string | null;
  provider_other_us_city: string | null;
  provider_other_us_state: string | null;
  provider_other_us_zip: string | null;

  // Additional metadata
  form_tax_year: number;
  extraction_date: string;
  file_source: string;
}

interface CustodianAggregate {
  custodian_name: string;
  custodian_name_normalized: string;
  ein: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  plan_count: number;
  market_share_percent: number;
  relation_types: string[];
  first_seen_date: string;
  last_updated: string;
}

class BigQueryIngester {
  private bigquery: BigQuery;

  constructor() {
    this.bigquery = new BigQuery({
      projectId: PROJECT_ID,
      keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
    });
  }

  async ensureDatasetExists() {
    const [datasets] = await this.bigquery.getDatasets();
    const datasetExists = datasets.some(dataset => dataset.id === DATASET_ID);

    if (!datasetExists) {
      console.log(`📊 Creating dataset: ${DATASET_ID}`);
      const [dataset] = await this.bigquery.createDataset(DATASET_ID, {
        location: 'US'
      });
      console.log(`✅ Dataset ${dataset.id} created`);
    } else {
      console.log(`✅ Dataset ${DATASET_ID} already exists`);
    }
  }

  async createScheduleCTable() {
    const dataset = this.bigquery.dataset(DATASET_ID);
    const [tables] = await dataset.getTables();
    const tableExists = tables.some(table => table.id === TABLE_ID);

    if (!tableExists) {
      console.log(`📋 Creating table: ${TABLE_ID}`);

      const schema = [
        { name: 'ack_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'plan_number', type: 'STRING', mode: 'NULLABLE' },
        { name: 'provider_other_name', type: 'STRING', mode: 'NULLABLE' },
        { name: 'provider_other_ein', type: 'STRING', mode: 'NULLABLE' },
        { name: 'provider_other_relation', type: 'STRING', mode: 'NULLABLE' },
        { name: 'provider_other_us_address1', type: 'STRING', mode: 'NULLABLE' },
        { name: 'provider_other_us_address2', type: 'STRING', mode: 'NULLABLE' },
        { name: 'provider_other_us_city', type: 'STRING', mode: 'NULLABLE' },
        { name: 'provider_other_us_state', type: 'STRING', mode: 'NULLABLE' },
        { name: 'provider_other_us_zip', type: 'STRING', mode: 'NULLABLE' },
        { name: 'form_tax_year', type: 'INTEGER', mode: 'NULLABLE' },
        { name: 'extraction_date', type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'file_source', type: 'STRING', mode: 'REQUIRED' }
      ];

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
    } else {
      console.log(`✅ Table ${TABLE_ID} already exists`);
    }
  }

  async createCustodianAggregateTable() {
    const dataset = this.bigquery.dataset(DATASET_ID);
    const aggregateTableId = 'custodian_aggregates';
    const [tables] = await dataset.getTables();
    const tableExists = tables.some(table => table.id === aggregateTableId);

    if (!tableExists) {
      console.log(`📋 Creating aggregate table: ${aggregateTableId}`);

      const schema = [
        { name: 'custodian_name', type: 'STRING', mode: 'REQUIRED' },
        { name: 'custodian_name_normalized', type: 'STRING', mode: 'REQUIRED' },
        { name: 'ein', type: 'STRING', mode: 'NULLABLE' },
        { name: 'address', type: 'STRING', mode: 'NULLABLE' },
        { name: 'city', type: 'STRING', mode: 'NULLABLE' },
        { name: 'state', type: 'STRING', mode: 'NULLABLE' },
        { name: 'zip', type: 'STRING', mode: 'NULLABLE' },
        { name: 'plan_count', type: 'INTEGER', mode: 'REQUIRED' },
        { name: 'market_share_percent', type: 'FLOAT', mode: 'REQUIRED' },
        { name: 'relation_types', type: 'STRING', mode: 'REPEATED' },
        { name: 'first_seen_date', type: 'DATE', mode: 'REQUIRED' },
        { name: 'last_updated', type: 'TIMESTAMP', mode: 'REQUIRED' }
      ];

      const options = {
        schema,
        location: 'US',
        description: 'Aggregated custodian statistics from Schedule C data',
        clustering: {
          fields: ['state', 'plan_count']
        }
      };

      const [table] = await dataset.createTable(aggregateTableId, options);
      console.log(`✅ Aggregate table ${table.id} created`);
    } else {
      console.log(`✅ Aggregate table ${aggregateTableId} already exists`);
    }
  }

  async ingestScheduleCData(zipFilePath: string) {
    console.log('🚀 Starting Schedule C data ingestion to BigQuery');
    console.log('='.repeat(60));

    const dataset = this.bigquery.dataset(DATASET_ID);
    const table = dataset.table(TABLE_ID);

    const records: ScheduleCRecord[] = [];
    const extractionDate = new Date().toISOString();
    const fileSource = path.basename(zipFilePath);

    // Extract and process ZIP file
    const directory = await unzipper.Open.file(zipFilePath);
    const csvFile = directory.files.find(f => f.path.endsWith('.csv'));

    if (!csvFile) {
      throw new Error('No CSV file found in ZIP archive');
    }

    console.log(`📄 Processing: ${csvFile.path}`);
    let recordCount = 0;

    await pipeline(
      csvFile.stream(),
      csv(),
      new Transform({
        objectMode: true,
        transform(record: any, encoding, callback) {
          recordCount++;

          // Only include records with custodian data
          if (record.PROVIDER_OTHER_NAME?.trim()) {
            const scheduleCRecord: ScheduleCRecord = {
              ack_id: record.ACK_ID || '',
              plan_number: record.PLAN_NUM || null,
              provider_other_name: record.PROVIDER_OTHER_NAME?.trim() || null,
              provider_other_ein: record.PROVIDER_OTHER_EIN?.trim() || null,
              provider_other_relation: record.PROVIDER_OTHER_RELATION?.trim() || null,
              provider_other_us_address1: record.PROVIDER_OTHER_US_ADDRESS1?.trim() || null,
              provider_other_us_address2: record.PROVIDER_OTHER_US_ADDRESS2?.trim() || null,
              provider_other_us_city: record.PROVIDER_OTHER_US_CITY?.trim() || null,
              provider_other_us_state: record.PROVIDER_OTHER_US_STATE?.trim() || null,
              provider_other_us_zip: record.PROVIDER_OTHER_US_ZIP?.trim() || null,
              form_tax_year: parseInt(record.FORM_TAX_YR) || 2024,
              extraction_date: extractionDate,
              file_source: fileSource
            };

            records.push(scheduleCRecord);
          }

          // Batch insert every 5000 records
          if (records.length >= 5000) {
            this.insertBatch(table, records.splice(0, 5000))
              .then(() => console.log(`   ✓ Inserted batch (${recordCount} total processed)`))
              .catch(err => console.error('Error inserting batch:', err));
          }

          if (recordCount % 10000 === 0) {
            process.stdout.write(`   Processing: ${recordCount} records...\\r`);
          }

          callback();
        }
      })
    );

    // Insert remaining records
    if (records.length > 0) {
      await this.insertBatch(table, records);
      console.log(`\\n   ✓ Inserted final batch of ${records.length} records`);
    }

    console.log(`\\n✅ Successfully ingested ${recordCount} records to BigQuery`);

    // Update aggregate table
    await this.updateAggregateTable();
  }

  private async insertBatch(table: any, records: ScheduleCRecord[]) {
    try {
      await table.insert(records, {
        skipInvalidRows: false,
        ignoreUnknownValues: false
      });
    } catch (error: any) {
      if (error.errors && error.errors.length > 0) {
        console.error('Insert errors:', JSON.stringify(error.errors[0], null, 2));
      }
      throw error;
    }
  }

  async updateAggregateTable() {
    console.log('\\n📊 Updating custodian aggregate statistics...');

    const query = `
      CREATE OR REPLACE TABLE \`${PROJECT_ID}.${DATASET_ID}.custodian_aggregates\` AS
      WITH custodian_stats AS (
        SELECT
          provider_other_name AS custodian_name,
          UPPER(TRIM(provider_other_name)) AS custodian_name_normalized,
          FIRST_VALUE(provider_other_ein IGNORE NULLS) OVER (
            PARTITION BY UPPER(TRIM(provider_other_name))
            ORDER BY extraction_date DESC
          ) AS ein,
          FIRST_VALUE(provider_other_us_address1 IGNORE NULLS) OVER (
            PARTITION BY UPPER(TRIM(provider_other_name))
            ORDER BY extraction_date DESC
          ) AS address,
          FIRST_VALUE(provider_other_us_city IGNORE NULLS) OVER (
            PARTITION BY UPPER(TRIM(provider_other_name))
            ORDER BY extraction_date DESC
          ) AS city,
          FIRST_VALUE(provider_other_us_state IGNORE NULLS) OVER (
            PARTITION BY UPPER(TRIM(provider_other_name))
            ORDER BY extraction_date DESC
          ) AS state,
          FIRST_VALUE(provider_other_us_zip IGNORE NULLS) OVER (
            PARTITION BY UPPER(TRIM(provider_other_name))
            ORDER BY extraction_date DESC
          ) AS zip,
          COUNT(DISTINCT ack_id) AS plan_count,
          ARRAY_AGG(DISTINCT provider_other_relation IGNORE NULLS) AS relation_types,
          MIN(DATE(extraction_date)) AS first_seen_date,
          MAX(extraction_date) AS last_updated
        FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
        WHERE provider_other_name IS NOT NULL
        GROUP BY custodian_name, custodian_name_normalized
      ),
      total_plans AS (
        SELECT COUNT(DISTINCT ack_id) AS total
        FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
        WHERE provider_other_name IS NOT NULL
      )
      SELECT
        s.*,
        ROUND((s.plan_count * 100.0) / t.total, 2) AS market_share_percent
      FROM custodian_stats s
      CROSS JOIN total_plans t
      ORDER BY plan_count DESC
    `;

    const [job] = await this.bigquery.createQueryJob(query);
    console.log(`   Job ${job.id} started...`);

    const [rows] = await job.getQueryResults();
    console.log(`✅ Aggregate table updated with ${rows.length} unique custodians`);
  }

  async queryTopCustodians(limit: number = 10) {
    console.log(`\\n🏆 Top ${limit} Custodians by Market Share:`);
    console.log('='.repeat(60));

    const query = `
      SELECT
        custodian_name,
        ein,
        city,
        state,
        plan_count,
        market_share_percent,
        ARRAY_TO_STRING(relation_types, ', ') AS relations
      FROM \`${PROJECT_ID}.${DATASET_ID}.custodian_aggregates\`
      ORDER BY plan_count DESC
      LIMIT @limit
    `;

    const options = {
      query,
      params: { limit }
    };

    const [rows] = await this.bigquery.query(options);

    rows.forEach((row, index) => {
      console.log(`${(index + 1).toString().padStart(2)}. ${row.custodian_name}`);
      console.log(`    Plans: ${row.plan_count.toLocaleString()} (${row.market_share_percent}% market share)`);
      if (row.ein) console.log(`    EIN: ${row.ein}`);
      if (row.city && row.state) console.log(`    Location: ${row.city}, ${row.state}`);
      if (row.relations) console.log(`    Relations: ${row.relations}`);
      console.log();
    });

    return rows;
  }

  async getMarketConcentration() {
    console.log('\\n📈 Market Concentration Analysis:');
    console.log('='.repeat(60));

    const query = `
      WITH ranked_custodians AS (
        SELECT
          custodian_name,
          plan_count,
          market_share_percent,
          ROW_NUMBER() OVER (ORDER BY plan_count DESC) AS rank
        FROM \`${PROJECT_ID}.${DATASET_ID}.custodian_aggregates\`
      )
      SELECT
        'Top 5' AS segment,
        SUM(market_share_percent) AS total_market_share,
        SUM(plan_count) AS total_plans
      FROM ranked_custodians
      WHERE rank <= 5
      UNION ALL
      SELECT
        'Top 10' AS segment,
        SUM(market_share_percent) AS total_market_share,
        SUM(plan_count) AS total_plans
      FROM ranked_custodians
      WHERE rank <= 10
      UNION ALL
      SELECT
        'Top 25' AS segment,
        SUM(market_share_percent) AS total_market_share,
        SUM(plan_count) AS total_plans
      FROM ranked_custodians
      WHERE rank <= 25
      ORDER BY total_market_share
    `;

    const [rows] = await this.bigquery.query(query);

    rows.forEach(row => {
      console.log(`${row.segment}: ${row.total_market_share.toFixed(1)}% of market (${row.total_plans.toLocaleString()} plans)`);
    });

    return rows;
  }
}

// Main execution
async function main() {
  const ingester = new BigQueryIngester();

  try {
    // Setup BigQuery resources
    await ingester.ensureDatasetExists();
    await ingester.createScheduleCTable();
    await ingester.createCustodianAggregateTable();

    // Ingest data from ZIP file
    const zipFilePath = '/tmp/schedule_c_part1_item2.zip';

    if (!fs.existsSync(zipFilePath)) {
      console.error('❌ Schedule C ZIP file not found at:', zipFilePath);
      console.log('Please ensure the file is downloaded first.');
      return;
    }

    await ingester.ingestScheduleCData(zipFilePath);

    // Query and display results
    await ingester.queryTopCustodians(25);
    await ingester.getMarketConcentration();

    console.log('\\n✨ BigQuery ingestion pipeline complete!');

  } catch (error) {
    console.error('❌ Error during ingestion:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { BigQueryIngester };