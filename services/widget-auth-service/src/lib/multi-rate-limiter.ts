/**
 * Multi-layer rate limiter for widget authentication
 * Simplified version extracted from main app
 */

import SecureRateLimiter from './secure-rate-limiter';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  identifier: string;
}

interface MultiRateLimitResult {
  success: boolean;
  failedCheck?: string;
  remaining: number;
  resetTime: number;
  details: Record<string, any>;
}

class MultiLayerRateLimiter {
  private limiters: Map<string, SecureRateLimiter> = new Map();

  // Rate limit configurations by layer
  private readonly configs = {
    // Global IP rate limit - 100 requests per hour
    globalIp: { windowMs: 3600000, maxRequests: 100, maxEntries: 50000 },

    // Partner-specific rate limit - 500 requests per hour
    partner: { windowMs: 3600000, maxRequests: 500, maxEntries: 10000 },

    // Partner user creation limit - 50 users per day
    partnerUserCreation: { windowMs: 86400000, maxRequests: 50, maxEntries: 5000 },

    // Email-specific limit - 3 attempts per day
    email: { windowMs: 86400000, maxRequests: 3, maxEntries: 100000 },

    // Session-based limit - 10 attempts per 5 minutes
    session: { windowMs: 300000, maxRequests: 10, maxEntries: 20000 },

    // Rapid creation detection - 20 users per hour per partner
    rapidCreation: { windowMs: 3600000, maxRequests: 20, maxEntries: 5000 }
  };

  constructor() {
    // Initialize secure rate limiters with memory bounds
    Object.entries(this.configs).forEach(([key, config]) => {
      this.limiters.set(
        key,
        new SecureRateLimiter(
          config.windowMs,
          config.maxRequests,
          config.maxEntries
        )
      );
    });
  }

  /**
   * Check multiple rate limit layers
   * Returns early if any check fails
   */
  async checkMultiple(checks: RateLimitConfig[]): Promise<MultiRateLimitResult> {
    const details: Record<string, any> = {};

    for (const check of checks) {
      const limiter = this.limiters.get(check.identifier);

      if (!limiter) {
        // Validate custom configuration to prevent abuse
        const maxRequests = Math.min(check.maxRequests, 1000); // Cap at 1000
        const windowMs = Math.max(check.windowMs, 60000); // Min 1 minute window

        // Create custom limiter with validated config
        const newLimiter = new SecureRateLimiter(windowMs, maxRequests, 5000);
        this.limiters.set(check.identifier, newLimiter);

        const result = await newLimiter.check(check.identifier);
        details[check.identifier] = result;

        if (!result.success) {
          return {
            success: false,
            failedCheck: check.identifier,
            remaining: result.remaining,
            resetTime: result.resetTime,
            details
          };
        }
      } else {
        const result = await limiter.check(check.identifier);
        details[check.identifier] = result;

        if (!result.success) {
          return {
            success: false,
            failedCheck: check.identifier,
            remaining: result.remaining,
            resetTime: result.resetTime,
            details
          };
        }
      }
    }

    // All checks passed
    const minRemaining = Math.min(...Object.values(details).map(d => d.remaining));
    const earliestReset = Math.min(...Object.values(details).map(d => d.resetTime));

    return {
      success: true,
      remaining: minRemaining,
      resetTime: earliestReset,
      details
    };
  }

  /**
   * Check user creation rate limits
   */
  async checkUserCreation(
    ipAddress: string,
    partnerId: string,
    email: string,
    sessionId?: string
  ): Promise<MultiRateLimitResult> {
    const checks: RateLimitConfig[] = [
      // Global IP check
      {
        identifier: `global_ip_${ipAddress}`,
        windowMs: this.configs.globalIp.windowMs,
        maxRequests: this.configs.globalIp.maxRequests
      },
      // Partner request limit
      {
        identifier: `partner_${partnerId}`,
        windowMs: this.configs.partner.windowMs,
        maxRequests: this.configs.partner.maxRequests
      },
      // Partner user creation limit
      {
        identifier: `partner_user_creation_${partnerId}`,
        windowMs: this.configs.partnerUserCreation.windowMs,
        maxRequests: this.configs.partnerUserCreation.maxRequests
      },
      // Email enumeration prevention
      {
        identifier: `email_${email}`,
        windowMs: this.configs.email.windowMs,
        maxRequests: this.configs.email.maxRequests
      },
      // Rapid creation detection
      {
        identifier: `rapid_creation_${partnerId}`,
        windowMs: this.configs.rapidCreation.windowMs,
        maxRequests: this.configs.rapidCreation.maxRequests
      }
    ];

    if (sessionId) {
      checks.push({
        identifier: `session_${sessionId}`,
        windowMs: this.configs.session.windowMs,
        maxRequests: this.configs.session.maxRequests
      });
    }

    return this.checkMultiple(checks);
  }

  /**
   * Reset specific rate limit
   */
  reset(type: string, identifier: string): void {
    const limiter = this.limiters.get(type);
    if (limiter) {
      limiter.reset(`${type}_${identifier}`);
    }
  }
}

// Export singleton instance
export const multiRateLimiter = new MultiLayerRateLimiter();

// Export class for testing
export default MultiLayerRateLimiter;