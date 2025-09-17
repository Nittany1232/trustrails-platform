/**
 * Test improved DOL data processing logic
 * Tests the fixes for field mapping and filtering issues
 */

const csv = require('csv-parser');
const fs = require('fs');

async function testImprovedProcessing() {
  console.log('🧪 Testing Improved DOL Data Processing...\n');

  const csvPath = '/tmp/f_5500_2024_latest.csv';

  if (!fs.existsSync(csvPath)) {
    console.log('❌ CSV file not found. Please run test-dol-data.js first.');
    return;
  }

  const stats = {
    totalRows: 0,
    plansWithEIN: 0,
    plansWithParticipants: 0,
    plansWithScheduleH: 0,
    validPlans: 0,
    samplePlans: [],
    participantDistribution: {
      '0': 0,
      '1-10': 0,
      '11-100': 0,
      '101-1000': 0,
      '1001+': 0
    },
    topPlansByParticipants: []
  };

  console.log('📊 Processing CSV with improved logic...\n');

  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (data) => {
        stats.totalRows++;

        // Apply improved filtering logic
        if (data.SPONS_DFE_EIN && data.SPONS_DFE_EIN.trim()) {
          stats.plansWithEIN++;

          const planNumber = data.SPONS_DFE_PN || data.LAST_RPT_PLAN_NUM || '001';
          const participantCount = parseInt(data.TOT_PARTCP_BOY_CNT || data.TOT_ACTIVE_PARTCP_CNT || '0');
          const hasScheduleH = data.SCH_H_ATTACHED_IND === '1';

          if (participantCount > 0) {
            stats.plansWithParticipants++;
          }

          if (hasScheduleH) {
            stats.plansWithScheduleH++;
          }

          // This would be included in the processed plans
          stats.validPlans++;

          const plan = {
            ein: data.SPONS_DFE_EIN,
            planNumber: planNumber,
            planName: data.PLAN_NAME || 'Unnamed Plan',
            sponsorName: data.SPONSOR_DFE_NAME || 'Unknown Sponsor',
            sponsorState: data.SPONS_DFE_MAIL_US_STATE || null,
            sponsorCity: data.SPONS_DFE_MAIL_US_CITY || null,
            sponsorZip: data.SPONS_DFE_MAIL_US_ZIP || null,
            planType: mapPlanType(data.TYPE_PLAN_ENTITY_CD),
            participants: participantCount,
            totalAssets: 0, // Not available in basic Form 5500
            hasScheduleH: hasScheduleH,
            filingDate: data.FORM_PLAN_YEAR_BEGIN_DATE || null,
            formYear: data.FORM_TAX_PRD || '2024',
            searchRank: calculateSearchRank({
              participants: participantCount,
              hasScheduleH: hasScheduleH,
              planName: data.PLAN_NAME,
              sponsorName: data.SPONSOR_DFE_NAME,
              sponsorCity: data.SPONS_DFE_MAIL_US_CITY,
              sponsorState: data.SPONS_DFE_MAIL_US_STATE,
              planType: mapPlanType(data.TYPE_PLAN_ENTITY_CD)
            })
          };

          // Collect participant distribution
          if (participantCount === 0) {
            stats.participantDistribution['0']++;
          } else if (participantCount <= 10) {
            stats.participantDistribution['1-10']++;
          } else if (participantCount <= 100) {
            stats.participantDistribution['11-100']++;
          } else if (participantCount <= 1000) {
            stats.participantDistribution['101-1000']++;
          } else {
            stats.participantDistribution['1001+']++;
          }

          // Keep top plans by participants for analysis
          if (participantCount > 0) {
            stats.topPlansByParticipants.push(plan);
            stats.topPlansByParticipants.sort((a, b) => b.participants - a.participants);
            if (stats.topPlansByParticipants.length > 10) {
              stats.topPlansByParticipants = stats.topPlansByParticipants.slice(0, 10);
            }
          }

          // Keep first 5 valid plans as samples
          if (stats.samplePlans.length < 5) {
            stats.samplePlans.push(plan);
          }
        }

        // Progress indicator
        if (stats.totalRows % 10000 === 0) {
          process.stdout.write(`\r  Processed ${stats.totalRows.toLocaleString()} rows...`);
        }
      })
      .on('end', () => {
        console.log(`\n  ✅ Finished processing ${stats.totalRows.toLocaleString()} rows\n`);
        resolve();
      })
      .on('error', reject);
  });

  // Print results
  console.log('========================================');
  console.log('🧪 IMPROVED PROCESSING RESULTS');
  console.log('========================================\n');

  console.log('📈 Processing Statistics:');
  console.log(`  - Total rows processed: ${stats.totalRows.toLocaleString()}`);
  console.log(`  - Plans with valid EIN: ${stats.plansWithEIN.toLocaleString()}`);
  console.log(`  - Plans with participants: ${stats.plansWithParticipants.toLocaleString()}`);
  console.log(`  - Plans with Schedule H: ${stats.plansWithScheduleH.toLocaleString()}`);
  console.log(`  - Valid plans (would be processed): ${stats.validPlans.toLocaleString()}`);
  console.log(`  - Improvement: ${((stats.validPlans / 2283 - 1) * 100).toFixed(1)}% more plans processed\n`);

  console.log('👥 Participant Distribution:');
  Object.entries(stats.participantDistribution).forEach(([range, count]) => {
    console.log(`  - ${range} participants: ${count.toLocaleString()} plans`);
  });

  console.log('\n🏆 Top 5 Plans by Participants:');
  stats.topPlansByParticipants.slice(0, 5).forEach((plan, i) => {
    console.log(`  ${i + 1}. ${plan.sponsorName} - ${plan.planName.substring(0, 50)}`);
    console.log(`     Participants: ${plan.participants.toLocaleString()}, Schedule H: ${plan.hasScheduleH}, Rank: ${plan.searchRank}`);
  });

  console.log('\n📋 Sample Processed Plans:');
  stats.samplePlans.forEach((plan, i) => {
    console.log(`\n  Plan ${i + 1}:`);
    console.log(`    EIN: ${plan.ein}, Plan #: ${plan.planNumber}`);
    console.log(`    Name: ${plan.planName.substring(0, 60)}`);
    console.log(`    Sponsor: ${plan.sponsorName.substring(0, 60)}`);
    console.log(`    Location: ${plan.sponsorCity}, ${plan.sponsorState}`);
    console.log(`    Participants: ${plan.participants}, Schedule H: ${plan.hasScheduleH}`);
    console.log(`    Search Rank: ${plan.searchRank}`);
  });

  console.log('\n✅ Improved processing test complete!');
  console.log(`\n🎯 Summary: Processing ${stats.validPlans.toLocaleString()} plans instead of 2,283`);
  console.log(`   This represents a ${((stats.validPlans / stats.totalRows) * 100).toFixed(1)}% capture rate from the total dataset.`);
}

/**
 * Map DOL plan type codes to readable types
 */
function mapPlanType(code) {
  const typeMap = {
    '2': '401(k)', // Most common
    '3': '403(b)',
    '4': 'Money Purchase',
    '5': 'Target Benefit',
    '6': 'Profit Sharing',
    '7': 'Defined Benefit',
    '8': 'ESOP',
    '9': 'SEP',
    'A': 'SIMPLE IRA',
    'B': 'Employee Stock Purchase',
    'C': 'Profit Sharing 401(k)',
    'D': 'Annuity',
    'E': 'Stock Bonus',
    'F': 'Roth IRA',
    'G': 'Worker Co-op'
  };

  return typeMap[code] || 'Retirement Plan';
}

/**
 * Calculate search ranking score for a plan (improved version)
 */
function calculateSearchRank(plan) {
  let rank = 0;

  // Weight by participants (primary ranking factor since no asset data)
  if (plan.participants > 0) {
    rank += Math.log10(plan.participants) * 20; // Increased weight
  }

  // Boost for having Schedule H (indicates larger plans)
  if (plan.hasScheduleH) rank += 30;

  // Boost for having complete data
  if (plan.planName && plan.sponsorName) rank += 20;
  if (plan.sponsorCity && plan.sponsorState) rank += 10;

  // Boost for plan type (401k plans are typically larger)
  if (plan.planType === '401(k)') rank += 15;

  return Math.round(rank);
}

// Run the test
testImprovedProcessing().catch(console.error);