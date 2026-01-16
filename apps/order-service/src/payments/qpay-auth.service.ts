/**
 * QPay Authentication Service
 * Handles token retrieval with Redis caching and stampede protection
 * Multi-instance safe implementation
 */

import redis from "@packages/libs/redis";

interface QPayTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface TokenCacheData {
  accessToken: string;
  expiresAt: number; // Unix epoch in seconds
}

export class QPayAuthService {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  // Redis keys
  private readonly TOKEN_KEY = "qpay:access_token";
  private readonly LOCK_KEY = "qpay:access_token:lock";

  // Configuration
  private readonly LOCK_TTL = 10; // seconds
  private readonly LOCK_RETRY_DELAY = 250; // milliseconds
  private readonly LOCK_MAX_RETRIES = 3;
  private readonly TOKEN_BUFFER = 60; // seconds - refresh before expiry

  constructor() {
    this.baseUrl = process.env.QPAY_BASE_URL || "https://merchant.qpay.mn";

    // Support both QPAY_USERNAME/QPAY_PASSWORD and QPAY_CLIENT_ID/QPAY_CLIENT_SECRET
    // QPay v2 API uses Basic Auth with username:password format
    this.clientId =
      process.env.QPAY_USERNAME ||
      process.env.QPAY_USER ||
      process.env.QPAY_MERCHANT_USERNAME ||
      process.env.QPAY_CLIENT_ID ||
      "";
    this.clientSecret =
      process.env.QPAY_PASSWORD ||
      process.env.QPAY_PASS ||
      process.env.QPAY_CLIENT_SECRET ||
      "";

    if (!this.clientId || !this.clientSecret) {
      console.warn(
        "[QPay Auth] Credentials not configured. QPay features will be disabled."
      );
    }
  }

  /**
   * Get valid access token (cached or fresh)
   * Thread-safe with Redis lock to prevent stampede
   */
  async getAccessToken(): Promise<string> {
    try {
      // Step 1: Try to get cached token
      const cachedToken = await this.getCachedToken();
      if (cachedToken) {
        return cachedToken;
      }

      // Step 2: Try to acquire lock
      const lockAcquired = await this.acquireLock();

      if (lockAcquired) {
        try {
          // Double-check cache after acquiring lock (another instance might have updated it)
          const cachedTokenAfterLock = await this.getCachedToken();
          if (cachedTokenAfterLock) {
            return cachedTokenAfterLock;
          }

          // Fetch new token
          const token = await this.fetchAndCacheToken();
          return token;
        } finally {
          await this.releaseLock();
        }
      } else {
        // Lock not acquired - wait and retry
        const token = await this.waitForTokenWithRetry();
        if (token) {
          return token;
        }

        // Fallback: direct fetch if retries exhausted
        console.warn(
          "[QPay Auth] Lock retries exhausted, performing direct fetch"
        );
        return await this.fetchAndCacheToken();
      }
    } catch (error: any) {
      throw new Error(`Failed to get QPay access token: ${error.message}`);
    }
  }

  /**
   * Get cached token from Redis if valid
   */
  private async getCachedToken(): Promise<string | null> {
    try {
      const cached = await redis.get(this.TOKEN_KEY);
      if (!cached) {
        return null;
      }

      const data: TokenCacheData = JSON.parse(cached);
      const now = Math.floor(Date.now() / 1000); // Current time in seconds

      // Check if token is still valid (with buffer)
      if (data.expiresAt - now > this.TOKEN_BUFFER) {
        return data.accessToken;
      }

      return null;
    } catch (error) {
      console.error("[QPay Auth] Error reading cache:", error);
      return null;
    }
  }

  /**
   * Fetch new token from QPay API and cache it
   */
  private async fetchAndCacheToken(): Promise<string> {
    const authString = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString("base64");
    const url = `${this.baseUrl}/v2/auth/token`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authString}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Log minimal metadata (status code only, no secrets)
        console.error("[QPay Auth] Token request failed", {
          status: response.status,
          error: errorText.substring(0, 200), // Limit error text length
        });
        throw new Error(
          `QPay token request failed: ${response.status} ${errorText}`
        );
      }

      // Use type assertion (not type annotation) to avoid TS2739 error
      // TypeScript infers response.json() as {} when using type annotation
      const data = (await response.json()) as QPayTokenResponse;

      // Compute expiresAt
      const now = Math.floor(Date.now() / 1000);
      let expiresAt: number;

      /**
       * Handle expires_in ambiguity:
       * - If expires_in > now + 3600 (1 hour in future): treat as epoch timestamp
       * - Otherwise: treat as duration in seconds
       */
      if (data.expires_in > now + 3600) {
        // Looks like an absolute epoch timestamp
        expiresAt = data.expires_in;
      } else {
        // Treat as duration in seconds
        expiresAt = now + data.expires_in;
      }

      // Cache token in Redis
      const cacheData: TokenCacheData = {
        accessToken: data.access_token,
        expiresAt,
      };

      // Calculate TTL for Redis (with safety buffer)
      const ttl = Math.max(1, expiresAt - now - this.TOKEN_BUFFER);

      await redis.setex(this.TOKEN_KEY, ttl, JSON.stringify(cacheData));

      console.log(`[QPay Auth] Token fetched and cached (expires in ${ttl}s)`);

      return data.access_token;
    } catch (error: any) {
      throw new Error(`Failed to fetch QPay token: ${error.message}`);
    }
  }

  /**
   * Acquire distributed lock to prevent stampede
   * Returns true if lock acquired, false otherwise
   */
  private async acquireLock(): Promise<boolean> {
    try {
      // SET NX EX: Set if Not eXists with EXpiry
      const result = await redis.set(
        this.LOCK_KEY,
        "1",
        "EX",
        this.LOCK_TTL,
        "NX"
      );

      return result === "OK";
    } catch (error) {
      console.error("[QPay Auth] Error acquiring lock:", error);
      return false;
    }
  }

  /**
   * Release lock
   */
  private async releaseLock(): Promise<void> {
    try {
      await redis.del(this.LOCK_KEY);
    } catch (error) {
      console.error("[QPay Auth] Error releasing lock:", error);
    }
  }

  /**
   * Wait for token with retry logic
   * Other instances might be fetching the token
   */
  private async waitForTokenWithRetry(): Promise<string | null> {
    for (let i = 0; i < this.LOCK_MAX_RETRIES; i++) {
      // Wait before retry
      await this.sleep(this.LOCK_RETRY_DELAY);

      // Check if token is now available
      const token = await this.getCachedToken();
      if (token) {
        return token;
      }
    }

    return null;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clear token cache (useful for testing)
   */
  async clearCache(): Promise<void> {
    try {
      await redis.del(this.TOKEN_KEY);
      await redis.del(this.LOCK_KEY);
      console.log("[QPay Auth] Cache cleared");
    } catch (error) {
      console.error("[QPay Auth] Error clearing cache:", error);
    }
  }
}

// Singleton instance
let authServiceInstance: QPayAuthService | null = null;

export function getQPayAuthService(): QPayAuthService {
  if (!authServiceInstance) {
    authServiceInstance = new QPayAuthService();
  }
  return authServiceInstance;
}
