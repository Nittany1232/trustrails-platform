/**
 * Secure Rate Limiter with Memory Management
 * Simplified version for widget auth service
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
}

class SecureRateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxEntries: number;

  constructor(windowMs: number, maxRequests: number, maxEntries: number = 10000) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.maxEntries = maxEntries;

    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 300000);
  }

  async check(identifier: string): Promise<RateLimitResult> {
    // Enforce memory limits
    if (this.limits.size >= this.maxEntries) {
      this.evictOldEntries();
    }

    const now = Date.now();
    const entry = this.limits.get(identifier);

    if (!entry || entry.resetTime <= now) {
      // Create new window
      const resetTime = now + this.windowMs;
      this.limits.set(identifier, {
        count: 1,
        resetTime,
        firstRequest: now
      });

      return {
        success: true,
        remaining: this.maxRequests - 1,
        resetTime
      };
    }

    if (entry.count >= this.maxRequests) {
      // Rate limit exceeded
      return {
        success: false,
        remaining: 0,
        resetTime: entry.resetTime
      };
    }

    // Increment counter
    entry.count++;
    return {
      success: true,
      remaining: this.maxRequests - entry.count,
      resetTime: entry.resetTime
    };
  }

  async peek(identifier: string): Promise<RateLimitResult | null> {
    const entry = this.limits.get(identifier);
    if (!entry) return null;

    const now = Date.now();
    if (entry.resetTime <= now) return null;

    return {
      success: entry.count < this.maxRequests,
      remaining: Math.max(0, this.maxRequests - entry.count),
      resetTime: entry.resetTime
    };
  }

  reset(identifier: string): void {
    this.limits.delete(identifier);
  }

  getStats(): { totalEntries: number; memoryUsage: number } {
    return {
      totalEntries: this.limits.size,
      memoryUsage: this.limits.size / this.maxEntries
    };
  }

  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.limits.entries());
    for (const [key, entry] of entries) {
      if (entry.resetTime <= now) {
        this.limits.delete(key);
      }
    }
  }

  private evictOldEntries(): void {
    // Remove oldest 25% of entries when limit is reached
    const sortedEntries = Array.from(this.limits.entries())
      .sort((a, b) => a[1].firstRequest - b[1].firstRequest);

    const toRemove = Math.floor(this.limits.size * 0.25);
    for (let i = 0; i < toRemove; i++) {
      this.limits.delete(sortedEntries[i][0]);
    }
  }
}

export default SecureRateLimiter;