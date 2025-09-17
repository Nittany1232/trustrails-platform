/**
 * Firebase Admin configuration for monorepo services
 * Follows existing TrustRails patterns from lib/firebase-admin.ts
 */

import { initializeApp, getApps, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import path from 'path';

// Service account path - uses existing credentials from main repo
const CREDENTIALS_PATH = path.resolve(__dirname, '../../../trustrails/credentials/firebase-admin.json');

let adminApp: any = null;

// Initialize Firebase Admin following existing patterns
try {
  console.log('🔧 MONOREPO FIREBASE: Starting initialization...');

  let serviceAccount: ServiceAccount;

  try {
    // Load from trustrails/credentials
    serviceAccount = require(CREDENTIALS_PATH);
    console.log('✅ MONOREPO FIREBASE: Loaded service account from trustrails/credentials');
    console.log('   Project ID:', serviceAccount.projectId);
  } catch (error) {
    console.error('❌ MONOREPO FIREBASE: Could not load credentials:', error);
    // Fall back to environment variables
    serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID || 'trustrails-faa3e',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')!,
    };
    console.log('   Using env vars, Project ID:', serviceAccount.projectId);
  }

  // Check for existing apps
  const existingApps = getApps();
  console.log(`🔍 MONOREPO FIREBASE: Found ${existingApps.length} existing apps`);

  adminApp = existingApps.find(app => app.name === 'monorepo' || app.name === '[DEFAULT]');

  if (!adminApp) {
    console.log('🚀 MONOREPO FIREBASE: Creating new admin app...');
    adminApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
      storageBucket: `${serviceAccount.projectId}.appspot.com`,
    }, 'monorepo'); // Named app to avoid conflicts
    console.log('✅ MONOREPO FIREBASE: Admin app created successfully');
  } else {
    console.log('🔄 MONOREPO FIREBASE: Using existing admin app:', adminApp.name);
  }
} catch (error) {
  console.error('❌ MONOREPO FIREBASE: Initialization error:', error);
}

// Export services
export { adminApp };
export const adminDb = adminApp ? getFirestore(adminApp) : null;
export const adminAuth = adminApp ? getAuth(adminApp) : null;
export const adminStorage = adminApp ? getStorage(adminApp) : null;

// Utility functions matching main repo patterns
export const createTimestamp = () => Timestamp.now();
export const serverTimestamp = () => FieldValue.serverTimestamp();

/**
 * Required admin app function following main repo pattern
 * All services should use this to ensure Firebase is initialized
 */
export function requireAdminApp() {
  if (!adminApp || !adminDb || !adminAuth) {
    console.error('[MONOREPO FIREBASE] Services not initialized');
    console.error('[MONOREPO FIREBASE] Service status:', {
      app: !!adminApp,
      db: !!adminDb,
      auth: !!adminAuth,
      storage: !!adminStorage
    });

    throw new Error('Firebase Admin not initialized - check credentials');
  }

  return {
    adminApp,
    adminDb,
    adminAuth,
    adminStorage
  };
}

/**
 * GCP-specific configuration for DOL processing
 */
export const GCP_CONFIG = {
  projectId: 'trustrails-faa3e',
  region: 'us-central1',

  // Storage buckets for DOL data
  buckets: {
    dolData: 'trustrails-faa3e-dol-data',
    pbgcData: 'trustrails-faa3e-pbgc-data',
    tempProcessing: 'trustrails-faa3e-temp'
  },

  // BigQuery datasets
  bigquery: {
    projectId: 'trustrails-faa3e',
    datasets: {
      retirement_plans: 'retirement_plans',
      search_analytics: 'search_analytics'
    }
  },

  // Firestore collections
  collections: {
    // Existing collections
    custodians: 'custodians',
    users: 'users',
    events: 'events',
    widget_sessions: 'widget_sessions',
    soc2_audit_events: 'soc2_audit_events',

    // New collections for plan search
    retirement_plans: 'retirement_plans',
    plan_search_cache: 'plan_search_cache',
    dol_sync_metadata: 'dol_sync_metadata'
  }
};

// Export configuration for BigQuery/Storage clients
export function getGCPClientConfig() {
  return {
    projectId: GCP_CONFIG.projectId,
    keyFilename: CREDENTIALS_PATH
  };
}