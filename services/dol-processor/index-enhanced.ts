/**
 * Enhanced DOL Form 5500 Data Processor with Schedule C Support
 * Processes both Form 5500 and Schedule C data for comprehensive custodian insights
 */

import { HttpFunction } from '@google-cloud/functions-framework';
import { requireAdminApp, GCP_CONFIG, getGCPClientConfig } from '../../lib/gcp-config';
import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import fetch from 'node-fetch';
import * as unzipper from 'unzipper';
import csv from 'csv-parser';
import { Readable } from 'stream';

// Initialize services using existing patterns
const { adminDb } = requireAdminApp();
const bigquery = new BigQuery(getGCPClientConfig());
const storage = new Storage(getGCPClientConfig());

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

/**
 * Enhanced DOL sync function with Schedule C processing
 */
export const syncDOLDataEnhanced: HttpFunction = async (req, res) => {
  console.log('🚀 Starting Enhanced DOL Form 5500 + Schedule C data sync...');

  const startTime = Date.now();
  const year = new Date().getFullYear();

  try {
    // 1. Validate request (only accept from Cloud Scheduler)
    const authHeader = req.headers['authorization'];
    if (!authHeader && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // 2. Check if sync already ran this month
    const syncMetadata = adminDb.collection(GCP_CONFIG.collections.dol_sync_metadata);
    const thisMonth = `${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const existingSync = await syncMetadata
      .where('monthKey', '==', thisMonth)
      .where('status', '==', 'success')
      .where('includesScheduleC', '==', true)
      .limit(1)
      .get();

    if (!existingSync.empty) {
      console.log('⏭️ Enhanced sync already completed for this month');
      return res.json({
        message: 'Enhanced sync already completed for this month',
        monthKey: thisMonth
      });
    }

    // 3. Download both Form 5500 and Schedule C datasets
    console.log('📥 Downloading Form 5500 dataset...');
    const form5500Url = `https://askebsa.dol.gov/FOIA%20Files/${year}/Latest/F_5500_${year}_Latest.zip`;
    const form5500Buffer = await downloadDataset(form5500Url);

    console.log('📥 Downloading Schedule C dataset...');
    const scheduleCUrl = `https://askebsa.dol.gov/FOIA%20Files/${year}/Latest/F_SCH_C_${year}_Latest.zip`;
    const scheduleCBuffer = await downloadDataset(scheduleCUrl);

    // 4. Upload both to Cloud Storage for processing
    const bucket = storage.bucket(GCP_CONFIG.buckets.dolData);

    const form5500FileName = `form5500_${year}_${thisMonth}.zip`;
    const scheduleCFileName = `schedule_c_${year}_${thisMonth}.zip`;

    await uploadToStorage(bucket, form5500FileName, form5500Buffer, 'Form 5500');
    await uploadToStorage(bucket, scheduleCFileName, scheduleCBuffer, 'Schedule C');

    // 5. Process Form 5500 data and extract ACK_ID for linking
    console.log('📊 Processing Form 5500 data...');
    const plans = await processForm5500Zip(form5500Buffer);
    console.log(`📊 Processed ${plans.length} retirement plans from Form 5500`);

    // 6. Process Schedule C data with streaming
    console.log('📊 Processing Schedule C data...');
    const scheduleCRecords = await processScheduleCZip(scheduleCBuffer);
    console.log(`📊 Processed ${scheduleCRecords.length} Schedule C service provider records`);

    // 7. Link Schedule C data to plans and identify custodians
    console.log('🔗 Linking Schedule C data to plans...');
    const enhancedPlans = linkScheduleCToPlans(plans, scheduleCRecords);
    console.log('✅ Successfully linked Schedule C data to plans');

    // 8. Create BigQuery tables and load data
    await createAndLoadBigQueryTables(enhancedPlans, scheduleCRecords, year);
    console.log('✅ Loaded data into BigQuery tables');

    // 9. Extract and store unique custodian list
    const custodianSummary = await extractAndStoreCustodians(scheduleCRecords, enhancedPlans);
    console.log(`✅ Extracted ${custodianSummary.length} unique custodians to Firestore`);

    // 10. Update Firestore cache with enhanced data
    await updateFirestoreCacheEnhanced(enhancedPlans);
    console.log('✅ Updated Firestore cache with enhanced plan data');

    // 11. Record successful sync
    await syncMetadata.add({
      monthKey: thisMonth,
      syncDate: new Date(),
      year,
      plansProcessed: plans.length,
      scheduleCRecordsProcessed: scheduleCRecords.length,
      custodiansExtracted: custodianSummary.length,
      form5500Url,
      scheduleCUrl,
      form5500FileName,
      scheduleCFileName,
      includesScheduleC: true,
      processingTimeMs: Date.now() - startTime,
      status: 'success'
    });

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Enhanced DOL sync completed in ${processingTime} seconds`);

    return res.json({
      success: true,
      plansProcessed: plans.length,
      scheduleCRecordsProcessed: scheduleCRecords.length,
      custodiansExtracted: custodianSummary.length,
      processingTime: `${processingTime}s`,
      monthKey: thisMonth,
      enhanced: true
    });

  } catch (error: any) {
    console.error('❌ Error in enhanced DOL sync:', error);

    // Log failure
    await adminDb.collection(GCP_CONFIG.collections.dol_sync_metadata).add({
      monthKey: `${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
      syncDate: new Date(),
      error: error.message,
      stack: error.stack,
      includesScheduleC: true,
      status: 'failed'
    });

    return res.status(500).json({
      error: 'Enhanced DOL sync failed',
      message: error.message
    });
  }
};

/**
 * Download dataset from DOL URL
 */
async function downloadDataset(url: string): Promise<Buffer> {
  console.log(`📥 Downloading dataset from: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.buffer();
  console.log(`📦 Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)}MB from ${url}`);
  return buffer;
}

/**
 * Upload buffer to Cloud Storage
 */
async function uploadToStorage(bucket: any, fileName: string, buffer: Buffer, description: string) {
  const file = bucket.file(fileName);

  await file.save(buffer, {
    metadata: {
      contentType: 'application/zip',
      metadata: {
        source: 'DOL EFAST',
        description,
        uploadDate: new Date().toISOString()
      }
    }
  });

  console.log(`☁️ Saved ${description} to Cloud Storage: gs://${bucket.name}/${fileName}`);
}

/**
 * Process Form 5500 ZIP file and extract plan data with ACK_ID
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

        // Process main Form 5500 CSV file
        if (fileName.includes('f_5500_') && fileName.endsWith('.csv')) {
          console.log(`📄 Processing Form 5500 file: ${fileName}`);

          entry
            .pipe(csv())
            .on('data', (data: any) => {
              // Include plans with EIN and ACK_ID for linking
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
                  totalAssets: 0, // Asset data not available in basic Form 5500 file
                  hasScheduleH: data.SCH_H_ATTACHED_IND === '1',
                  hasScheduleC: data.SCH_C_ATTACHED_IND === '1',
                  filingDate: data.FORM_PLAN_YEAR_BEGIN_DATE || null,
                  formYear: data.FORM_TAX_PRD || String(new Date().getFullYear())
                });

                processed++;
                if (processed % 1000 === 0) {
                  console.log(`📊 Processed ${processed} Form 5500 records...`);
                }
              }
            })
            .on('end', () => {
              console.log(`✅ Extracted ${plans.length} plans from ${fileName}`);
            })
            .on('error', (error: any) => {
              console.error(`Error processing Form 5500 CSV: ${error.message}`);
            });
        } else {
          // Skip other files in the ZIP
          entry.autodrain();
        }
      })
      .on('close', () => {
        console.log(`📦 Finished processing Form 5500 ZIP, total plans: ${plans.length}`);
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

        // Process Schedule C CSV file
        if (fileName.includes('f_sch_c_') && fileName.endsWith('.csv')) {
          console.log(`📄 Processing Schedule C file: ${fileName}`);

          entry
            .pipe(csv())
            .on('data', (data: any) => {
              // Process service provider records
              if (data.ACK_ID && data.SERVICE_PROVIDER_NAME && data.SERVICE_PROVIDER_NAME.trim()) {
                const services = [];

                // Map service type codes to readable descriptions
                if (data.INVESTMENT_MGMT_IND === '1') services.push('Investment Management');
                if (data.TRUSTEE_IND === '1') services.push('Trustee/Custodian');
                if (data.RECORDKEEPER_IND === '1') services.push('Recordkeeper');
                if (data.CONSULTING_IND === '1') services.push('Consulting');
                if (data.ADMIN_IND === '1') services.push('Administration');
                if (data.ACTUARIAL_IND === '1') services.push('Actuarial');
                if (data.BROKER_IND === '1') services.push('Broker');
                if (data.OTHER_IND === '1') services.push('Other Services');

                // Determine primary provider type
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
                  console.log(`📊 Processed ${processed} Schedule C records...`);
                }
              }
            })
            .on('end', () => {
              console.log(`✅ Extracted ${records.length} service provider records from ${fileName}`);
            })
            .on('error', (error: any) => {
              console.error(`Error processing Schedule C CSV: ${error.message}`);
            });
        } else {
          // Skip other files in the ZIP
          entry.autodrain();
        }
      })
      .on('close', () => {
        console.log(`📦 Finished processing Schedule C ZIP, total records: ${records.length}`);
        resolve(records);
      })
      .on('error', reject);
  });
}

/**
 * Link Schedule C data to Form 5500 plans
 */
function linkScheduleCToPlans(plans: Form5500Plan[], scheduleCRecords: ScheduleCRecord[]): Form5500Plan[] {
  console.log('🔗 Linking Schedule C records to plans...');

  // Create lookup maps for efficient linking
  const scheduleCByAckId = new Map<string, ScheduleCRecord[]>();

  // Group Schedule C records by ACK_ID
  for (const record of scheduleCRecords) {
    if (!scheduleCByAckId.has(record.ack_id)) {
      scheduleCByAckId.set(record.ack_id, []);
    }
    scheduleCByAckId.get(record.ack_id)!.push(record);
  }

  let linkedCount = 0;

  // Enhance plans with Schedule C data
  const enhancedPlans = plans.map(plan => {
    const scheduleCData = scheduleCByAckId.get(plan.ack_id) || [];

    if (scheduleCData.length > 0) {
      linkedCount++;

      // Find primary custodian (first trustee/custodian)
      const custodian = scheduleCData.find(r => r.provider_type === 'Custodian');

      // Find administrator
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
 * Create BigQuery tables and load enhanced data
 */
async function createAndLoadBigQueryTables(
  enhancedPlans: Form5500Plan[],
  scheduleCRecords: ScheduleCRecord[],
  year: number
) {
  const datasetId = GCP_CONFIG.bigquery.datasets.retirement_plans;
  const dataset = bigquery.dataset(datasetId);

  // Create dataset if it doesn't exist
  const [datasetExists] = await dataset.exists();
  if (!datasetExists) {
    await dataset.create({ location: GCP_CONFIG.region });
    console.log(`📊 Created BigQuery dataset: ${datasetId}`);
  }

  // 1. Create/update form5500_latest table with denormalized Schedule C data
  await createAndLoadForm5500Table(dataset, enhancedPlans);

  // 2. Create normalized form5500_schedule_c table
  await createAndLoadScheduleCTable(dataset, scheduleCRecords);

  console.log('✅ Created and loaded BigQuery tables successfully');
}

/**
 * Create and load enhanced Form 5500 table
 */
async function createAndLoadForm5500Table(dataset: any, enhancedPlans: Form5500Plan[]) {
  const tableId = 'form5500_latest';
  const table = dataset.table(tableId);

  const [tableExists] = await table.exists();
  if (!tableExists) {
    await table.create({
      schema: [
        { name: 'ack_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'ein', type: 'STRING', mode: 'REQUIRED' },
        { name: 'planNumber', type: 'STRING', mode: 'REQUIRED' },
        { name: 'planName', type: 'STRING', mode: 'NULLABLE' },
        { name: 'sponsorName', type: 'STRING', mode: 'NULLABLE' },
        { name: 'sponsorState', type: 'STRING', mode: 'NULLABLE' },
        { name: 'sponsorCity', type: 'STRING', mode: 'NULLABLE' },
        { name: 'sponsorZip', type: 'STRING', mode: 'NULLABLE' },
        { name: 'planType', type: 'STRING', mode: 'NULLABLE' },
        { name: 'participants', type: 'INTEGER', mode: 'NULLABLE' },
        { name: 'totalAssets', type: 'FLOAT', mode: 'NULLABLE' },
        { name: 'hasScheduleH', type: 'BOOLEAN', mode: 'NULLABLE' },
        { name: 'hasScheduleC', type: 'BOOLEAN', mode: 'NULLABLE' },
        { name: 'primaryCustodianName', type: 'STRING', mode: 'NULLABLE' },
        { name: 'primaryCustodianEin', type: 'STRING', mode: 'NULLABLE' },
        { name: 'administratorName', type: 'STRING', mode: 'NULLABLE' },
        { name: 'administratorEin', type: 'STRING', mode: 'NULLABLE' },
        { name: 'filingDate', type: 'STRING', mode: 'NULLABLE' },
        { name: 'formYear', type: 'STRING', mode: 'REQUIRED' },
        { name: 'lastUpdated', type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'searchRank', type: 'INTEGER', mode: 'NULLABLE' }
      ],
      timePartitioning: {
        type: 'MONTHLY',
        field: 'lastUpdated'
      }
    });
    console.log(`📊 Created BigQuery table: ${tableId}`);
  }

  // Add metadata and load data
  const recordsWithMetadata = enhancedPlans.map(plan => ({
    ...plan,
    lastUpdated: new Date().toISOString(),
    searchRank: calculateSearchRank(plan)
  }));

  // Insert data in batches
  const batchSize = 10000;
  for (let i = 0; i < recordsWithMetadata.length; i += batchSize) {
    const batch = recordsWithMetadata.slice(i, i + batchSize);
    await table.insert(batch, {
      skipInvalidRows: true,
      ignoreUnknownValues: true
    });
    console.log(`📊 Inserted Form 5500 batch ${Math.floor(i / batchSize) + 1} (${batch.length} records)`);
  }
}

/**
 * Create and load normalized Schedule C table
 */
async function createAndLoadScheduleCTable(dataset: any, scheduleCRecords: ScheduleCRecord[]) {
  const tableId = 'form5500_schedule_c';
  const table = dataset.table(tableId);

  const [tableExists] = await table.exists();
  if (!tableExists) {
    await table.create({
      schema: [
        { name: 'ack_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'ein', type: 'STRING', mode: 'NULLABLE' },
        { name: 'plan_number', type: 'STRING', mode: 'NULLABLE' },
        { name: 'service_provider_name', type: 'STRING', mode: 'REQUIRED' },
        { name: 'service_provider_ein', type: 'STRING', mode: 'NULLABLE' },
        { name: 'provider_type', type: 'STRING', mode: 'NULLABLE' },
        { name: 'services_provided', type: 'STRING', mode: 'REPEATED' },
        { name: 'form_year', type: 'STRING', mode: 'REQUIRED' },
        { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' }
      ]
    });
    console.log(`📊 Created BigQuery table: ${tableId}`);
  }

  // Add metadata and load data
  const recordsWithMetadata = scheduleCRecords.map(record => ({
    ...record,
    created_at: new Date().toISOString()
  }));

  // Insert data in batches
  const batchSize = 10000;
  for (let i = 0; i < recordsWithMetadata.length; i += batchSize) {
    const batch = recordsWithMetadata.slice(i, i + batchSize);
    await table.insert(batch, {
      skipInvalidRows: true,
      ignoreUnknownValues: true
    });
    console.log(`📊 Inserted Schedule C batch ${Math.floor(i / batchSize) + 1} (${batch.length} records)`);
  }
}

/**
 * Extract unique custodians and store in Firestore
 */
async function extractAndStoreCustodians(
  scheduleCRecords: ScheduleCRecord[],
  enhancedPlans: Form5500Plan[]
): Promise<CustodianSummary[]> {
  console.log('🏛️ Extracting unique custodians...');

  // Group by custodian name and EIN
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

  // Calculate plan counts and participants for each custodian
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

  const custodians = Array.from(custodianMap.values())
    .sort((a, b) => b.totalParticipants - a.totalParticipants);

  // Store in Firestore
  const custodiansCollection = adminDb.collection('dol_custodians');

  // Clear existing data
  const batch = adminDb.batch();
  const existing = await custodiansCollection.get();
  existing.docs.forEach(doc => batch.delete(doc.ref));

  // Add new custodian data
  custodians.forEach((custodian, index) => {
    const docRef = custodiansCollection.doc(`custodian_${index + 1}`);
    batch.set(docRef, {
      ...custodian,
      rank: index + 1,
      extractedAt: new Date(),
      source: 'DOL_SCHEDULE_C'
    });
  });

  await batch.commit();
  console.log(`🏛️ Stored ${custodians.length} custodians in Firestore`);

  return custodians;
}

/**
 * Update Firestore cache with enhanced plan data
 */
async function updateFirestoreCacheEnhanced(enhancedPlans: Form5500Plan[]) {
  const collection = adminDb.collection(GCP_CONFIG.collections.retirement_plans);

  // Only cache significant plans
  const significantPlans = enhancedPlans
    .filter(plan => plan.participants > 10 || plan.hasScheduleH || plan.hasScheduleC)
    .sort((a, b) => calculateSearchRank(b) - calculateSearchRank(a))
    .slice(0, 5000);

  console.log(`🔥 Caching ${significantPlans.length} significant enhanced plans in Firestore`);

  // Batch write in chunks of 500
  const batchSize = 500;
  for (let i = 0; i < significantPlans.length; i += batchSize) {
    const batch = adminDb.batch();
    const chunk = significantPlans.slice(i, i + batchSize);

    for (const plan of chunk) {
      const docId = `${plan.ein}_${plan.planNumber}`.replace(/[^a-zA-Z0-9_]/g, '_');
      const docRef = collection.doc(docId);

      batch.set(docRef, {
        ...plan,
        searchTokens: generateSearchTokens(plan),
        searchRank: calculateSearchRank(plan),
        lastUpdated: new Date(),
        lastIndexed: new Date(),
        enhanced: true
      }, { merge: true });
    }

    await batch.commit();
    console.log(`🔥 Cached enhanced batch ${Math.floor(i / batchSize) + 1}`);
  }
}

/**
 * Calculate enhanced search ranking score
 */
function calculateSearchRank(plan: Form5500Plan): number {
  let rank = 0;

  // Weight by participants
  if (plan.participants > 0) {
    rank += Math.log10(plan.participants) * 20;
  }

  // Boost for having Schedule H
  if (plan.hasScheduleH) rank += 30;

  // Boost for having Schedule C with custodian data
  if (plan.hasScheduleC) rank += 25;
  if (plan.primaryCustodianName) rank += 40;

  // Boost for complete data
  if (plan.planName && plan.sponsorName) rank += 20;
  if (plan.sponsorCity && plan.sponsorState) rank += 10;

  // Boost for plan type
  if (plan.planType === '401(k)') rank += 15;

  return Math.round(rank);
}

/**
 * Generate enhanced search tokens
 */
function generateSearchTokens(plan: Form5500Plan): string[] {
  const tokens: string[] = [];

  // Add existing tokens
  if (plan.planName) {
    tokens.push(...plan.planName.toLowerCase().split(/\s+/));
  }
  if (plan.sponsorName) {
    tokens.push(...plan.sponsorName.toLowerCase().split(/\s+/));
  }

  // Add custodian and administrator tokens
  if (plan.primaryCustodianName) {
    tokens.push(...plan.primaryCustodianName.toLowerCase().split(/\s+/));
  }
  if (plan.administratorName) {
    tokens.push(...plan.administratorName.toLowerCase().split(/\s+/));
  }

  // Add location tokens
  if (plan.sponsorCity) tokens.push(plan.sponsorCity.toLowerCase());
  if (plan.sponsorState) tokens.push(plan.sponsorState.toLowerCase());

  // Add identifiers
  tokens.push(plan.ein);
  if (plan.sponsorZip) tokens.push(plan.sponsorZip.substring(0, 5));

  return [...new Set(tokens.filter(t => t && t.length > 1))];
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