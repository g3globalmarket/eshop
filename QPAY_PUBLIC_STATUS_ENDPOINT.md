# QPay Public Status Endpoint

## Overview

The **public status endpoint** allows authenticated frontend clients to check payment status for their own sessions without needing internal-only headers. This endpoint is exposed through the API Gateway with full authentication and ownership verification.

## Endpoints

### Public Endpoint (Frontend)

```
GET /payments/qpay/status?sessionId=<sessionId>
```

**Host**: API Gateway (default: `http://localhost:8080`)  
**Authentication**: JWT token (required)  
**Authorization**: User must own the session

**Headers**:
- `Authorization: Bearer <jwt_token>` OR
- `Cookie: access_token=<jwt_token>`

**Query Parameters**:
- `sessionId` (required): The payment session ID

### Internal Endpoint (Microservices)

```
GET /api/internal/payments/qpay/status?sessionId=<sessionId>&userId=<userId>
```

**Host**: Order Service (default: `http://localhost:6003`)  
**Authentication**: Internal only (`x-internal-request: true`)

---

## Authentication & Authorization Flow

```
Client Request
    ↓
[API Gateway: /payments/qpay/status]
    ├─ No Auth Check (pass-through)
    ├─ Forward auth headers/cookies
    └─ Call order-service: /api/payments/qpay/status
        ↓
[Order Service: /api/payments/qpay/status]
    ├─ isAuthenticated middleware
    │   ├─ Extract JWT from Authorization header or Cookie
    │   ├─ Verify JWT signature
    │   ├─ Attach req.user = { id, role }
    │   └─ If invalid → 401 Unauthorized
    ├─ getQPayPaymentStatus controller
    │   ├─ Extract userId from req.user
    │   ├─ Load session from QPayPaymentSession
    │   ├─ Verify dbSession.userId === req.user.id
    │   └─ If mismatch → 403 Forbidden
    └─ Return status
```

---

## Usage Examples

### Frontend (React/Vue/Angular)

```javascript
// Poll payment status
const checkPaymentStatus = async (sessionId, jwtToken) => {
  const response = await fetch(
    `/payments/qpay/status?sessionId=${sessionId}`,
    {
      headers: {
        'Authorization': `Bearer ${jwtToken}`
      }
    }
  );
  
  const data = await response.json();
  
  switch (data.status) {
    case 'PENDING':
      console.log('Waiting for payment...');
      break;
    case 'PAID':
      console.log('Payment verified! Processing order...');
      break;
    case 'PROCESSED':
      console.log('Order created:', data.orderIds);
      // Redirect to order page
      window.location.href = `/orders/${data.orderIds[0]}`;
      break;
    case 'SESSION_NOT_FOUND':
      console.error('Session not found or expired');
      break;
  }
  
  return data;
};

// Poll every 5 seconds
const sessionId = 'abc-123';
const token = localStorage.getItem('accessToken');
const interval = setInterval(async () => {
  const status = await checkPaymentStatus(sessionId, token);
  if (status.status === 'PROCESSED') {
    clearInterval(interval); // Stop polling
  }
}, 5000);
```

### Using Cookie Authentication

```javascript
// If using cookie-based auth, no need to pass Authorization header
const checkPaymentStatus = async (sessionId) => {
  const response = await fetch(
    `/payments/qpay/status?sessionId=${sessionId}`,
    {
      credentials: 'include' // Include cookies
    }
  );
  
  return await response.json();
};
```

---

## Response Format

### Success (PENDING)

```json
{
  "ok": true,
  "sessionId": "abc-123",
  "status": "PENDING",
  "invoiceId": "INV_12345",
  "orderIds": null,
  "paidAmount": null,
  "expectedAmount": 340000,
  "lastCheckAt": "2024-01-07T10:30:00Z"
}
```

### Success (PAID)

```json
{
  "ok": true,
  "sessionId": "abc-123",
  "status": "PAID",
  "invoiceId": "INV_12345",
  "orderIds": null,
  "paidAmount": 340000,
  "expectedAmount": 340000,
  "lastCheckAt": "2024-01-07T10:35:00Z"
}
```

### Success (PROCESSED)

```json
{
  "ok": true,
  "sessionId": "abc-123",
  "status": "PROCESSED",
  "invoiceId": "INV_12345",
  "orderIds": ["67879d7c5286a9ddad7c857b"],
  "paidAmount": 340000,
  "expectedAmount": 340000,
  "lastCheckAt": "2024-01-07T10:36:00Z",
  "processedAt": "2024-01-07T10:36:15Z"
}
```

### Error Responses

#### 400 Bad Request
```json
{
  "ok": false,
  "error": "sessionId query parameter is required"
}
```

#### 401 Unauthorized
```json
{
  "ok": false,
  "error": "Authentication required"
}
```

or (from isAuthenticated middleware):
```json
{
  "message": "Unauthorized! Token missing."
}
```

#### 403 Forbidden (Ownership Violation)
```json
{
  "ok": false,
  "error": "Access denied: This session does not belong to you"
}
```

#### 504 Gateway Timeout
```json
{
  "ok": false,
  "error": "Request timeout - order service did not respond in time"
}
```

---

## Security Features

### 1. JWT Authentication

- **Token sources**: `Authorization` header or `access_token`/`seller-access-token` cookies
- **Verification**: JWT signature validated using `ACCESS_TOKEN_SECRET`
- **Extraction**: `req.user` populated with `{ id, role }`

### 2. Session Ownership Verification

```typescript
// In getQPayPaymentStatus controller
if (requestUserId && dbSession.userId !== requestUserId) {
  return res.status(403).json({
    ok: false,
    error: "Access denied: This session does not belong to you"
  });
}
```

**Prevents**:
- User A querying User B's payment status
- Unauthorized access to payment information

### 3. Rate Limiting

**QPay API rate limiting** (10 seconds between checks per session):
- Prevents excessive API calls
- Protects against QPay rate limits
- Cached status returned within 10s window

**Gateway rate limiting** (existing):
- 1000 requests per 15 minutes per IP
- Protects against abuse

---

## Architecture

### Gateway Layer

**File**: `apps/api-gateway/src/(routes)/qpay.ts`

**Route**: `router.get("/status", async (req, res) => { ... })`

**Responsibilities**:
- Accept public requests
- Forward auth headers/cookies to order-service
- Pass through responses
- Handle timeouts and errors

**Key features**:
- No authentication logic (delegated to order-service)
- Timeout: 10 seconds
- Error handling for network issues

### Order Service Layer

**File**: `apps/order-service/src/controllers/order.controller.ts`

**Public Route**: `/api/payments/qpay/status` (with `isAuthenticated`)  
**Internal Route**: `/api/internal/payments/qpay/status` (with `x-internal-request: true`)

**Responsibilities**:
- Authenticate user (JWT verification)
- Load session from database
- Verify ownership (userId match)
- Check payment status (with rate limiting)
- Update database
- Return status

---

## Testing

### Manual Test (Public Endpoint)

```bash
# 1. Get JWT token (login first)
TOKEN="<your_jwt_token>"

# 2. Create payment session (as that user)
RESPONSE=$(curl -s -X POST "http://localhost:8080/order/api/create-payment-session" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ ... }')

SESSION_ID=$(echo "$RESPONSE" | jq -r '.sessionId')

# 3. Check status via public endpoint
curl -X GET "http://localhost:8080/payments/qpay/status?sessionId=$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN" \
  | jq .

# 4. Try with wrong user token (should get 403)
WRONG_TOKEN="<different_user_token>"
curl -X GET "http://localhost:8080/payments/qpay/status?sessionId=$SESSION_ID" \
  -H "Authorization: Bearer $WRONG_TOKEN" \
  | jq .
```

### Expected Results

**Own session**:
```json
{
  "ok": true,
  "status": "PENDING",
  ...
}
```

**Other user's session**:
```json
{
  "ok": false,
  "error": "Access denied: This session does not belong to you"
}
```

---

## Migration from Internal Endpoint

### Before (Internal Only)

```javascript
// Could only call from backend with x-internal-request header
const response = await fetch(
  `${ORDER_SERVICE_URL}/api/internal/payments/qpay/status?sessionId=${sessionId}`,
  {
    headers: { 'x-internal-request': 'true' }
  }
);
```

### After (Public with Auth)

```javascript
// Call from frontend with user JWT
const response = await fetch(
  `/payments/qpay/status?sessionId=${sessionId}`,
  {
    headers: { 'Authorization': `Bearer ${userToken}` }
  }
);
```

---

## Troubleshooting

### "Authentication required" Error

**Cause**: No JWT token provided or invalid token

**Solution**:
1. Verify token is passed in `Authorization` header or cookies
2. Check token hasn't expired
3. Verify `ACCESS_TOKEN_SECRET` matches between auth-service and order-service

### "Access denied: This session does not belong to you"

**Cause**: User trying to access someone else's session

**Solution**:
- Ensure frontend uses correct sessionId (from user's own payment session)
- Check database: `userId` in `QPayPaymentSession` matches JWT token userId

### "Request timeout"

**Cause**: Order service not responding within 10 seconds

**Solution**:
1. Check if order-service is running
2. Check network connectivity
3. Check order-service logs for errors
4. Verify `SERVICE_URL_MODE` environment variable (local vs docker)

### CORS Errors

**Cause**: Frontend domain not in allowed origins

**Solution**: Add frontend domain to `allowedOrigins` in `apps/api-gateway/src/main.ts`:

```typescript
const allowedOrigins = isProduction
  ? ["https://yourfrontend.com", ...]
  : ["http://localhost:3000", ...];
```

---

## Summary

### Public Endpoint

- **URL**: `GET /payments/qpay/status?sessionId=<id>`
- **Authentication**: JWT (required)
- **Authorization**: Must own session
- **Use case**: Frontend polling

### Key Benefits

| Feature | Benefit |
|---------|---------|
| **Authenticated** | Only logged-in users can poll |
| **Ownership verified** | Users can't see others' payments |
| **Simple integration** | Standard REST + JWT (no special headers) |
| **Rate limited** | Prevents API abuse |
| **Pass-through** | Same response format as internal endpoint |

### Integration Checklist

Frontend developers need:
- [ ] JWT token (from login)
- [ ] Session ID (from payment session creation)
- [ ] Poll endpoint: `/payments/qpay/status?sessionId=<id>`
- [ ] Include JWT in `Authorization` header or cookies
- [ ] Poll every 3-5 seconds
- [ ] Stop polling when `status === 'PROCESSED'`

---

**Status**: ✅ **Production Ready**

**Last Updated**: January 7, 2026

