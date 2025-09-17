/**
 * Widget Authentication Server Utilities
 * Extracted from main app for widget auth service
 */

import { randomBytes, createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { requireAdminApp } from './firebase-admin';

const JWT_SECRET = process.env.WIDGET_JWT_SECRET || 'development-secret-change-in-production';
const BEARER_TOKEN_PREFIX = 'tr_bearer_';
const SESSION_TOKEN_LENGTH = 32;

export interface WidgetSession {
  sessionId: string;
  custodianId: string;
  userId?: string; // Optional - only for returning users
  apiKeyHash: string; // Hash of the API key used to create the session
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  origin: string; // The domain where the widget is embedded
}

export interface BearerTokenPayload {
  sessionId: string;
  custodianId: string;
  userId?: string;
  type: 'widget_user';
  permissions: string[];
  iat?: number;
  exp?: number;
}

/**
 * Generate a bearer token for a widget user session
 * This token is returned after successful widget authentication
 */
export function generateBearerToken(
  sessionId: string,
  custodianId: string,
  userId?: string,
  expiresIn: string | number = '24h'
): string {
  const payload: BearerTokenPayload = {
    sessionId,
    custodianId,
    type: 'widget_user',
    permissions: ['widget:read', 'widget:write', 'rollover:create', 'rollover:read']
  };

  // Only add userId if it's defined
  if (userId) {
    payload.userId = userId;
  }

  // Generate JWT token with expiration
  const options: any = {
    expiresIn,
    issuer: 'trustrails-widget',
    audience: 'widget-api'
  };
  const token = jwt.sign(payload, JWT_SECRET, options);

  return `${BEARER_TOKEN_PREFIX}${token}`;
}

/**
 * Verify and decode a bearer token
 * Also validates that the session exists and is not expired
 */
export async function verifyBearerToken(token: string): Promise<BearerTokenPayload | null> {
  try {
    // Remove prefix if present
    const actualToken = token.startsWith(BEARER_TOKEN_PREFIX)
      ? token.substring(BEARER_TOKEN_PREFIX.length)
      : token;

    // Verify JWT signature and decode
    const decoded = jwt.verify(actualToken, JWT_SECRET, {
      issuer: 'trustrails-widget',
      audience: 'widget-api'
    }) as BearerTokenPayload;

    // Validate session still exists and is not expired
    const session = await validateWidgetSession(decoded.sessionId);
    if (!session) {
      console.error('[WIDGET-AUTH] Session not found or expired:', decoded.sessionId);
      return null;
    }

    // Update last activity timestamp
    const { adminDb } = requireAdminApp();
    await adminDb.collection('widget_sessions').doc(decoded.sessionId).update({
      lastActivityAt: new Date().toISOString()
    });

    return decoded;
  } catch (error) {
    console.error('[WIDGET-AUTH] Token verification failed:', error);
    return null;
  }
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `ws_${Date.now().toString(36)}_${randomBytes(16).toString('hex')}`;
}

/**
 * Create a widget user session in Firestore
 */
export async function createWidgetSession(
  custodianId: string,
  apiKeyHash: string,
  ipAddress: string,
  userAgent: string,
  origin: string,
  userId?: string
): Promise<WidgetSession> {
  const { adminDb } = requireAdminApp();

  const sessionId = generateSessionId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  const session: WidgetSession = {
    sessionId,
    custodianId,
    userId,
    apiKeyHash,
    createdAt: now,
    expiresAt,
    ipAddress,
    userAgent,
    origin
  };

  // Store session in Firestore - build document without undefined values
  const sessionDoc: any = {
    sessionId,
    custodianId,
    apiKeyHash,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ipAddress,
    userAgent,
    origin
  };

  // Only add userId if it's defined
  if (userId) {
    sessionDoc.userId = userId;
  }

  await adminDb.collection('widget_sessions').doc(sessionId).set(sessionDoc);

  return session;
}

/**
 * Validate a widget session
 */
export async function validateWidgetSession(sessionId: string): Promise<WidgetSession | null> {
  const { adminDb } = requireAdminApp();

  const sessionDoc = await adminDb.collection('widget_sessions').doc(sessionId).get();

  if (!sessionDoc.exists) {
    return null;
  }

  const sessionData = sessionDoc.data();
  if (!sessionData) {
    return null;
  }

  // Check if session is expired
  const expiresAt = new Date(sessionData.expiresAt);
  if (expiresAt < new Date()) {
    // Clean up expired session
    await sessionDoc.ref.delete();
    return null;
  }

  return {
    sessionId: sessionData.sessionId,
    custodianId: sessionData.custodianId,
    userId: sessionData.userId,
    apiKeyHash: sessionData.apiKeyHash,
    createdAt: new Date(sessionData.createdAt),
    expiresAt: new Date(sessionData.expiresAt),
    ipAddress: sessionData.ipAddress,
    userAgent: sessionData.userAgent,
    origin: sessionData.origin
  };
}

/**
 * Create or get a rollover user from OAuth provider
 */
export async function createOrGetRolloverUser(
  email: string,
  providerId: string,
  profile: {
    name?: string;
    picture?: string;
  },
  hostCustodianId: string
): Promise<string> {
  const { adminDb, adminAuth } = requireAdminApp();

  // Check if user already exists
  let userRecord;
  try {
    userRecord = await adminAuth.getUserByEmail(email);
  } catch (error) {
    // User doesn't exist, create new one
    userRecord = await adminAuth.createUser({
      email,
      displayName: profile.name,
      photoURL: profile.picture,
      emailVerified: true // OAuth providers verify emails
    });
  }

  // Update or create Firestore document
  const userDoc = adminDb.collection('users').doc(userRecord.uid);
  const userData = (await userDoc.get()).data();

  if (!userData) {
    // New user - create document
    await userDoc.set({
      uid: userRecord.uid,
      email,
      name: profile.name || email.split('@')[0],
      role: 'rollover_user',
      photoURL: profile.picture,
      providerId,
      hostCustodianId, // The custodian where widget is embedded
      createdAt: new Date().toISOString(),
      emailVerified: true,
      status: 'active'
    });
  } else {
    // Existing user - update last login
    await userDoc.update({
      lastLoginAt: new Date().toISOString(),
      lastLoginProvider: providerId
    });
  }

  return userRecord.uid;
}

/**
 * Invalidate a widget session
 */
export async function invalidateWidgetSession(sessionId: string): Promise<void> {
  const { adminDb } = requireAdminApp();
  await adminDb.collection('widget_sessions').doc(sessionId).delete();
}

/**
 * Clean up expired sessions (run as a scheduled job)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const { adminDb } = requireAdminApp();

  const now = new Date().toISOString();
  const expiredSessions = await adminDb
    .collection('widget_sessions')
    .where('expiresAt', '<', now)
    .get();

  const batch = adminDb.batch();
  expiredSessions.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();

  return expiredSessions.size;
}