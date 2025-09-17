/**
 * Firebase Admin SDK Configuration for Widget Auth Service
 * Extracted and adapted from main app
 */

import { initializeApp, getApps, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

// Initialize Firebase Admin SDK
let adminApp: any;

try {
  // Check if we're in a server environment
  if (typeof window === 'undefined') {
    console.log('🔧 WIDGET-AUTH FIREBASE: Initializing...');
    let serviceAccount: ServiceAccount;

    // Try different approaches to load credentials
    const fs = require('fs');
    const path = require('path');

    // Try to find the credentials file
    const possiblePaths = [
      path.resolve(process.cwd(), 'credentials/firebase-admin.json'),
      path.resolve(process.cwd(), 'serviceAccountKey.json'),
      path.resolve(__dirname, '../../credentials/firebase-admin.json'),
      path.resolve(__dirname, '../../serviceAccountKey.json'),
    ];

    let credentialsLoaded = false;
    for (const credPath of possiblePaths) {
      try {
        if (fs.existsSync(credPath)) {
          const rawServiceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
          serviceAccount = {
            projectId: rawServiceAccount.project_id,
            clientEmail: rawServiceAccount.client_email,
            privateKey: rawServiceAccount.private_key,
          };
          console.log('✅ WIDGET-AUTH FIREBASE: Loaded service account from:', credPath);
          console.log('   Project ID:', serviceAccount.projectId);
          credentialsLoaded = true;
          break;
        }
      } catch (error) {
        console.log('⚠️ WIDGET-AUTH FIREBASE: Could not load from', credPath);
      }
    }

    if (!credentialsLoaded) {
      console.log('⚠️ WIDGET-AUTH FIREBASE: No credentials file found, trying env vars');
      // Fall back to environment variables
      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')!,
      };
      console.log('   Project ID from env:', serviceAccount.projectId);
    }

    // Initialize admin app if it doesn't exist
    const existingApps = getApps();
    console.log(`🔍 WIDGET-AUTH FIREBASE: Found ${existingApps.length} existing apps:`, existingApps.map(app => app.name));

    // Check if we already have an admin app or default app
    adminApp = existingApps.find(app => app.name === 'widget-auth' || app.name === '[DEFAULT]');

    if (!adminApp) {
      console.log('🚀 WIDGET-AUTH FIREBASE: Creating new admin app...');
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.projectId,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.projectId}.appspot.com`,
      }, 'widget-auth');
      console.log('✅ WIDGET-AUTH FIREBASE: Admin app created successfully');
    } else {
      console.log('🔄 WIDGET-AUTH FIREBASE: Using existing admin app:', adminApp.name);
    }

    if (adminApp) {
      console.log('✅ WIDGET-AUTH FIREBASE: Admin app available');
    } else {
      console.log('❌ WIDGET-AUTH FIREBASE: Admin app is null');
    }
  }
} catch (error) {
  console.error('❌ WIDGET-AUTH FIREBASE: Initialization error:', error);
}

// Export the admin app itself
export { adminApp };

// Get services
export const adminDb = adminApp ? getFirestore(adminApp) : null;
export const adminAuth = adminApp ? getAuth(adminApp) : null;
export const adminStorage = adminApp ? getStorage(adminApp) : null;

// Helper function to check if Firebase Admin is initialized
export function isFirebaseAdminInitialized(): boolean {
  return !!adminApp && !!adminDb && !!adminAuth;
}

// Utility functions for safe operations
export const createTimestamp = () => Timestamp.now();
export const serverTimestamp = () => FieldValue.serverTimestamp();

/**
 * Utility function to safely use admin services with proper error handling
 */
export function requireAdminApp() {
  // Check if services are initialized
  if (!adminApp || !adminDb || !adminAuth) {
    console.error('[WIDGET-AUTH FIREBASE] Services not initialized');

    // Log specific missing components for debugging
    console.error('[WIDGET-AUTH FIREBASE] Service status:', {
      app: !!adminApp,
      db: !!adminDb,
      auth: !!adminAuth,
      storage: !!adminStorage
    });

    // The initialization happens at module load time
    // If we get here, it means the initialization failed at module load
    throw new Error('Firebase Admin SDK not properly initialized. Check service account credentials and environment variables.');
  }

  return { adminApp, adminDb, adminAuth, adminStorage };
}