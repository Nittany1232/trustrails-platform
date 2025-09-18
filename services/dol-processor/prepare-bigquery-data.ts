import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import * as unzipper from 'unzipper';

interface ScheduleCRecord {
  // Plan identifiers
  ack_id: string;
  plan_number: string | null;
  ein_plan_sponsor: string | null;
  plan_name: string | null;

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

async function prepareScheduleCForBigQuery() {
  console.log('🔄 Preparing Schedule C Data for BigQuery Ingestion');
  console.log('='.repeat(60));
  console.log();

  const zipFilePath = '/tmp/schedule_c_part1_item2.zip';
  const outputPath = '/tmp/schedule_c_bigquery.ndjson';
  const schemaPath = '/tmp/schedule_c_schema.json';
  const statsPath = '/tmp/schedule_c_stats.json';

  if (!fs.existsSync(zipFilePath)) {
    console.error('❌ Schedule C ZIP file not found at:', zipFilePath);
    console.log('Please ensure the file is downloaded first.');
    return;
  }

  // Prepare for extraction
  const records: ScheduleCRecord[] = [];
  const extractionDate = new Date().toISOString();
  const fileSource = path.basename(zipFilePath);
  const custodianStats = new Map<string, any>();

  // Extract and process ZIP file
  const directory = await unzipper.Open.file(zipFilePath);
  const csvFile = directory.files.find(f => f.path.endsWith('.csv'));

  if (!csvFile) {
    throw new Error('No CSV file found in ZIP archive');
  }

  console.log(`📄 Processing: ${csvFile.path}`);
  let totalRecords = 0;
  let recordsWithCustodians = 0;

  // Process CSV and write to NDJSON
  const writeStream = fs.createWriteStream(outputPath);

  await pipeline(
    csvFile.stream(),
    csv(),
    new Transform({
      objectMode: true,
      transform(record: any, encoding, callback) {
        totalRecords++;

        // Only include records with custodian data
        if (record.PROVIDER_OTHER_NAME?.trim()) {
          recordsWithCustodians++;

          const scheduleCRecord: ScheduleCRecord = {
            ack_id: record.ACK_ID || '',
            plan_number: record.PLAN_NUM?.trim() || null,
            ein_plan_sponsor: record.SPONS_DFE_EIN?.trim() || null,
            plan_name: record.PLAN_NAME?.trim() || null,
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

          // Write to NDJSON file
          writeStream.write(JSON.stringify(scheduleCRecord) + '\n');

          // Update custodian statistics
          const custodianKey = scheduleCRecord.provider_other_name?.toUpperCase() || '';
          if (custodianKey) {
            const existing = custodianStats.get(custodianKey) || {
              name: scheduleCRecord.provider_other_name,
              ein: null,
              state: null,
              city: null,
              plan_count: 0,
              relation_types: new Set()
            };

            existing.plan_count++;
            if (!existing.ein && scheduleCRecord.provider_other_ein) {
              existing.ein = scheduleCRecord.provider_other_ein;
            }
            if (!existing.state && scheduleCRecord.provider_other_us_state) {
              existing.state = scheduleCRecord.provider_other_us_state;
              existing.city = scheduleCRecord.provider_other_us_city;
            }
            if (scheduleCRecord.provider_other_relation) {
              existing.relation_types.add(scheduleCRecord.provider_other_relation);
            }

            custodianStats.set(custodianKey, existing);
          }
        }

        if (totalRecords % 10000 === 0) {
          process.stdout.write(`   Processed ${totalRecords} records (${recordsWithCustodians} with custodians)...\\r`);
        }

        callback();
      }
    })
  );

  writeStream.end();
  console.log();
  console.log(`✅ Processed ${totalRecords} total records`);
  console.log(`📊 Found ${recordsWithCustodians} records with custodian data`);
  console.log(`💾 NDJSON file created: ${outputPath}`);
  console.log();

  // Create BigQuery schema file
  const schema = [
    { name: 'ack_id', type: 'STRING', mode: 'REQUIRED', description: 'Acknowledgment ID' },
    { name: 'plan_number', type: 'STRING', mode: 'NULLABLE', description: 'Plan number' },
    { name: 'ein_plan_sponsor', type: 'STRING', mode: 'NULLABLE', description: 'Plan sponsor EIN' },
    { name: 'plan_name', type: 'STRING', mode: 'NULLABLE', description: 'Plan name' },
    { name: 'provider_other_name', type: 'STRING', mode: 'NULLABLE', description: 'Custodian/Administrator name' },
    { name: 'provider_other_ein', type: 'STRING', mode: 'NULLABLE', description: 'Custodian/Administrator EIN' },
    { name: 'provider_other_relation', type: 'STRING', mode: 'NULLABLE', description: 'Relation type to plan' },
    { name: 'provider_other_us_address1', type: 'STRING', mode: 'NULLABLE', description: 'Address line 1' },
    { name: 'provider_other_us_address2', type: 'STRING', mode: 'NULLABLE', description: 'Address line 2' },
    { name: 'provider_other_us_city', type: 'STRING', mode: 'NULLABLE', description: 'City' },
    { name: 'provider_other_us_state', type: 'STRING', mode: 'NULLABLE', description: 'State' },
    { name: 'provider_other_us_zip', type: 'STRING', mode: 'NULLABLE', description: 'ZIP code' },
    { name: 'form_tax_year', type: 'INTEGER', mode: 'NULLABLE', description: 'Form tax year' },
    { name: 'extraction_date', type: 'TIMESTAMP', mode: 'REQUIRED', description: 'Data extraction timestamp' },
    { name: 'file_source', type: 'STRING', mode: 'REQUIRED', description: 'Source file name' }
  ];

  fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
  console.log(`📋 Schema file created: ${schemaPath}`);

  // Generate statistics
  const sortedCustodians = Array.from(custodianStats.values())
    .map(c => ({
      ...c,
      relation_types: Array.from(c.relation_types),
      market_share_percent: ((c.plan_count / recordsWithCustodians) * 100).toFixed(2)
    }))
    .sort((a, b) => b.plan_count - a.plan_count);

  const statistics = {
    extraction_date: extractionDate,
    total_records: totalRecords,
    records_with_custodians: recordsWithCustodians,
    unique_custodians: custodianStats.size,
    top_50_custodians: sortedCustodians.slice(0, 50),
    market_concentration: {
      top_5: sortedCustodians.slice(0, 5).reduce((sum, c) => sum + c.plan_count, 0),
      top_10: sortedCustodians.slice(0, 10).reduce((sum, c) => sum + c.plan_count, 0),
      top_25: sortedCustodians.slice(0, 25).reduce((sum, c) => sum + c.plan_count, 0)
    }
  };

  fs.writeFileSync(statsPath, JSON.stringify(statistics, null, 2));
  console.log(`📈 Statistics file created: ${statsPath}`);

  // Display top custodians
  console.log();
  console.log('🏆 Top 10 Custodians by Plan Count:');
  console.log('='.repeat(60));

  sortedCustodians.slice(0, 10).forEach((custodian, index) => {
    console.log(`${(index + 1).toString().padStart(2)}. ${custodian.name}`);
    console.log(`    Plans: ${custodian.plan_count.toLocaleString()} (${custodian.market_share_percent}% market share)`);
    if (custodian.ein) console.log(`    EIN: ${custodian.ein}`);
    if (custodian.state) console.log(`    Location: ${custodian.city || 'N/A'}, ${custodian.state}`);
    console.log();
  });

  // Market concentration
  console.log('📊 Market Concentration:');
  console.log('='.repeat(60));
  console.log(`Top 5:  ${((statistics.market_concentration.top_5 / recordsWithCustodians) * 100).toFixed(1)}% of market`);
  console.log(`Top 10: ${((statistics.market_concentration.top_10 / recordsWithCustodians) * 100).toFixed(1)}% of market`);
  console.log(`Top 25: ${((statistics.market_concentration.top_25 / recordsWithCustodians) * 100).toFixed(1)}% of market`);

  console.log();
  console.log('📤 BigQuery Import Instructions:');
  console.log('='.repeat(60));
  console.log('1. Create dataset:');
  console.log('   bq mk --location=US dol_data');
  console.log();
  console.log('2. Create table and load data:');
  console.log('   bq load --source_format=NEWLINE_DELIMITED_JSON \\\\');
  console.log('     --autodetect \\\\');
  console.log('     --time_partitioning_field=extraction_date \\\\');
  console.log('     --clustering_fields=provider_other_name,provider_other_state \\\\');
  console.log('     dol_data.schedule_c_custodians \\\\');
  console.log(`     ${outputPath} \\\\`);
  console.log(`     ${schemaPath}`);
  console.log();
  console.log('3. Or use gcloud:');
  console.log('   gcloud auth activate-service-account --key-file=/path/to/service-account.json');
  console.log('   bq --project_id=trustrails-faa3e load ...');
  console.log();
  console.log('✨ Data preparation complete!');
}

// Run the preparation
prepareScheduleCForBigQuery().catch(console.error);