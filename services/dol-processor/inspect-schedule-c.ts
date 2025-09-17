import * as fs from 'fs';
import * as unzipper from 'unzipper';
import csv from 'csv-parser';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';

async function inspectScheduleC() {
  console.log('🔍 Inspecting Schedule C CSV Structure');
  console.log('='.repeat(60));
  console.log();

  const schedCPath = '/tmp/schedule_c_part1_item2.zip';

  if (!fs.existsSync(schedCPath)) {
    console.error('❌ Schedule C file not found at:', schedCPath);
    return;
  }

  const directory = await unzipper.Open.file(schedCPath);
  const schedCFile = directory.files.find(f =>
    f.path.endsWith('.csv')
  );

  if (!schedCFile) {
    console.error('❌ No Schedule C CSV file found in ZIP');
    return;
  }

  console.log(`📄 Found file: ${schedCFile.path}`);
  console.log();

  let headers: string[] = [];
  let sampleRecord: any = null;
  let recordCount = 0;

  await pipeline(
    schedCFile.stream(),
    csv(),
    new Transform({
      objectMode: true,
      transform(record: any, encoding, callback) {
        recordCount++;

        if (recordCount === 1) {
          headers = Object.keys(record);
          sampleRecord = record;
        }

        // Stop after first record for inspection
        if (recordCount >= 1) {
          this.push(null);
          return callback();
        }

        callback();
      }
    })
  );

  console.log(`📊 Total columns: ${headers.length}`);
  console.log();

  // Find service provider related columns
  console.log('🏢 Service Provider / Custodian Related Columns:');
  console.log('-'.repeat(60));

  const serviceProviderCols = headers.filter(h =>
    h.toLowerCase().includes('provider') ||
    h.toLowerCase().includes('custod') ||
    h.toLowerCase().includes('admin') ||
    h.toLowerCase().includes('service') ||
    h.toLowerCase().includes('trustee') ||
    h.toLowerCase().includes('recordkeeper')
  );

  if (serviceProviderCols.length > 0) {
    serviceProviderCols.forEach(col => {
      const value = sampleRecord[col];
      console.log(`  ${col}: ${value || '(empty)'}`);
    });
  } else {
    console.log('  No obvious service provider columns found by keyword');
    console.log();
    console.log('  Looking for columns with "NAME" or "EIN":');
    const nameCols = headers.filter(h =>
      h.includes('NAME') || h.includes('EIN')
    );
    nameCols.forEach(col => {
      const value = sampleRecord[col];
      console.log(`  ${col}: ${value || '(empty)'}`);
    });
  }

  console.log();
  console.log('📋 First 50 Column Names:');
  console.log('-'.repeat(60));
  headers.slice(0, 50).forEach((h, i) => {
    console.log(`  ${(i+1).toString().padStart(2)}. ${h}`);
  });

  // Check for specific patterns
  console.log();
  console.log('🔎 Checking for specific provider patterns:');
  console.log('-'.repeat(60));

  // Look for numbered provider fields
  const numberedProviders: string[] = [];
  for (let i = 1; i <= 50; i++) {
    const patterns = [
      `PROVIDER_${i}_NAME`,
      `SERVICE_PROVIDER_${i}_NAME`,
      `PROV${i.toString().padStart(2, '0')}_NAME`,
      `PROVIDER${i}_NAME`
    ];

    patterns.forEach(pattern => {
      if (headers.includes(pattern)) {
        numberedProviders.push(pattern);
      }
    });
  }

  if (numberedProviders.length > 0) {
    console.log(`  Found ${numberedProviders.length} numbered provider fields:`);
    numberedProviders.slice(0, 10).forEach(field => {
      console.log(`    - ${field}`);
    });
  } else {
    console.log('  No numbered provider fields found');
  }

  // Display sample data for non-empty fields
  console.log();
  console.log('📝 Sample Record (non-empty fields only):');
  console.log('-'.repeat(60));

  let nonEmptyCount = 0;
  for (const [key, value] of Object.entries(sampleRecord)) {
    if (value && value !== '' && value !== ' ') {
      console.log(`  ${key}: ${value}`);
      nonEmptyCount++;
      if (nonEmptyCount >= 20) {
        console.log('  ... (showing first 20 non-empty fields)');
        break;
      }
    }
  }

  console.log();
  console.log('✨ Inspection complete!');
}

// Run inspection
inspectScheduleC().catch(console.error);