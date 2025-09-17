/**
 * Simplified Audit Logger for Widget Auth Service
 * Extracted and simplified from main app
 */

import { requireAdminApp } from '@/lib/firebase-admin';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { AuditEventCategory, AuditSeverity } from '@/types/audit-enums';

// Initialize Google Cloud Logging with dynamic import
let logging: any = null;
let auditLog: any = null;

async function initializeLogging() {
  if (!logging) {
    // Dynamic import to prevent client-side bundling
    const { Logging } = await import('@google-cloud/logging');
    logging = new Logging({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'trustrails-faa3e',
    });
    // Use 'widget-auth-audit' log name for this service
    auditLog = logging.log('widget-auth-audit');
  }
  return { logging, auditLog };
}

// Import and re-export enums to maintain backward compatibility
export { AuditEventCategory, AuditSeverity } from '@/types/audit-enums';

// Simplified audit event schema for widget auth service
export interface WidgetAuditEvent {
  // Core fields (required)
  eventId: string;
  eventType: string;
  category: AuditEventCategory;
  timestamp: string;
  severity: AuditSeverity;

  // Actor information
  userId?: string;
  userEmail?: string;

  // Context
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;

  // Resource information
  custodianId?: string;

  // Operation details
  action?: string;
  method?: string;
  path?: string;
  status?: 'success' | 'failure' | 'pending';
  errorCode?: string;
  errorMessage?: string;

  // Additional context
  metadata?: Record<string, any>;

  // Audit integrity
  eventHash?: string;
}

/**
 * Generate event hash for integrity verification
 */
function generateEventHash(event: Partial<WidgetAuditEvent>): string {
  const hashData = {
    eventType: event.eventType,
    userId: event.userId,
    timestamp: event.timestamp,
    custodianId: event.custodianId,
    action: event.action,
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(hashData))
    .digest('hex');
}

/**
 * Main audit logging function for widget auth service
 */
export async function logAuditEvent(event: Partial<WidgetAuditEvent>): Promise<{ success: boolean; method: string; eventId: string }> {
  const eventId = event.eventId || `wevt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const timestamp = event.timestamp || new Date().toISOString();

  console.log(`[WIDGET-AUTH AUDIT] logAuditEvent called with:`, {
    eventType: event.eventType,
    category: event.category,
    userId: event.userId,
    userEmail: event.userEmail,
    custodianId: event.custodianId,
    hasMetadata: !!event.metadata
  });

  const completeEvent: WidgetAuditEvent = {
    eventId,
    timestamp,
    severity: AuditSeverity.INFO,
    category: AuditEventCategory.SYSTEM,
    eventType: 'widget.unknown',
    ...event,
    eventHash: generateEventHash({ ...event, eventId, timestamp }),
  };

  let cloudLoggingSuccess = false;
  let firestoreSuccess = false;

  // Try Cloud Logging first
  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.NODE_ENV === 'production') {
      const { auditLog } = await initializeLogging();

      const metadata = {
        severity: completeEvent.severity,
        labels: {
          event_type: completeEvent.eventType,
          category: completeEvent.category,
          user_id: completeEvent.userId || 'anonymous',
          environment: process.env.NODE_ENV || 'development',
          service: 'widget-auth-service'
        },
        resource: {
          type: 'global',
          labels: {
            project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'trustrails-faa3e',
          },
        },
      };

      const entry = auditLog.entry(metadata, completeEvent);
      await auditLog.write(entry);
      cloudLoggingSuccess = true;
    } else {
      // Development fallback - write to Firestore when Cloud Logging not available
      console.log('[Widget Audit Logger] Cloud Logging not configured, using Firestore fallback');
      await writeToFirestore(completeEvent);
      firestoreSuccess = true;
    }
  } catch (error) {
    console.error('[Widget Audit Logger] Cloud Logging failed:', error);
    // Fallback to Firestore on error
    try {
      await writeToFirestore(completeEvent);
      firestoreSuccess = true;
    } catch (fallbackError) {
      console.error('[Widget Audit Logger] Firestore fallback also failed:', fallbackError);
    }
  }

  // Return success if at least one write succeeded
  if (cloudLoggingSuccess && firestoreSuccess) {
    return { success: true, method: 'dual_write', eventId };
  } else if (cloudLoggingSuccess) {
    return { success: true, method: 'cloud_logging', eventId };
  } else if (firestoreSuccess) {
    return { success: true, method: 'firestore', eventId };
  } else {
    return { success: false, method: 'failed', eventId };
  }
}

/**
 * Write to Firestore (fallback/development)
 */
async function writeToFirestore(event: WidgetAuditEvent) {
  const { adminDb } = requireAdminApp();
  const admin = require('firebase-admin');

  // Widget auth events go to dedicated collection
  const collectionName = 'widget_auth_audit_events';

  // Prepare the document
  const docData: any = {
    ...event,
    firestoreTimestamp: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: event.timestamp,
    source: 'widget_auth_service'
  };

  // Write to the collection
  await adminDb.collection(collectionName).doc(event.eventId).set(docData);

  console.log(`[Widget Audit Logger] Event ${event.eventId} written to ${collectionName} collection`);
}

/**
 * Extract request metadata for web requests
 */
export function extractRequestMetadata(request: NextRequest): Partial<WidgetAuditEvent> {
  const headers = request.headers;

  return {
    ipAddress: headers.get('x-forwarded-for')?.split(',')[0] ||
               headers.get('x-real-ip') ||
               'unknown',
    userAgent: headers.get('user-agent') || 'unknown',
    method: request.method,
    path: request.nextUrl.pathname,
    sessionId: headers.get('x-session-id') || undefined,
  };
}

/**
 * Convenience functions for common audit scenarios in widget auth service
 */
export const AuditLogger = {
  // Authentication logging
  async logAuthentication(
    type: 'login' | 'logout' | 'failed',
    userId: string,
    email: string,
    request?: NextRequest,
    metadata?: Record<string, any>
  ) {
    const eventTypeMap = {
      login: 'widget.auth.login.success',
      logout: 'widget.auth.logout',
      failed: 'widget.auth.login.failure',
    };

    // Extract custodianId from metadata if provided
    const custodianId = metadata?.custodianId;

    console.log(`[WIDGET AUTH DEBUG] logAuthentication called:`, {
      type,
      userId,
      email,
      custodianId,
      metadataKeys: metadata ? Object.keys(metadata) : [],
    });

    return logAuditEvent({
      eventType: eventTypeMap[type],
      category: AuditEventCategory.AUTHENTICATION,
      severity: type === 'failed' ? AuditSeverity.WARNING : AuditSeverity.INFO,
      userId,
      userEmail: email,
      custodianId,
      status: type === 'failed' ? 'failure' : 'success',
      ...(request ? extractRequestMetadata(request) : {}),
      metadata,
    });
  },

  // Administrative action logging
  async logAdminAction(
    action: string,
    adminId: string,
    targetResource: { type: string; id: string; name?: string },
    request?: NextRequest,
    metadata?: Record<string, any>
  ) {
    const custodianId = metadata?.custodianId;
    const userEmail = metadata?.userEmail;

    return logAuditEvent({
      eventType: `widget.admin.${action}`,
      category: AuditEventCategory.ADMINISTRATIVE,
      severity: AuditSeverity.WARNING,
      userId: adminId,
      userEmail,
      custodianId,
      action,
      status: 'success',
      ...(request ? extractRequestMetadata(request) : {}),
      metadata,
    });
  },

  // Security event logging
  async logSecurityEvent(
    type: string,
    severity: AuditSeverity,
    description: string,
    userId?: string,
    request?: NextRequest,
    metadata?: Record<string, any>
  ) {
    return logAuditEvent({
      eventType: `widget.security.${type}`,
      category: AuditEventCategory.SECURITY,
      severity,
      userId,
      status: 'failure',
      errorMessage: description,
      ...(request ? extractRequestMetadata(request) : {}),
      metadata,
    });
  },

  // Data access logging
  async logDataAccess(
    action: 'view' | 'export' | 'modify' | 'delete',
    resourceType: string,
    resourceId: string,
    userId: string | null,
    piiAccessed: boolean = false,
    request?: NextRequest,
    metadata?: Record<string, any>
  ) {
    const severityMap = {
      view: AuditSeverity.INFO,
      export: AuditSeverity.WARNING,
      modify: AuditSeverity.WARNING,
      delete: AuditSeverity.WARNING,
    };

    return logAuditEvent({
      eventType: `widget.data.${action}`,
      category: AuditEventCategory.DATA_ACCESS,
      severity: severityMap[action],
      userId: userId || undefined,
      action,
      status: 'success',
      ...(request ? extractRequestMetadata(request) : {}),
      metadata: {
        ...metadata,
        resourceType,
        resourceId,
        piiAccessed
      },
    });
  },
};

// Export for use in other modules
export default AuditLogger;