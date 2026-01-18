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
const redis = new Redis(redisConnectionString);

// Attach error handler to prevent "Unhandled error event" spam
// Log at WARN level (not ERROR) since transient connection errors are expected during startup
redis.on("error", (err) => {
  // Only log if it's not a connection refused error (those are expected during startup/retries)
  if (err.message && !err.message.includes("ECONNREFUSED")) {
    console.warn("[Redis] Connection error:", err.message);
  }
});

export default redis;
