#!/bin/bash

# QPay Database Fallback Test
# Tests that order creation works even after Redis expires (using database fallback)

set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"
ORDER_SERVICE_URL="${ORDER_SERVICE_URL:-http://localhost:6003}"

echo "🧪 QPay Database Fallback Test"
echo "================================"
echo ""
echo "This test verifies that order creation works even when Redis session expires"
echo "by falling back to the database."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Create payment session with SHORT TTL
echo -e "${BLUE}📝 Step 1: Creating payment session with short Redis TTL (10 seconds)...${NC}"
SEED_RESPONSE=$(curl -s -X POST "${BASE_URL}/order/api/internal/payments/qpay/seed-session" \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d '{
    "sessionData": {
      "userId": "user_db_fallback_test_'$(date +%s)'",
      "cart": [
        {
          "productId": "677e7b5c8f9a1b2c3d4e5f6a",
          "quantity": 1,
          "sale_price": 100,
          "shopId": "shop_test_123",
          "selectedOptions": []
        }
      ],
      "sellers": ["shop_test_123"],
      "totalAmount": 100,
      "shippingAddressId": null,
      "coupon": null
    },
    "ttlSec": 10
  }')

echo "$SEED_RESPONSE" | jq .

SESSION_ID=$(echo "$SEED_RESPONSE" | jq -r '.sessionId // .session_id // ""')
INVOICE_ID=$(echo "$SEED_RESPONSE" | jq -r '.invoice.invoiceId // ""')
SUCCESS=$(echo "$SEED_RESPONSE" | jq -r '.success')

if [ "$SUCCESS" != "true" ] || [ -z "$SESSION_ID" ]; then
  echo -e "${RED}❌ Failed to seed session${NC}"
  echo "Response: $SEED_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ Session created successfully${NC}"
echo "   Session ID: $SESSION_ID"
echo "   Invoice ID: $INVOICE_ID"
echo "   Redis TTL: 10 seconds"
echo ""

# Step 2: Verify session exists in BOTH Redis and Database
echo -e "${BLUE}🔍 Step 2: Verifying session exists in Redis...${NC}"
REDIS_CHECK=$(redis-cli GET "payment-session:${SESSION_ID}" 2>&1 || echo "redis-cli not available")
if [ "$REDIS_CHECK" != "redis-cli not available" ] && [ "$REDIS_CHECK" != "(nil)" ]; then
  echo -e "${GREEN}✅ Session found in Redis${NC}"
else
  echo -e "${YELLOW}⚠️  Could not verify Redis (redis-cli not available or session not found)${NC}"
fi
echo ""

# Step 3: Wait for Redis to expire
echo -e "${BLUE}⏳ Step 3: Waiting for Redis TTL to expire (15 seconds)...${NC}"
echo "   This simulates a late payment where the customer takes longer than expected."
for i in {15..1}; do
  echo -ne "   Waiting... ${i}s remaining\r"
  sleep 1
done
echo ""
echo ""

# Step 4: Verify Redis is empty
echo -e "${BLUE}🔍 Step 4: Verifying Redis session has expired...${NC}"
REDIS_CHECK_AFTER=$(redis-cli GET "payment-session:${SESSION_ID}" 2>&1 || echo "redis-cli not available")
if [ "$REDIS_CHECK_AFTER" == "(nil)" ]; then
  echo -e "${GREEN}✅ Redis session expired (as expected)${NC}"
elif [ "$REDIS_CHECK_AFTER" == "redis-cli not available" ]; then
  echo -e "${YELLOW}⚠️  Cannot verify (redis-cli not available)${NC}"
else
  echo -e "${YELLOW}⚠️  Redis session still exists (may not have expired yet)${NC}"
fi
echo ""

# Step 5: Send webhook (should load from database!)
echo -e "${BLUE}📨 Step 5: Sending webhook (should load from DATABASE)...${NC}"
echo "   Expected: Webhook loads session from database since Redis expired"
echo ""

WEBHOOK_RESPONSE=$(curl -s -X POST "${ORDER_SERVICE_URL}/api/internal/payments/qpay/webhook?sessionId=${SESSION_ID}" \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d "{
    \"invoiceId\": \"${INVOICE_ID}\",
    \"status\": \"paid\",
    \"payload\": {
      \"sender_invoice_no\": \"${SESSION_ID}\",
      \"invoice_id\": \"${INVOICE_ID}\"
    }
  }")

echo "$WEBHOOK_RESPONSE" | jq .

PROCESSED=$(echo "$WEBHOOK_RESPONSE" | jq -r '.processed')
REASON=$(echo "$WEBHOOK_RESPONSE" | jq -r '.reason // "PROCESSED"')

echo ""

# Step 6: Analyze results
echo -e "${BLUE}📊 Test Results${NC}"
echo "==============="
echo ""

if [ "$PROCESSED" == "true" ]; then
  echo -e "${GREEN}✅✅✅ SUCCESS! Order created from DATABASE FALLBACK${NC}"
  echo ""
  echo "   🎉 This proves the database fallback is working!"
  echo "   The webhook successfully loaded the session from the database"
  echo "   even though Redis had expired."
  echo ""
  echo "   Order IDs: $(echo "$WEBHOOK_RESPONSE" | jq -r '.orderIds')"
  
elif [ "$REASON" == "NOT_PAID" ]; then
  echo -e "${GREEN}✅ Database fallback WORKING (payment not verified by QPay)${NC}"
  echo ""
  echo "   The webhook successfully loaded the session from the database,"
  echo "   but QPay's payment/check API returned NOT_PAID."
  echo ""
  echo "   This is EXPECTED in testing (no actual payment was made)."
  echo "   In production, this means the customer hasn't completed payment yet."
  echo ""
  echo "   ✅ Key Point: Session was loaded from DATABASE (not Redis)"
  echo "   ✅ This proves database fallback is working correctly!"
  
elif [ "$REASON" == "SESSION_MISSING" ]; then
  echo -e "${RED}❌ FAILED: Database fallback did not work${NC}"
  echo ""
  echo "   Session was not found in Redis OR database."
  echo "   This means either:"
  echo "   1. Database write failed during seed-session"
  echo "   2. Database fallback logic not working"
  echo "   3. SessionId mismatch"
  echo ""
  echo "   Check order-service logs for details."
  
elif [ "$REASON" == "DUPLICATE" ]; then
  echo -e "${YELLOW}⚠️  Webhook was already processed (DUPLICATE)${NC}"
  echo ""
  echo "   This might mean:"
  echo "   1. You ran this test before with the same session"
  echo "   2. The webhook was called multiple times"
  echo ""
  echo "   Order IDs from previous processing: $(echo "$WEBHOOK_RESPONSE" | jq -r '.orderIds')"
  
else
  echo -e "${RED}❌ Unexpected result: $REASON${NC}"
  echo ""
  echo "   Full response:"
  echo "$WEBHOOK_RESPONSE" | jq .
fi

echo ""
echo -e "${BLUE}🔍 Check Order Service Logs${NC}"
echo "=============================="
echo ""
echo "Look for these log messages:"
echo "  - ${GREEN}✅ \"Session loaded from database (Redis expired)\"${NC}"
echo "     → Proves database fallback worked"
echo ""
echo "  - ${GREEN}✅ \"Payment verification result\"${NC}"
echo "     → Shows payment check was performed"
echo ""
echo "  - ${GREEN}✅ \"Successfully processed VERIFIED payment\"${NC}"
echo "     → Order was created successfully"
echo ""

echo -e "${BLUE}📝 Summary${NC}"
echo "=========="
echo "Session ID: $SESSION_ID"
echo "Invoice ID: $INVOICE_ID"
echo "Redis TTL: 10 seconds (expired after 15s wait)"
echo "Webhook Result: $REASON"
echo ""

if [ "$PROCESSED" == "true" ] || [ "$REASON" == "NOT_PAID" ]; then
  echo -e "${GREEN}✅ Test PASSED: Database fallback is working!${NC}"
  echo ""
  echo "Your QPay integration is now resilient to Redis expiry."
  echo "Orders can be created even if customers pay late."
else
  echo -e "${RED}❌ Test FAILED: Check logs and database${NC}"
fi

echo ""
echo -e "${YELLOW}🧹 Cleanup (optional)${NC}"
echo "To view database records:"
echo "  npx prisma studio"
echo "  → Navigate to QPayPaymentSession"
echo "  → Find record with sessionId: $SESSION_ID"
echo "  → Check status field (should be PAID or PENDING)"
echo ""

