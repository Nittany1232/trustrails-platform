import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import csv from 'csv-parser';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import * as unzipper from 'unzipper';

interface CustodianInfo {
  name: string;
  count: number;
  ein?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

async function extractCustodians() {
  console.log('🔍 Extracting Unique Custodians from Schedule C Data');
  console.log('='.repeat(60));
  console.log();

  const schedCPath = '/tmp/schedule_c_part1_item2.zip';

  if (!fs.existsSync(schedCPath)) {
    console.error('❌ Schedule C file not found at:', schedCPath);
    console.log('Please ensure test files are downloaded first.');
    return;
  }

  const custodians = new Map<string, CustodianInfo>();
  let totalRecords = 0;
  let recordsWithCustodians = 0;

  // Extract and process Schedule C
  const directory = await unzipper.Open.file(schedCPath);
  const schedCFile = directory.files.find(f =>
    f.path.endsWith('.csv')
  );

  if (!schedCFile) {
    console.error('❌ No Schedule C CSV file found in ZIP');
    return;
  }

  console.log(`📄 Processing: ${schedCFile.path}`);
  console.log();

  await pipeline(
    schedCFile.stream(),
    csv(),
    new Transform({
      objectMode: true,
      transform(record: any, encoding, callback) {
        totalRecords++;

        // Extract service provider/custodian info from PROVIDER_OTHER_NAME
        const providerName = record.PROVIDER_OTHER_NAME?.trim();
        const providerRelation = record.PROVIDER_OTHER_RELATION?.trim();

        if (providerName) {
          recordsWithCustodians++;

          const key = providerName.toUpperCase();
          const existing = custodians.get(key) || {
            name: providerName,
            count: 0,
            relations: new Set()
          };

          existing.count++;

          // Track the relation type
          if (providerRelation) {
            existing.relations.add(providerRelation);
          }

          // Update details if we have them
          if (!existing.ein && record.PROVIDER_OTHER_EIN) {
            existing.ein = record.PROVIDER_OTHER_EIN;
          }
          if (!existing.address && record.PROVIDER_OTHER_US_ADDRESS1) {
            existing.address = record.PROVIDER_OTHER_US_ADDRESS1;
            existing.city = record.PROVIDER_OTHER_US_CITY;
            existing.state = record.PROVIDER_OTHER_US_STATE;
            existing.zip = record.PROVIDER_OTHER_US_ZIP;
          }

          custodians.set(key, existing);
        }

        if (totalRecords % 1000 === 0) {
          process.stdout.write(`   Processed ${totalRecords} records...\\r`);
        }

        callback();
      }
    })
  );

  console.log(`\\n✅ Processed ${totalRecords} Schedule C records`);
  console.log(`📊 Found ${recordsWithCustodians} records with custodian data`);
  console.log(`🏢 Identified ${custodians.size} unique custodians/administrators`);
  console.log();

  // Sort by frequency
  const sortedCustodians = Array.from(custodians.values())
    .map(c => ({
      ...c,
      relations: Array.from(c.relations || [])
    }))
    .sort((a, b) => b.count - a.count);

  // Display top custodians
  console.log('🏆 Top 50 Custodians/Administrators by Plan Count:');
  console.log('='.repeat(60));

  const top50 = sortedCustodians.slice(0, 50);
  top50.forEach((custodian, index) => {
    const marketShare = ((custodian.count / recordsWithCustodians) * 100).toFixed(2);
    console.log(`${(index + 1).toString().padStart(3)}. ${custodian.name}`);
    console.log(`     Plans: ${custodian.count.toLocaleString()} (${marketShare}% market share)`);
    if (custodian.ein) {
      console.log(`     EIN: ${custodian.ein}`);
    }
    if (custodian.relations && custodian.relations.length > 0) {
      console.log(`     Relations: ${custodian.relations.join(', ')}`);
    }
    if (custodian.city && custodian.state) {
      console.log(`     Location: ${custodian.city}, ${custodian.state}`);
    }
    console.log();
  });

  // Export full list to JSON
  const outputPath = '/tmp/dol_custodians_2024.json';
  const exportData = {
    extractionDate: new Date().toISOString(),
    totalRecords,
    recordsWithCustodians,
    uniqueCustodians: custodians.size,
    custodians: sortedCustodians
  };

  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`\\n💾 Full custodian list exported to: ${outputPath}`);

  // Show some statistics
  console.log('\\n📈 Market Concentration:');
  console.log('='.repeat(60));

  const top5Count = top50.slice(0, 5).reduce((sum, c) => sum + c.count, 0);
  const top10Count = top50.slice(0, 10).reduce((sum, c) => sum + c.count, 0);
  const top25Count = top50.slice(0, 25).reduce((sum, c) => sum + c.count, 0);

  console.log(`Top 5 custodians:  ${((top5Count / recordsWithCustodians) * 100).toFixed(1)}% of market`);
  console.log(`Top 10 custodians: ${((top10Count / recordsWithCustodians) * 100).toFixed(1)}% of market`);
  console.log(`Top 25 custodians: ${((top25Count / recordsWithCustodians) * 100).toFixed(1)}% of market`);

  console.log('\\n✨ Extraction complete!');
}

// Run extraction
extractCustodians().catch(console.error);