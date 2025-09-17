/**
 * Simple in-memory rate limiter for API endpoints
 * Extracted from main app for widget auth service
 * In production, use Redis or similar for distributed rate limiting
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  async check(identifier: string): Promise<{ success: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const entry = this.limits.get(identifier);

    if (!entry || entry.resetTime <= now) {
      // Create new window
      const resetTime = now + this.windowMs;
      this.limits.set(identifier, {
        count: 1,
        resetTime
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

  reset(identifier: string): void {
    this.limits.delete(identifier);
  }

  private cleanup() {
    const now = Date.now();
    const entries = Array.from(this.limits.entries());
    for (const [key, entry] of entries) {
      if (entry.resetTime <= now) {
        this.limits.delete(key);
      }
    }
  }
}

// Export singleton instance for API endpoints
export const apiRateLimiter = new RateLimiter(60000, 100); // 100 requests per minute

// Export class for custom configurations
export default RateLimiter;