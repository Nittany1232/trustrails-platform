/**
 * Test script to download and analyze DOL data structure
 * Run this to understand the actual data before deploying
 */

const https = require('https');
const fs = require('fs');
const unzipper = require('unzipper');
const csv = require('csv-parser');
const { pipeline } = require('stream');

async function testDOLData() {
  console.log('🔍 Testing DOL Form 5500 Data Download and Schema...\n');

  const year = 2024; // Use 2024 since 2025 data isn't available yet
  const url = `https://askebsa.dol.gov/FOIA%20Files/${year}/Latest/F_5500_${year}_Latest.zip`;

  console.log(`📥 Downloading from: ${url}`);
  console.log('   This will download ~100-500MB, please wait...\n');

  // Download the ZIP file
  const zipPath = `/tmp/test_form5500_${year}.zip`;

  await downloadFile(url, zipPath);

  console.log(`✅ Downloaded to: ${zipPath}`);
  console.log(`📦 File size: ${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(2)} MB\n`);

  // Extract and analyze
  console.log('📂 Analyzing ZIP contents...\n');

  const stats = {
    files: [],
    sampleData: [],
    rowCount: 0,
    uniqueEINs: new Set(),
    planTypes: {},
    states: {},
    assetRanges: {
      under1M: 0,
      '1M-10M': 0,
      '10M-100M': 0,
      over100M: 0
    }
  };

  await new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Parse())
      .on('entry', async function (entry) {
        const fileName = entry.path;
        const type = entry.type; // 'Directory' or 'File'
        const size = entry.vars.uncompressedSize;

        console.log(`  📄 Found: ${fileName} (${(size / 1024 / 1024).toFixed(2)} MB)`);
        stats.files.push({ name: fileName, size });

        // Process main Form 5500 CSV
        if (fileName.toLowerCase().includes('f_5500') && fileName.endsWith('.csv')) {
          console.log(`\n  🔍 Analyzing schema of ${fileName}...\n`);

          let rowNum = 0;
          let headers = null;

          entry
            .pipe(csv())
            .on('headers', (h) => {
              headers = h;
              console.log(`  📊 Found ${headers.length} columns`);
              console.log(`  📋 Key columns we use:`);

              const keyColumns = [
                'SPONS_DFE_EIN',
                'PLAN_NUM',
                'PLAN_NAME',
                'SPONSOR_DFE_NAME',
                'SPONS_DFE_MAIL_US_STATE',
                'SPONS_DFE_MAIL_US_CITY',
                'TYPE_PLAN_ENTITY_CD',
                'TOT_PARTCP_BOB_CNT',
                'TOT_ASSETS_BOB_AMT'
              ];

              keyColumns.forEach(col => {
                if (headers.includes(col)) {
                  console.log(`     ✅ ${col}`);
                } else {
                  console.log(`     ❌ ${col} (not found)`);
                }
              });
            })
            .on('data', (data) => {
              rowNum++;

              // Collect stats
              if (data.SPONS_DFE_EIN) {
                stats.uniqueEINs.add(data.SPONS_DFE_EIN);
              }

              if (data.TYPE_PLAN_ENTITY_CD) {
                stats.planTypes[data.TYPE_PLAN_ENTITY_CD] = (stats.planTypes[data.TYPE_PLAN_ENTITY_CD] || 0) + 1;
              }

              if (data.SPONS_DFE_MAIL_US_STATE) {
                stats.states[data.SPONS_DFE_MAIL_US_STATE] = (stats.states[data.SPONS_DFE_MAIL_US_STATE] || 0) + 1;
              }

              const assets = parseFloat(data.TOT_ASSETS_BOB_AMT || 0);
              if (assets < 1000000) stats.assetRanges.under1M++;
              else if (assets < 10000000) stats.assetRanges['1M-10M']++;
              else if (assets < 100000000) stats.assetRanges['10M-100M']++;
              else stats.assetRanges.over100M++;

              // Save first 3 rows as samples
              if (rowNum <= 3) {
                stats.sampleData.push({
                  row: rowNum,
                  ein: data.SPONS_DFE_EIN,
                  planNumber: data.PLAN_NUM,
                  planName: data.PLAN_NAME?.substring(0, 50),
                  sponsorName: data.SPONSOR_DFE_NAME?.substring(0, 50),
                  state: data.SPONS_DFE_MAIL_US_STATE,
                  participants: data.TOT_PARTCP_BOB_CNT,
                  assets: assets
                });
              }

              // Log progress every 10000 rows
              if (rowNum % 10000 === 0) {
                process.stdout.write(`\r  Processing row ${rowNum.toLocaleString()}...`);
              }
            })
            .on('end', () => {
              stats.rowCount = rowNum;
              console.log(`\n  ✅ Processed ${rowNum.toLocaleString()} rows\n`);
            });
        } else {
          // Skip other files
          entry.autodrain();
        }
      })
      .on('close', () => {
        resolve();
      })
      .on('error', reject);
  });

  // Print analysis results
  console.log('\n========================================');
  console.log('📊 DOL DATA ANALYSIS RESULTS');
  console.log('========================================\n');

  console.log('📁 ZIP Contents:');
  stats.files.forEach(f => {
    console.log(`  - ${f.name}: ${(f.size / 1024 / 1024).toFixed(2)} MB`);
  });

  console.log(`\n📈 Data Statistics:`);
  console.log(`  - Total rows: ${stats.rowCount.toLocaleString()}`);
  console.log(`  - Unique EINs: ${stats.uniqueEINs.size.toLocaleString()}`);

  console.log(`\n📍 Top 5 States by Plan Count:`);
  const topStates = Object.entries(stats.states)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  topStates.forEach(([state, count]) => {
    console.log(`  - ${state}: ${count.toLocaleString()} plans`);
  });

  console.log(`\n💰 Asset Distribution:`);
  Object.entries(stats.assetRanges).forEach(([range, count]) => {
    console.log(`  - ${range}: ${count.toLocaleString()} plans`);
  });

  console.log(`\n📋 Sample Data (first 3 rows):`);
  stats.sampleData.forEach(sample => {
    console.log(`\n  Row ${sample.row}:`);
    console.log(`    EIN: ${sample.ein}`);
    console.log(`    Plan: ${sample.planNumber} - ${sample.planName}`);
    console.log(`    Sponsor: ${sample.sponsorName}`);
    console.log(`    State: ${sample.state}`);
    console.log(`    Participants: ${sample.participants}`);
    console.log(`    Assets: $${sample.assets?.toLocaleString()}`);
  });

  console.log('\n✅ Analysis complete!');

  // Cleanup
  fs.unlinkSync(zipPath);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        const percent = (downloaded / totalSize * 100).toFixed(1);
        process.stdout.write(`\r  Downloading: ${percent}% (${(downloaded / 1024 / 1024).toFixed(1)} MB / ${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log('\n');
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// Run the test
testDOLData().catch(console.error);