/**
 * Transform Form 5500 CSV to match plan_sponsors table schema
 */

import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import { createWriteStream } from 'fs';

const inputPath = '/tmp/form5500_extract/f_5500_2024_latest.csv';
const outputPath = '/tmp/plan_sponsors_formatted.csv';

async function transformCSV() {
  console.log('📋 Transforming Form 5500 CSV for BigQuery loading...');

  const writeStream = createWriteStream(outputPath);

  // Write header row
  writeStream.write([
    'ack_id',
    'ein_plan_sponsor',
    'plan_number',
    'plan_name',
    'sponsor_name',
    'sponsor_city',
    'sponsor_state',
    'sponsor_zip',
    'plan_type',
    'participants',
    'total_assets',
    'form_tax_year',
    'extraction_date',
    'file_source'
  ].join(',') + '\n');

  let count = 0;

  return new Promise((resolve, reject) => {
    fs.createReadStream(inputPath)
      .pipe(csv())
      .on('data', (row) => {
        try {
          // Extract needed fields from raw Form 5500 data
          const ack_id = row['ACK_ID']?.trim() || '';
          const sponsor_ein = row['SPONS_DFE_EIN']?.trim() || '';
          const sponsor_name = row['SPONSOR_DFE_NAME']?.trim() || '';
          const plan_name = row['PLAN_NAME']?.trim() || '';
          const plan_number = row['LAST_RPT_PLAN_NUM']?.trim() || '001';

          // Skip if missing critical fields
          if (!ack_id || !sponsor_ein || !sponsor_name) return;

          // Determine plan type
          const planTypeCode = row['TYPE_PLAN_ENTITY_CD'];
          let plan_type = 'Unknown';
          switch(planTypeCode) {
            case '1': plan_type = 'Defined Benefit Plan'; break;
            case '2': plan_type = 'Defined Contribution Plan'; break;
            case '3': plan_type = 'Both DB and DC'; break;
          }

          // Parse numeric fields
          const participants = parseInt(row['TOT_PARTCP_BOY_CNT']) || 0;
          const total_assets = parseFloat(row['TOT_ASSETS_EOY_AMT']) || 0;

          // Clean text fields for CSV - escape quotes and commas
          const clean = (str: string) => {
            if (!str) return '';
            // If contains comma or quote, wrap in quotes and escape internal quotes
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          };

          // Write row
          const rowData = [
            clean(ack_id),
            clean(sponsor_ein),
            clean(plan_number),
            clean(plan_name),
            clean(sponsor_name),
            '', // sponsor_city (not in raw data)
            '', // sponsor_state (not in raw data)
            '', // sponsor_zip (not in raw data)
            clean(plan_type),
            participants,
            total_assets,
            '2024',
            new Date().toISOString(),
            'form5500_2024'
          ].join(',');

          writeStream.write(rowData + '\n');
          count++;

          if (count % 10000 === 0) {
            console.log(`  Processed ${count} records...`);
          }
        } catch (error) {
          console.warn('Skipped row due to error:', error);
        }
      })
      .on('end', () => {
        writeStream.end();
        console.log(`✅ Transformed ${count} records to ${outputPath}`);
        resolve(count);
      })
      .on('error', reject);
  });
}

transformCSV().catch(console.error);