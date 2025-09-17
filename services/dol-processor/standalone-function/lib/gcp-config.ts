/**
 * GCP configuration for DOL processor
 * Uses Google Cloud client libraries with Application Default Credentials
 */

import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import { Firestore } from '@google-cloud/firestore';

// Initialize GCP clients - they automatically use ADC in Cloud Functions
export const bigquery = new BigQuery({
  projectId: process.env.FIREBASE_PROJECT_ID || 'trustrails-faa3e'
});

export const storage = new Storage({
  projectId: process.env.FIREBASE_PROJECT_ID || 'trustrails-faa3e'
});

export const firestore = new Firestore({
  projectId: process.env.FIREBASE_PROJECT_ID || 'trustrails-faa3e'
});

// For compatibility with existing code structure
export const adminDb = firestore;

/**
 * GCP configuration constants
 */
export const GCP_CONFIG = {
  projectId: 'trustrails-faa3e',
  region: 'us-central1',

  // BigQuery configuration
  bigquery: {
    datasets: {
      retirement_plans: 'retirement_plans'
    }
  },

  // Cloud Storage buckets
  buckets: {
    dolData: 'trustrails-dol-data'
  },

  // Firestore collections
  collections: {
    retirement_plans: 'retirement_plans',
    dol_sync_metadata: 'dol_sync_metadata',
    search_logs: 'search_logs'
  }
};

/**
 * Helper to get GCP client config
 * In Cloud Functions, this returns empty object to use ADC
 */
export function getGCPClientConfig() {
  // In production, use Application Default Credentials
  if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE) {
    return {
      projectId: GCP_CONFIG.projectId
    };
  }

  // In development, also use ADC (gcloud auth application-default login)
  return {
    projectId: GCP_CONFIG.projectId
  };
}

/**
 * Simplified require function for compatibility
 */
export function requireAdminApp() {
  return {
    adminDb: firestore,
    adminAuth: null, // Not needed for DOL processor
    adminStorage: storage
  };
}