/**
 * Firebase Admin configuration for monorepo services
 * Follows existing TrustRails patterns from lib/firebase-admin.ts
 */
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
declare let adminApp: any;
export { adminApp };
export declare const adminDb: FirebaseFirestore.Firestore | null;
export declare const adminAuth: import("firebase-admin/auth").Auth | null;
export declare const adminStorage: import("firebase-admin/storage").Storage | null;
export declare const createTimestamp: () => Timestamp;
export declare const serverTimestamp: () => FieldValue;
/**
 * Required admin app function following main repo pattern
 * All services should use this to ensure Firebase is initialized
 */
export declare function requireAdminApp(): {
    adminApp: any;
    adminDb: FirebaseFirestore.Firestore;
    adminAuth: import("firebase-admin/auth").Auth;
    adminStorage: import("firebase-admin/storage").Storage | null;
};
/**
 * GCP-specific configuration for DOL processing
 */
export declare const GCP_CONFIG: {
    projectId: string;
    region: string;
    buckets: {
        dolData: string;
        pbgcData: string;
        tempProcessing: string;
    };
    bigquery: {
        projectId: string;
        datasets: {
            retirement_plans: string;
            search_analytics: string;
        };
    };
    collections: {
        custodians: string;
        users: string;
        events: string;
        widget_sessions: string;
        soc2_audit_events: string;
        retirement_plans: string;
        plan_search_cache: string;
        dol_sync_metadata: string;
    };
};
export declare function getGCPClientConfig(): {
    projectId: string;
    keyFilename: string;
};
//# sourceMappingURL=gcp-config.d.ts.map