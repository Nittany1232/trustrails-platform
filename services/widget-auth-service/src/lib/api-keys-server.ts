/**
 * Server-side API Key Management Utilities
 * Extracted from main app for widget auth service
 */

import { randomBytes, createHash, createHmac, timingSafeEqual } from 'crypto';

// API key format:
// Public keys (widget): tr_live_pk_[32 random chars] or tr_test_pk_[32 random chars]
// Secret keys (backend): tr_live_sk_[32 random chars] or tr_test_sk_[32 random chars]
const API_KEY_PREFIX_LIVE_PUBLIC = 'tr_live_pk_';
const API_KEY_PREFIX_TEST_PUBLIC = 'tr_test_pk_';
const API_KEY_PREFIX_LIVE_SECRET = 'tr_live_sk_';
const API_KEY_PREFIX_TEST_SECRET = 'tr_test_sk_';
const API_KEY_LENGTH = 32;

export type APIKeyType = 'public' | 'secret';

export interface APIKeyData {
  id: string;
  name: string;
  type: APIKeyType; // 'public' for widgets, 'secret' for backend
  prefix: string; // First 8 chars for identification
  hashedKey: string;
  createdAt: Date;
  createdBy: string;
  lastUsedAt?: Date;
  status: 'active' | 'revoked';
  environment: 'production' | 'sandbox';
  rateLimit: number; // requests per minute
  permissions?: string[]; // Optional permissions array for fine-grained access control
}

/**
 * Generate a secure API key
 * Returns both the full key (to show once) and hashed version for storage
 */
export function generateAPIKey(
  type: APIKeyType = 'secret',
  environment: 'production' | 'sandbox' = 'production'
): {
  fullKey: string;
  hashedKey: string;
  prefix: string;
  type: APIKeyType;
} {
  // Generate 32 random bytes and convert to base64url
  const randomPart = randomBytes(API_KEY_LENGTH)
    .toString('base64url')
    .substring(0, API_KEY_LENGTH);

  // Construct full key with appropriate prefix based on type and environment
  let prefix: string;
  if (type === 'public') {
    prefix = environment === 'production' ? API_KEY_PREFIX_LIVE_PUBLIC : API_KEY_PREFIX_TEST_PUBLIC;
  } else {
    prefix = environment === 'production' ? API_KEY_PREFIX_LIVE_SECRET : API_KEY_PREFIX_TEST_SECRET;
  }

  const fullKey = `${prefix}${randomPart}`;

  // Hash the key for storage (SHA-256)
  const hashedKey = hashAPIKey(fullKey);

  // Return first 15 chars as prefix for identification (includes tr_live_pk_ or similar)
  const displayPrefix = fullKey.substring(0, 15);

  return {
    fullKey,
    hashedKey,
    prefix: displayPrefix,
    type
  };
}

/**
 * Hash an API key for secure storage
 * Uses SHA-256 for consistent hashing
 */
export function hashAPIKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Validate an API key format
 */
export function isValidAPIKeyFormat(key: string): boolean {
  // Check if key starts with valid prefix and has correct length
  const validPrefixes = [
    API_KEY_PREFIX_LIVE_PUBLIC,
    API_KEY_PREFIX_TEST_PUBLIC,
    API_KEY_PREFIX_LIVE_SECRET,
    API_KEY_PREFIX_TEST_SECRET
  ];

  const hasValidPrefix = validPrefixes.some(prefix => key.startsWith(prefix));

  if (!hasValidPrefix) return false;

  // Check correct length based on actual prefix
  const actualPrefix = validPrefixes.find(prefix => key.startsWith(prefix));
  const correctLength = key.length === (actualPrefix!.length + API_KEY_LENGTH);

  return correctLength;
}

/**
 * Extract environment from API key
 */
export function getKeyEnvironment(key: string): 'production' | 'sandbox' | null {
  if (key.includes('_live_')) return 'production';
  if (key.includes('_test_')) return 'sandbox';
  return null;
}

/**
 * Extract key type from API key
 */
export function getKeyType(key: string): APIKeyType | null {
  if (key.includes('_pk_')) return 'public';
  if (key.includes('_sk_')) return 'secret';
  return null;
}

/**
 * Check if key is public (safe for browser)
 */
export function isPublicKey(key: string): boolean {
  return getKeyType(key) === 'public';
}

/**
 * Check if key is secret (backend only)
 */
export function isSecretKey(key: string): boolean {
  return getKeyType(key) === 'secret';
}

/**
 * Generate HMAC signature for request validation (Tier 2 auth)
 * Used for HR platforms that don't require OAuth
 */
export function generateHMACSignature(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  body?: string
): string {
  // Construct signing string: METHOD|PATH|TIMESTAMP|BODY_HASH
  const bodyHash = body ? createHash('sha256').update(body).digest('hex') : '';
  const signingString = `${method.toUpperCase()}|${path}|${timestamp}|${bodyHash}`;

  // Generate HMAC-SHA256 signature
  const hmac = createHmac('sha256', secret);
  hmac.update(signingString);
  return hmac.digest('hex');
}

/**
 * Verify HMAC signature
 */
export function verifyHMACSignature(
  secret: string,
  signature: string,
  method: string,
  path: string,
  timestamp: string,
  body?: string
): boolean {
  const expectedSignature = generateHMACSignature(secret, method, path, timestamp, body);

  // Use timing-safe comparison to prevent timing attacks
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(signature);

  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

/**
 * Get rate limit based on custodian tier
 * Tier 1 (Financial): 1000 req/min
 * Tier 2 (HR/Standard): 500 req/min
 */
export function getRateLimitForTier(level: number | undefined): number {
  // Level 2 = Digital tier (higher rate limit)
  // Level 1 = Standard tier (lower rate limit)
  return level === 2 ? 1000 : 500;
}

/**
 * Generate a secure webhook secret
 */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}