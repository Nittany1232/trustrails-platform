"use strict";
/**
 * Firebase Admin configuration for monorepo services
 * Follows existing TrustRails patterns from lib/firebase-admin.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GCP_CONFIG = exports.serverTimestamp = exports.createTimestamp = exports.adminStorage = exports.adminAuth = exports.adminDb = exports.adminApp = void 0;
exports.requireAdminApp = requireAdminApp;
exports.getGCPClientConfig = getGCPClientConfig;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const storage_1 = require("firebase-admin/storage");
const path_1 = __importDefault(require("path"));
// Service account path - uses existing credentials from main repo
const CREDENTIALS_PATH = path_1.default.resolve(__dirname, '../../../trustrails/credentials/firebase-admin.json');
let adminApp = null;
exports.adminApp = adminApp;
// Initialize Firebase Admin following existing patterns
try {
    console.log('🔧 MONOREPO FIREBASE: Starting initialization...');
    let serviceAccount;
    try {
        // Load from trustrails/credentials
        serviceAccount = require(CREDENTIALS_PATH);
        console.log('✅ MONOREPO FIREBASE: Loaded service account from trustrails/credentials');
        console.log('   Project ID:', serviceAccount.projectId);
    }
    catch (error) {
        console.error('❌ MONOREPO FIREBASE: Could not load credentials:', error);
        // Fall back to environment variables
        serviceAccount = {
            projectId: process.env.FIREBASE_PROJECT_ID || 'trustrails-faa3e',
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        };
        console.log('   Using env vars, Project ID:', serviceAccount.projectId);
    }
    // Check for existing apps
    const existingApps = (0, app_1.getApps)();
    console.log(`🔍 MONOREPO FIREBASE: Found ${existingApps.length} existing apps`);
    exports.adminApp = adminApp = existingApps.find(app => app.name === 'monorepo' || app.name === '[DEFAULT]');
    if (!adminApp) {
        console.log('🚀 MONOREPO FIREBASE: Creating new admin app...');
        exports.adminApp = adminApp = (0, app_1.initializeApp)({
            credential: (0, app_1.cert)(serviceAccount),
            projectId: serviceAccount.projectId,
            storageBucket: `${serviceAccount.projectId}.appspot.com`,
        }, 'monorepo'); // Named app to avoid conflicts
        console.log('✅ MONOREPO FIREBASE: Admin app created successfully');
    }
    else {
        console.log('🔄 MONOREPO FIREBASE: Using existing admin app:', adminApp.name);
    }
}
catch (error) {
    console.error('❌ MONOREPO FIREBASE: Initialization error:', error);
}
exports.adminDb = adminApp ? (0, firestore_1.getFirestore)(adminApp) : null;
exports.adminAuth = adminApp ? (0, auth_1.getAuth)(adminApp) : null;
exports.adminStorage = adminApp ? (0, storage_1.getStorage)(adminApp) : null;
// Utility functions matching main repo patterns
const createTimestamp = () => firestore_1.Timestamp.now();
exports.createTimestamp = createTimestamp;
const serverTimestamp = () => firestore_1.FieldValue.serverTimestamp();
exports.serverTimestamp = serverTimestamp;
/**
 * Required admin app function following main repo pattern
 * All services should use this to ensure Firebase is initialized
 */
function requireAdminApp() {
    if (!adminApp || !exports.adminDb || !exports.adminAuth) {
        console.error('[MONOREPO FIREBASE] Services not initialized');
        console.error('[MONOREPO FIREBASE] Service status:', {
            app: !!adminApp,
            db: !!exports.adminDb,
            auth: !!exports.adminAuth,
            storage: !!exports.adminStorage
        });
        throw new Error('Firebase Admin not initialized - check credentials');
    }
    return {
        adminApp,
        adminDb: exports.adminDb,
        adminAuth: exports.adminAuth,
        adminStorage: exports.adminStorage
    };
}
/**
 * GCP-specific configuration for DOL processing
 */
exports.GCP_CONFIG = {
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
function getGCPClientConfig() {
    return {
        projectId: exports.GCP_CONFIG.projectId,
        keyFilename: CREDENTIALS_PATH
    };
}
//# sourceMappingURL=gcp-config.js.map