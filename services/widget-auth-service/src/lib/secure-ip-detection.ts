/**
 * Secure IP address detection with spoofing protection
 * Extracted from main app for widget auth service
 */

import { NextRequest } from 'next/server';

/**
 * Configuration for trusted proxy headers
 */
interface IPDetectionConfig {
  trustProxy: boolean;
  trustedProxies?: string[]; // List of trusted proxy IPs
  maxProxyHops?: number;     // Maximum number of proxy hops to trust
}

/**
 * Get client IP address with spoofing protection
 */
export function getSecureClientIP(
  request: NextRequest,
  config: IPDetectionConfig = { trustProxy: false }
): string {
  // In development, always use the actual connection IP
  if (process.env.NODE_ENV === 'development') {
    return request.ip || '127.0.0.1';
  }

  // If not trusting proxies, return direct connection IP
  if (!config.trustProxy) {
    return request.ip || '127.0.0.1';
  }

  // Check if request is from a trusted proxy
  const connectionIP = request.ip || '127.0.0.1';
  if (config.trustedProxies && !config.trustedProxies.includes(connectionIP)) {
    // Not from trusted proxy, don't trust forwarded headers
    console.warn(`Untrusted proxy attempt from ${connectionIP}`);
    return connectionIP;
  }

  // Parse X-Forwarded-For header (most reliable when from trusted proxy)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map(ip => ip.trim());

    // Validate IP format and limit proxy hops
    const maxHops = config.maxProxyHops || 3;
    const validIPs = ips.slice(0, maxHops).filter(ip => isValidIP(ip));

    if (validIPs.length > 0) {
      // Return the first valid IP (closest to client)
      return validIPs[0];
    }
  }

  // Fallback to other headers (less reliable)
  const realIP = request.headers.get('x-real-ip');
  if (realIP && isValidIP(realIP)) {
    return realIP;
  }

  // Fallback to CF-Connecting-IP for Cloudflare
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP && isValidIP(cfIP)) {
    return cfIP;
  }

  // Final fallback to connection IP
  return connectionIP;
}

/**
 * Validate IP address format (IPv4 and IPv6)
 */
function isValidIP(ip: string): boolean {
  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(ip)) {
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  // Simplified IPv6 validation (basic format check)
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv6Pattern.test(ip);
}

/**
 * Get IP fingerprint for additional validation
 * Combines IP with other request characteristics
 */
export function getIPFingerprint(request: NextRequest): string {
  const ip = getSecureClientIP(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const acceptLanguage = request.headers.get('accept-language') || 'unknown';
  const acceptEncoding = request.headers.get('accept-encoding') || 'unknown';

  // Create a fingerprint combining IP with browser characteristics
  const fingerprint = `${ip}|${userAgent.substring(0, 50)}|${acceptLanguage.substring(0, 20)}|${acceptEncoding.substring(0, 20)}`;

  // In production, you might want to hash this
  return Buffer.from(fingerprint).toString('base64').substring(0, 32);
}

/**
 * Default configuration for production
 */
export const defaultIPConfig: IPDetectionConfig = {
  trustProxy: process.env.NODE_ENV === 'production',
  trustedProxies: process.env.TRUSTED_PROXIES?.split(',') || [],
  maxProxyHops: 3
};

/**
 * Export convenience function with default config
 */
export function getClientIP(request: NextRequest): string {
  return getSecureClientIP(request, defaultIPConfig);
}