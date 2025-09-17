/**
 * GCP configuration for Plan Search API
 * Uses Google Cloud client libraries with Application Default Credentials
 */

import { BigQuery } from '@google-cloud/bigquery';
import { Firestore } from '@google-cloud/firestore';

// Initialize GCP clients - they automatically use ADC in Cloud Functions
export const bigquery = new BigQuery({
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

  // Firestore collections
  collections: {
    retirement_plans: 'retirement_plans',
    search_logs: 'search_logs'
  }
};

/**
 * Helper to get GCP client config
 */
export function getGCPClientConfig() {
  return {
    projectId: GCP_CONFIG.projectId
  };
}

/**
 * Simplified require function for compatibility
 */
export function requireAdminApp() {
  return {
    adminDb: firestore
  };
}