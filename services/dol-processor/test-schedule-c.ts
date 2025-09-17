/**
 * Standalone Schedule C Test Script
 * Tests Schedule C processing without deploying to Cloud Functions
 */

import * as fs from 'fs';
import * as path from 'path';
import * as unzipper from 'unzipper';
import csv from 'csv-parser';
import { Readable } from 'stream';

// Define interfaces for type safety
interface Form5500Plan {
  ack_id: string;
  ein: string;
  planNumber: string;
  planName: string;
  sponsorName: string;
  sponsorState: string | null;
  sponsorCity: string | null;
  sponsorZip: string | null;
  planType: string;
  participants: number;
  totalAssets: number;
  hasScheduleH: boolean;
  hasScheduleC: boolean;
  filingDate: string | null;
  formYear: string;
  primaryCustodianName?: string | null;
  primaryCustodianEin?: string | null;
  administratorName?: string | null;
  administratorEin?: string | null;
}

interface ScheduleCRecord {
  ack_id: string;
  ein: string;
  plan_number: string;
  service_provider_name: string;
  service_provider_ein: string;
  provider_type: string;
  services_provided: string[];
  form_year: string;
}

interface CustodianSummary {
  name: string;
  ein: string;
  planCount: number;
  totalParticipants: number;
  marketShare: number;
  lastSeen: string;
}

// Test configuration
const TEST_CONFIG = {
  tmpDir: '/tmp',
  form5500File: 'form5500_test.zip',
  scheduleCFile: 'schedule_c_test.zip',
  maxRecords: 10000, // Limit for testing
  sampleSize: 10 // Number of records to show in output
};

/**
 * Main test function
 */
async function testScheduleCProcessing() {
  console.log('🧪 Starting Schedule C Processing Test');
  console.log('=====================================');

  const startTime = Date.now();

  try {
    // 1. Check for test files in /tmp/
    const form5500Path = path.join(TEST_CONFIG.tmpDir, TEST_CONFIG.form5500File);
    const scheduleCPath = path.join(TEST_CONFIG.tmpDir, TEST_CONFIG.scheduleCFile);

    console.log('\n📁 Checking for test files...');

    if (!fs.existsSync(form5500Path)) {
      console.error(`❌ Form 5500 test file not found: ${form5500Path}`);
      console.log('   Please download and place the Form 5500 ZIP file at this location');
      process.exit(1);
    }

    if (!fs.existsSync(scheduleCPath)) {
      console.error(`❌ Schedule C test file not found: ${scheduleCPath}`);
      console.log('   Please download and place the Schedule C ZIP file at this location');
      process.exit(1);
    }

    console.log(`✅ Found Form 5500 file: ${form5500Path}`);
    console.log(`✅ Found Schedule C file: ${scheduleCPath}`);

    // 2. Read and process Form 5500 data
    console.log('\n📊 Processing Form 5500 data...');
    const form5500Buffer = fs.readFileSync(form5500Path);
    const plans = await processForm5500Zip(form5500Buffer);

    console.log(`📊 Processed ${plans.length} retirement plans from Form 5500`);

    // 3. Read and process Schedule C data
    console.log('\n📊 Processing Schedule C data...');
    const scheduleCBuffer = fs.readFileSync(scheduleCPath);
    const scheduleCRecords = await processScheduleCZip(scheduleCBuffer);

    console.log(`📊 Processed ${scheduleCRecords.length} Schedule C service provider records`);

    // 4. Link Schedule C data to plans
    console.log('\n🔗 Linking Schedule C data to plans...');
    const enhancedPlans = linkScheduleCToPlans(plans, scheduleCRecords);

    // 5. Extract custodian summary
    console.log('\n🏛️ Extracting custodian data...');
    const custodianSummary = extractCustodianSummary(scheduleCRecords, enhancedPlans);

    // 6. Show test results
    console.log('\n📈 TEST RESULTS');
    console.log('===============');

    showPlanSample(enhancedPlans);
    showScheduleCSample(scheduleCRecords);
    showCustodianSample(custodianSummary);
    showLinkingStats(plans, enhancedPlans, scheduleCRecords);

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Test completed successfully in ${processingTime} seconds`);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

/**
 * Process Form 5500 ZIP file and extract plan data
 */
async function processForm5500Zip(buffer: Buffer): Promise<Form5500Plan[]> {
  return new Promise((resolve, reject) => {
    const plans: Form5500Plan[] = [];
    const stream = Readable.from(buffer);
    let processed = 0;

    stream
      .pipe(unzipper.Parse())
      .on('entry', (entry: any) => {
        const fileName = entry.path;

        if (fileName.includes('f_5500_') && fileName.endsWith('.csv')) {
          console.log(`📄 Processing Form 5500 file: ${fileName}`);

          entry
            .pipe(csv())
            .on('data', (data: any) => {
              // Stop processing if we've reached the test limit
              if (processed >= TEST_CONFIG.maxRecords) {
                entry.destroy();
                return;
              }

              if (data.SPONS_DFE_EIN && data.SPONS_DFE_EIN.trim() && data.ACK_ID) {
                const planNumber = data.SPONS_DFE_PN || data.LAST_RPT_PLAN_NUM || '001';
                const participantCount = parseInt(data.TOT_PARTCP_BOY_CNT || data.TOT_ACTIVE_PARTCP_CNT || '0');

                plans.push({
                  ack_id: data.ACK_ID,
                  ein: data.SPONS_DFE_EIN,
                  planNumber: planNumber,
                  planName: data.PLAN_NAME || 'Unnamed Plan',
                  sponsorName: data.SPONSOR_DFE_NAME || 'Unknown Sponsor',
                  sponsorState: data.SPONS_DFE_MAIL_US_STATE || null,
                  sponsorCity: data.SPONS_DFE_MAIL_US_CITY || null,
                  sponsorZip: data.SPONS_DFE_MAIL_US_ZIP || null,
                  planType: mapPlanType(data.TYPE_PLAN_ENTITY_CD),
                  participants: participantCount,
                  totalAssets: 0,
                  hasScheduleH: data.SCH_H_ATTACHED_IND === '1',
                  hasScheduleC: data.SCH_C_ATTACHED_IND === '1',
                  filingDate: data.FORM_PLAN_YEAR_BEGIN_DATE || null,
                  formYear: data.FORM_TAX_PRD || String(new Date().getFullYear())
                });

                processed++;
                if (processed % 1000 === 0) {
                  console.log(`   Processed ${processed} Form 5500 records...`);
                }
              }
            })
            .on('end', () => {
              console.log(`✅ Extracted ${plans.length} plans from ${fileName}`);
            })
            .on('error', reject);
        } else {
          entry.autodrain();
        }
      })
      .on('close', () => {
        resolve(plans);
      })
      .on('error', reject);
  });
}

/**
 * Process Schedule C ZIP file and extract service provider data
 */
async function processScheduleCZip(buffer: Buffer): Promise<ScheduleCRecord[]> {
  return new Promise((resolve, reject) => {
    const records: ScheduleCRecord[] = [];
    const stream = Readable.from(buffer);
    let processed = 0;

    stream
      .pipe(unzipper.Parse())
      .on('entry', (entry: any) => {
        const fileName = entry.path;

        if (fileName.includes('f_sch_c_') && fileName.endsWith('.csv')) {
          console.log(`📄 Processing Schedule C file: ${fileName}`);

          entry
            .pipe(csv())
            .on('data', (data: any) => {
              // Stop processing if we've reached the test limit
              if (processed >= TEST_CONFIG.maxRecords) {
                entry.destroy();
                return;
              }

              if (data.ACK_ID && data.SERVICE_PROVIDER_NAME && data.SERVICE_PROVIDER_NAME.trim()) {
                const services = [];

                if (data.INVESTMENT_MGMT_IND === '1') services.push('Investment Management');
                if (data.TRUSTEE_IND === '1') services.push('Trustee/Custodian');
                if (data.RECORDKEEPER_IND === '1') services.push('Recordkeeper');
                if (data.CONSULTING_IND === '1') services.push('Consulting');
                if (data.ADMIN_IND === '1') services.push('Administration');
                if (data.ACTUARIAL_IND === '1') services.push('Actuarial');
                if (data.BROKER_IND === '1') services.push('Broker');
                if (data.OTHER_IND === '1') services.push('Other Services');

                let providerType = 'Other';
                if (data.TRUSTEE_IND === '1') providerType = 'Custodian';
                else if (data.RECORDKEEPER_IND === '1') providerType = 'Recordkeeper';
                else if (data.ADMIN_IND === '1') providerType = 'Administrator';
                else if (data.INVESTMENT_MGMT_IND === '1') providerType = 'Investment Manager';

                records.push({
                  ack_id: data.ACK_ID,
                  ein: data.SPONS_DFE_EIN || '',
                  plan_number: data.SPONS_DFE_PN || '001',
                  service_provider_name: data.SERVICE_PROVIDER_NAME.trim(),
                  service_provider_ein: data.SERVICE_PROVIDER_EIN || '',
                  provider_type: providerType,
                  services_provided: services,
                  form_year: data.FORM_TAX_PRD || String(new Date().getFullYear())
                });

                processed++;
                if (processed % 1000 === 0) {
                  console.log(`   Processed ${processed} Schedule C records...`);
                }
              }
            })
            .on('end', () => {
              console.log(`✅ Extracted ${records.length} service provider records from ${fileName}`);
            })
            .on('error', reject);
        } else {
          entry.autodrain();
        }
      })
      .on('close', () => {
        resolve(records);
      })
      .on('error', reject);
  });
}

/**
 * Link Schedule C data to Form 5500 plans
 */
function linkScheduleCToPlans(plans: Form5500Plan[], scheduleCRecords: ScheduleCRecord[]): Form5500Plan[] {
  const scheduleCByAckId = new Map<string, ScheduleCRecord[]>();

  // Group Schedule C records by ACK_ID
  for (const record of scheduleCRecords) {
    if (!scheduleCByAckId.has(record.ack_id)) {
      scheduleCByAckId.set(record.ack_id, []);
    }
    scheduleCByAckId.get(record.ack_id)!.push(record);
  }

  let linkedCount = 0;

  const enhancedPlans = plans.map(plan => {
    const scheduleCData = scheduleCByAckId.get(plan.ack_id) || [];

    if (scheduleCData.length > 0) {
      linkedCount++;

      const custodian = scheduleCData.find(r => r.provider_type === 'Custodian');
      const administrator = scheduleCData.find(r => r.provider_type === 'Administrator');

      return {
        ...plan,
        hasScheduleC: true,
        primaryCustodianName: custodian?.service_provider_name || null,
        primaryCustodianEin: custodian?.service_provider_ein || null,
        administratorName: administrator?.service_provider_name || null,
        administratorEin: administrator?.service_provider_ein || null
      };
    }

    return {
      ...plan,
      hasScheduleC: false,
      primaryCustodianName: null,
      primaryCustodianEin: null,
      administratorName: null,
      administratorEin: null
    };
  });

  console.log(`🔗 Successfully linked ${linkedCount} of ${plans.length} plans with Schedule C data`);
  return enhancedPlans;
}

/**
 * Extract custodian summary data
 */
function extractCustodianSummary(
  scheduleCRecords: ScheduleCRecord[],
  enhancedPlans: Form5500Plan[]
): CustodianSummary[] {
  const custodianMap = new Map<string, CustodianSummary>();

  // Extract custodians from Schedule C
  for (const record of scheduleCRecords) {
    if (record.provider_type === 'Custodian' && record.service_provider_name) {
      const key = `${record.service_provider_name}|${record.service_provider_ein || 'NO_EIN'}`;

      if (!custodianMap.has(key)) {
        custodianMap.set(key, {
          name: record.service_provider_name,
          ein: record.service_provider_ein || '',
          planCount: 0,
          totalParticipants: 0,
          marketShare: 0,
          lastSeen: record.form_year
        });
      }
    }
  }

  // Calculate plan counts and participants
  for (const plan of enhancedPlans) {
    if (plan.primaryCustodianName) {
      const key = `${plan.primaryCustodianName}|${plan.primaryCustodianEin || 'NO_EIN'}`;
      const custodian = custodianMap.get(key);

      if (custodian) {
        custodian.planCount++;
        custodian.totalParticipants += plan.participants || 0;
      }
    }
  }

  // Calculate market share
  const totalParticipants = Array.from(custodianMap.values())
    .reduce((sum, c) => sum + c.totalParticipants, 0);

  custodianMap.forEach(custodian => {
    custodian.marketShare = totalParticipants > 0
      ? (custodian.totalParticipants / totalParticipants) * 100
      : 0;
  });

  return Array.from(custodianMap.values())
    .sort((a, b) => b.totalParticipants - a.totalParticipants);
}

/**
 * Show sample of enhanced plans
 */
function showPlanSample(enhancedPlans: Form5500Plan[]) {
  console.log('\n🏢 SAMPLE ENHANCED PLANS:');
  console.log('=======================');

  const sample = enhancedPlans
    .filter(p => p.primaryCustodianName)
    .slice(0, TEST_CONFIG.sampleSize);

  sample.forEach((plan, index) => {
    console.log(`\n${index + 1}. ${plan.planName} (${plan.sponsorName})`);
    console.log(`   EIN: ${plan.ein} | Plan #: ${plan.planNumber}`);
    console.log(`   Participants: ${plan.participants.toLocaleString()}`);
    console.log(`   Primary Custodian: ${plan.primaryCustodianName}`);
    if (plan.administratorName) {
      console.log(`   Administrator: ${plan.administratorName}`);
    }
    console.log(`   Plan Type: ${plan.planType}`);
    console.log(`   Has Schedule C: ${plan.hasScheduleC ? 'Yes' : 'No'}`);
  });
}

/**
 * Show sample of Schedule C records
 */
function showScheduleCSample(scheduleCRecords: ScheduleCRecord[]) {
  console.log('\n📋 SAMPLE SCHEDULE C RECORDS:');
  console.log('============================');

  const custodianSample = scheduleCRecords
    .filter(r => r.provider_type === 'Custodian')
    .slice(0, TEST_CONFIG.sampleSize);

  custodianSample.forEach((record, index) => {
    console.log(`\n${index + 1}. ${record.service_provider_name}`);
    console.log(`   Type: ${record.provider_type}`);
    console.log(`   EIN: ${record.service_provider_ein || 'Not provided'}`);
    console.log(`   Services: ${record.services_provided.join(', ')}`);
    console.log(`   Plan EIN: ${record.ein}`);
  });
}

/**
 * Show sample of custodian summary
 */
function showCustodianSample(custodianSummary: CustodianSummary[]) {
  console.log('\n🏛️ TOP CUSTODIANS BY PARTICIPANTS:');
  console.log('==================================');

  const topCustodians = custodianSummary.slice(0, TEST_CONFIG.sampleSize);

  topCustodians.forEach((custodian, index) => {
    console.log(`\n${index + 1}. ${custodian.name}`);
    console.log(`   Plans: ${custodian.planCount.toLocaleString()}`);
    console.log(`   Participants: ${custodian.totalParticipants.toLocaleString()}`);
    console.log(`   Market Share: ${custodian.marketShare.toFixed(2)}%`);
    console.log(`   EIN: ${custodian.ein || 'Not provided'}`);
  });
}

/**
 * Show linking statistics
 */
function showLinkingStats(
  originalPlans: Form5500Plan[],
  enhancedPlans: Form5500Plan[],
  scheduleCRecords: ScheduleCRecord[]
) {
  console.log('\n📊 LINKING STATISTICS:');
  console.log('=====================');

  const plansWithScheduleC = enhancedPlans.filter(p => p.hasScheduleC).length;
  const plansWithCustodian = enhancedPlans.filter(p => p.primaryCustodianName).length;
  const plansWithAdmin = enhancedPlans.filter(p => p.administratorName).length;

  const custodianRecords = scheduleCRecords.filter(r => r.provider_type === 'Custodian').length;
  const adminRecords = scheduleCRecords.filter(r => r.provider_type === 'Administrator').length;
  const recordkeeperRecords = scheduleCRecords.filter(r => r.provider_type === 'Recordkeeper').length;

  console.log(`Total Form 5500 Plans: ${originalPlans.length.toLocaleString()}`);
  console.log(`Plans with Schedule C flag: ${plansWithScheduleC.toLocaleString()} (${((plansWithScheduleC / originalPlans.length) * 100).toFixed(1)}%)`);
  console.log(`Plans with linked custodian: ${plansWithCustodian.toLocaleString()} (${((plansWithCustodian / originalPlans.length) * 100).toFixed(1)}%)`);
  console.log(`Plans with linked administrator: ${plansWithAdmin.toLocaleString()} (${((plansWithAdmin / originalPlans.length) * 100).toFixed(1)}%)`);

  console.log(`\nTotal Schedule C Records: ${scheduleCRecords.length.toLocaleString()}`);
  console.log(`Custodian Records: ${custodianRecords.toLocaleString()}`);
  console.log(`Administrator Records: ${adminRecords.toLocaleString()}`);
  console.log(`Recordkeeper Records: ${recordkeeperRecords.toLocaleString()}`);

  const uniqueAckIds = new Set(scheduleCRecords.map(r => r.ack_id)).size;
  console.log(`Unique ACK_IDs in Schedule C: ${uniqueAckIds.toLocaleString()}`);
}

/**
 * Map DOL plan type codes to readable types
 */
function mapPlanType(code: string): string {
  const typeMap: Record<string, string> = {
    '2A': '401(k)',
    '2B': '403(b)',
    '2C': 'Money Purchase',
    '2D': 'Target Benefit',
    '2E': 'Profit Sharing',
    '2F': 'Defined Benefit',
    '2G': 'ESOP',
    '2H': 'SEP',
    '2I': 'SIMPLE IRA',
    '2J': 'Employee Stock Purchase',
    '2K': 'Profit Sharing 401(k)',
    '2L': 'Annuity',
    '2M': 'Stock Bonus',
    '2R': 'Roth IRA',
    '2S': 'Worker Co-op',
    '2T': 'Other'
  };

  return typeMap[code] || 'Retirement Plan';
}

// Run the test
if (require.main === module) {
  testScheduleCProcessing().catch(console.error);
}

// Export for use as module
export {
  testScheduleCProcessing,
  processForm5500Zip,
  processScheduleCZip,
  linkScheduleCToPlans,
  extractCustodianSummary
};