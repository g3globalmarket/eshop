import Redis from "ioredis";

// Resolve Redis connection string from multiple env var sources (robust configuration)
// Priority: REDIS_DATABASE_URI > REDIS_URL > REDIS_URI > REDIS_HOST+REDIS_PORT > fallback
function getRedisConnectionString(): string {
  // Primary: REDIS_DATABASE_URI (current codebase standard)
  if (process.env.REDIS_DATABASE_URI) {
    return process.env.REDIS_DATABASE_URI;
  }
  
  // Secondary: REDIS_URL (common alternative)
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }
  
  // Tertiary: REDIS_URI (another common variant)
  if (process.env.REDIS_URI) {
    return process.env.REDIS_URI;
  }
  
  // Fallback: REDIS_HOST + REDIS_PORT (construct connection string)
  const host = process.env.REDIS_HOST || "localhost";
  const port = process.env.REDIS_PORT || "6379";
  return `redis://${host}:${port}`;
}

const redisConnectionString = getRedisConnectionString();
// Use lazyConnect to prevent immediate connection attempts and unhandled errors
// Connection will be established on first command, allowing error handling to be set up first
const redis = new Redis(redisConnectionString, {
  lazyConnect: true,
  maxRetriesPerRequest: null, // Disable retries to prevent spam
  retryStrategy: () => null, // Don't retry on connection failure
});

// Attach error handler BEFORE any connection attempts
// This prevents "[ioredis] Unhandled error event" messages
redis.on("error", (err) => {
  // Suppress ECONNREFUSED errors (expected when Redis is unavailable)
  // Only log other errors that might indicate configuration issues
  if (err.message && !err.message.includes("ECONNREFUSED") && !err.message.includes("connect")) {
    console.warn("[Redis] Connection error:", err.message);
  }
  // Prevent error from being logged as "unhandled" by ioredis
  // The error is handled here, so it won't crash the process
});

// Connect lazily - connection happens on first command
// This allows services to start even if Redis is unavailable
// Errors will be handled gracefully when Redis operations are attempted

export default redis;
