# QPay V2 Token Authentication with Redis Caching

## Overview

This implementation provides a production-ready QPay V2 token authentication system with:
- ✅ **Redis-based caching** (multi-instance safe)
- ✅ **Stampede protection** (prevents thundering herd)
- ✅ **Automatic token refresh** (60s buffer before expiry)
- ✅ **Smart expires_in handling** (duration vs epoch timestamp)
- ✅ **Graceful fallbacks** (lock retries + direct fetch)

## Files

```
apps/order-service/src/payments/
├── qpay-auth.service.ts          # Main auth service (NEW)
├── qpay.client.ts                # Updated to use auth service
├── __tests__/
│   └── qpay-auth.test.ts         # Verification tests (NEW)
└── QPAY_AUTH_README.md           # This file (NEW)
```

## Architecture

### Token Flow

```
┌─────────────────────────────────────────────┐
│  getAccessToken() called                    │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│  Check Redis: qpay:access_token             │
│  - Exists + Valid (>60s)? → Return cached   │
│  - Expired/Missing? → Continue              │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│  Acquire Lock: qpay:access_token:lock       │
│  - SET NX EX (10s TTL)                      │
└────────────────┬────────────────────────────┘
                 │
          ┌──────┴──────┐
          │             │
      Acquired      Failed
          │             │
          ▼             ▼
    ┌─────────┐   ┌────────────────┐
    │ Fetch   │   │ Wait 250ms     │
    │ Token   │   │ Retry (3x)     │
    │ from    │   │ Check cache    │
    │ QPay    │   │ or fallback    │
    │ API     │   │ to direct fetch│
    └────┬────┘   └────────────────┘
         │
         ▼
    ┌─────────────────────────────┐
    │ Compute expiresAt:          │
    │ - If expires_in > now+3600  │
    │   → treat as epoch          │
    │ - Else → treat as duration  │
    └────────────┬────────────────┘
                 │
                 ▼
    ┌─────────────────────────────┐
    │ Cache in Redis with TTL     │
    │ TTL = expiresAt - now - 60s │
    └─────────────────────────────┘
```

## Configuration

### Environment Variables

```bash
# Required
QPAY_CLIENT_ID=your_client_id
QPAY_CLIENT_SECRET=your_client_secret
QPAY_INVOICE_CODE=your_invoice_code

# Optional
QPAY_BASE_URL=https://merchant.qpay.mn  # Default: merchant.qpay.mn (production)
# For sandbox: https://merchant-sandbox.qpay.mn
QPAY_USD_TO_MNT_RATE=3400               # Exchange rate

# Redis (already configured)
REDIS_DATABASE_URI=redis://localhost:6379
```

### Redis Keys

```
qpay:access_token       # Token cache: { accessToken, expiresAt }
qpay:access_token:lock  # Distributed lock (10s TTL)
```

## Usage

### Basic Usage

```typescript
import { getQPayAuthService } from './payments/qpay-auth.service';

// Get auth service (singleton)
const authService = getQPayAuthService();

// Get valid access token (cached or fresh)
const token = await authService.getAccessToken();

// Use token for API calls
const response = await fetch('https://merchant.qpay.mn/v2/invoice', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  // ...
});
```

### Via QPay Client (Recommended)

```typescript
import { getQPayClient } from './payments/qpay.client';

const qpayClient = getQPayClient();

// Token is automatically managed
const invoice = await qpayClient.createInvoice({
  sessionId: 'session-123',
  userId: 'user-456',
  amountUsd: 100,
  userEmail: 'user@example.com',
});

// Check payment status
const status = await qpayClient.checkInvoicePaid(invoice.invoice_id);
```

## Key Features

### 1. Smart expires_in Handling

QPay's `expires_in` field is ambiguous:
- Sometimes it's a **duration** in seconds (e.g., `3600` = 1 hour)
- Sometimes it's an **absolute epoch timestamp** (e.g., `1704067200`)

Our implementation handles both:

```typescript
const now = Math.floor(Date.now() / 1000);

if (expires_in > now + 3600) {
  // Looks like epoch timestamp
  expiresAt = expires_in;
} else {
  // Treat as duration
  expiresAt = now + expires_in;
}
```

### 2. Stampede Protection

When multiple instances request a token simultaneously:

1. **First instance** acquires lock, fetches token, caches it
2. **Other instances** wait and retry (250ms × 3)
3. If still no token after retries → fallback to direct fetch
4. All instances eventually get the same token

### 3. Automatic Refresh

Tokens are refreshed **60 seconds before expiry**:
- Ensures no API calls fail due to expired tokens
- TTL calculation: `max(1, expiresAt - now - 60)`

### 4. Multi-Instance Safety

- **Redis caching** ensures all instances share the same token
- **Distributed lock** prevents race conditions
- **No in-memory state** (fully stateless)

## Testing

### Run Verification Tests

```bash
cd /Users/user/Desktop/Final\ Project/eshop/apps/order-service

# Ensure Redis is running
redis-cli ping  # Should return "PONG"

# Set environment variables
export QPAY_CLIENT_ID=your_id
export QPAY_CLIENT_SECRET=your_secret
export QPAY_BASE_URL=https://merchant-sandbox.qpay.mn  # For testing

# Run tests
npx ts-node src/payments/__tests__/qpay-auth.test.ts
```

### Expected Output

```
🧪 QPay Auth Service Tests

Test 1: Fetching token (first time)...
✅ Token obtained in 234ms
   Token length: 156 chars
   Token preview: eyJhbGciOiJSUzI1NiIs...

Test 2: Fetching token (second time, should use cache)...
✅ Token obtained in 3ms
   Same token: ✅ Yes
   Speed improvement: 78x faster

Test 3: Concurrent requests (stampede protection)...
✅ All 5 requests completed in 289ms
   All tokens identical: ✅ Yes
   Request 1: 245ms
   Request 2: 247ms
   Request 3: 248ms
   Request 4: 248ms
   Request 5: 289ms

Test 4: Cache operations...
✅ Cache cleared
✅ New token fetched after cache clear

🎉 All tests completed successfully!
```

### Manual Testing

```bash
# Check Redis cache
redis-cli GET "qpay:access_token"

# Check lock status
redis-cli GET "qpay:access_token:lock"

# Monitor Redis operations
redis-cli MONITOR

# Clear cache (force refresh)
redis-cli DEL "qpay:access_token" "qpay:access_token:lock"
```

## Performance

### Without Cache (Every Request)
- Token fetch: ~200-300ms per request
- 100 requests = ~25 seconds

### With Redis Cache
- First fetch: ~200-300ms
- Subsequent: ~2-5ms (from Redis)
- 100 requests = ~300ms total
- **~83x faster** 🚀

## Error Handling

### Graceful Degradation

```typescript
try {
  const token = await authService.getAccessToken();
  // Use token...
} catch (error) {
  // Will throw if:
  // - Credentials not configured
  // - Network error to QPay API
  // - Redis connection error
  // - QPay API returns error
}
```

### Logs

```
[QPay Auth] Credentials not configured (warning on startup)
[QPay Auth] Token fetched and cached (expires in 3540s)
[QPay Auth] Lock retries exhausted, performing direct fetch (rare)
[QPay Auth] Error acquiring lock: ... (Redis issues)
[QPay Auth] Cache cleared (manual operation)
```

## Migration from Old Implementation

### Before (In-Memory)
```typescript
class QPayClient {
  private tokenCache: TokenCache | null = null;
  
  async getAccessToken() {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }
    // Fetch and cache in memory...
  }
}
```

**Problems:**
- ❌ Not multi-instance safe
- ❌ Stampede on token expiry
- ❌ Each instance fetches separately

### After (Redis)
```typescript
import { getQPayAuthService } from './qpay-auth.service';

class QPayClient {
  private authService = getQPayAuthService();
  
  async getAccessToken() {
    return await this.authService.getAccessToken();
  }
}
```

**Benefits:**
- ✅ Multi-instance safe
- ✅ Stampede protected
- ✅ Shared cache across all instances

## Troubleshooting

### Token Not Caching

```bash
# Check Redis connection
redis-cli ping

# Check if key is being set
redis-cli GET "qpay:access_token"

# Check logs for errors
# Look for: [QPay Auth] Error reading cache
```

### Slow Performance

```bash
# Check Redis latency
redis-cli --latency

# Verify cache hits
redis-cli MONITOR | grep "qpay:access_token"
```

### Multiple Token Fetches

```bash
# Check lock mechanism
redis-cli GET "qpay:access_token:lock"

# Should only exist briefly during fetch
# If stuck: redis-cli DEL "qpay:access_token:lock"
```

## Security Notes

- ✅ No secrets logged
- ✅ Credentials from environment variables
- ✅ Basic Auth over HTTPS for token endpoint
- ✅ Bearer token for API calls
- ✅ No token stored in code

## Future Enhancements

Possible improvements:
- [ ] Token refresh endpoint (force refresh)
- [ ] Metrics/monitoring (fetch count, cache hit rate)
- [ ] Configurable buffer time
- [ ] Retry logic for API failures
- [ ] Token validation endpoint

## Support

For issues or questions:
1. Check logs for `[QPay Auth]` messages
2. Verify environment variables
3. Test Redis connection
4. Run verification tests
5. Check QPay API status

---

**Implementation Date:** January 2026
**Last Updated:** January 2026
**Maintained By:** Development Team

