/**
 * DOL Form 5500 Data Processor - Cloud Functions Gen 2
 * Monthly sync of retirement plan data from DOL datasets
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

/**
 * Main DOL sync function - triggered by Cloud Scheduler
 * Deployed as Cloud Functions Gen 2 with 60-minute timeout
 */
export const syncDOLData: HttpFunction = async (req, res) => {
  console.log('🚀 Starting DOL Form 5500 data sync...');

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
      .limit(1)
      .get();

    if (!existingSync.empty) {
      console.log('⏭️ Sync already completed for this month');
      return res.json({
        message: 'Sync already completed for this month',
        monthKey: thisMonth
      });
    }

    // 3. Download DOL dataset
    const datasetUrl = `https://askebsa.dol.gov/FOIA%20Files/${year}/Latest/F_5500_${year}_Latest.zip`;
    console.log(`📥 Downloading dataset from: ${datasetUrl}`);

    const response = await fetch(datasetUrl);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.buffer();
    console.log(`📦 Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);

    // 4. Upload to Cloud Storage for processing
    const bucket = storage.bucket(GCP_CONFIG.buckets.dolData);
    const fileName = `form5500_${year}_${thisMonth}.zip`;
    const file = bucket.file(fileName);

    await file.save(buffer, {
      metadata: {
        contentType: 'application/zip',
        metadata: {
          source: 'DOL EFAST',
          year: String(year),
          month: thisMonth
        }
      }
    });
    console.log(`☁️ Saved to Cloud Storage: gs://${GCP_CONFIG.buckets.dolData}/${fileName}`);

    // 5. Process ZIP file and extract plan data
    const plans = await processZipFile(buffer);
    console.log(`📊 Processed ${plans.length} retirement plans`);

    // 6. Load into BigQuery
    await loadIntoBigQuery(plans, year);
    console.log('✅ Loaded data into BigQuery');

    // 7. Update Firestore cache (top plans only for performance)
    await updateFirestoreCache(plans);
    console.log('✅ Updated Firestore cache');

    // 8. Record successful sync
    await syncMetadata.add({
      monthKey: thisMonth,
      syncDate: new Date(),
      year,
      plansProcessed: plans.length,
      datasetUrl,
      fileName,
      processingTimeMs: Date.now() - startTime,
      status: 'success'
    });

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ DOL sync completed in ${processingTime} seconds`);

    return res.json({
      success: true,
      plansProcessed: plans.length,
      processingTime: `${processingTime}s`,
      monthKey: thisMonth
    });

  } catch (error: any) {
    console.error('❌ Error syncing DOL data:', error);

    // Log failure
    await adminDb.collection(GCP_CONFIG.collections.dol_sync_metadata).add({
      monthKey: `${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
      syncDate: new Date(),
      error: error.message,
      stack: error.stack,
      status: 'failed'
    });

    return res.status(500).json({
      error: 'DOL sync failed',
      message: error.message
    });
  }
};

/**
 * Process ZIP file buffer and extract plan data
 */
async function processZipFile(buffer: Buffer): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const plans: any[] = [];
    const stream = Readable.from(buffer);

    stream
      .pipe(unzipper.Parse())
      .on('entry', (entry: any) => {
        const fileName = entry.path;

        // Process main Form 5500 CSV file
        if (fileName.includes('f_5500_') && fileName.endsWith('.csv')) {
          console.log(`📄 Processing file: ${fileName}`);

          entry
            .pipe(csv())
            .on('data', (data: any) => {
              // Include plans with EIN (plan number not required since many are empty)
              if (data.SPONS_DFE_EIN && data.SPONS_DFE_EIN.trim()) {
                const planNumber = data.SPONS_DFE_PN || data.LAST_RPT_PLAN_NUM || '001';
                const participantCount = parseInt(data.TOT_PARTCP_BOY_CNT || data.TOT_ACTIVE_PARTCP_CNT || '0');

                plans.push({
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
                  filingDate: data.FORM_PLAN_YEAR_BEGIN_DATE || null,
                  formYear: data.FORM_TAX_PRD || String(new Date().getFullYear())
                });
              }
            })
            .on('end', () => {
              console.log(`✅ Extracted ${plans.length} plans from ${fileName}`);
            })
            .on('error', (error: any) => {
              console.error(`Error processing CSV: ${error.message}`);
            });
        } else {
          // Skip other files in the ZIP
          entry.autodrain();
        }
      })
      .on('close', () => {
        console.log(`📦 Finished processing ZIP, total plans: ${plans.length}`);
        resolve(plans);
      })
      .on('error', reject);
  });
}

/**
 * Load processed data into BigQuery
 */
async function loadIntoBigQuery(plans: any[], year: number) {
  const datasetId = GCP_CONFIG.bigquery.datasets.retirement_plans;
  const tableId = `form5500_latest`; // Single table, partitioned by year

  // Create dataset if it doesn't exist
  const dataset = bigquery.dataset(datasetId);
  const [datasetExists] = await dataset.exists();

  if (!datasetExists) {
    await dataset.create({
      location: GCP_CONFIG.region
    });
    console.log(`📊 Created BigQuery dataset: ${datasetId}`);
  }

  // Create or verify table schema
  const table = dataset.table(tableId);
  const [tableExists] = await table.exists();

  if (!tableExists) {
    await table.create({
      schema: [
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

  // Calculate search rank based on assets and participants
  const recordsWithMetadata = plans.map(plan => ({
    ...plan,
    lastUpdated: new Date().toISOString(),
    searchRank: calculateSearchRank(plan)
  }));

  // Insert data in batches of 10,000
  const batchSize = 10000;
  for (let i = 0; i < recordsWithMetadata.length; i += batchSize) {
    const batch = recordsWithMetadata.slice(i, i + batchSize);
    await table.insert(batch, {
      skipInvalidRows: true,
      ignoreUnknownValues: true
    });
    console.log(`📊 Inserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} records)`);
  }

  console.log(`✅ Inserted ${recordsWithMetadata.length} total records into BigQuery`);
}

/**
 * Update Firestore cache with top plans for fast searching
 */
async function updateFirestoreCache(plans: any[]) {
  const collection = adminDb.collection(GCP_CONFIG.collections.retirement_plans);

  // Only cache significant plans (top 5000 by participants and Schedule H indicator)
  const significantPlans = plans
    .filter(plan => plan.participants > 10 || plan.hasScheduleH)
    .sort((a, b) => calculateSearchRank(b) - calculateSearchRank(a))
    .slice(0, 5000);

  console.log(`🔥 Caching ${significantPlans.length} significant plans in Firestore`);

  // Batch write in chunks of 500 (Firestore limit)
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
        lastIndexed: new Date()
      }, { merge: true });
    }

    await batch.commit();
    console.log(`🔥 Cached batch ${Math.floor(i / batchSize) + 1}`);
  }
}

/**
 * Calculate search ranking score for a plan
 */
function calculateSearchRank(plan: any): number {
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

/**
 * Generate search tokens for full-text search
 */
function generateSearchTokens(plan: any): string[] {
  const tokens: string[] = [];

  // Add name tokens
  if (plan.planName) {
    tokens.push(...plan.planName.toLowerCase().split(/\s+/));
  }
  if (plan.sponsorName) {
    tokens.push(...plan.sponsorName.toLowerCase().split(/\s+/));
  }

  // Add location tokens
  if (plan.sponsorCity) tokens.push(plan.sponsorCity.toLowerCase());
  if (plan.sponsorState) tokens.push(plan.sponsorState.toLowerCase());

  // Add identifiers
  tokens.push(plan.ein);
  if (plan.sponsorZip) tokens.push(plan.sponsorZip.substring(0, 5));

  // Remove duplicates and empty strings
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