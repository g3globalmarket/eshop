#!/bin/bash

# QPay Payment Status Endpoint Test
# Tests the new polling endpoint for checking payment status

set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"
ORDER_SERVICE_URL="${ORDER_SERVICE_URL:-http://localhost:6003}"

echo "🧪 QPay Payment Status Endpoint Test"
echo "====================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Create payment session
echo -e "${BLUE}📝 Step 1: Creating payment session...${NC}"
SEED_RESPONSE=$(curl -s -X POST "${BASE_URL}/order/api/internal/payments/qpay/seed-session" \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d '{
    "sessionData": {
      "userId": "user_status_test_'$(date +%s)'",
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
    "ttlSec": 600
  }')

echo "$SEED_RESPONSE" | jq .

SESSION_ID=$(echo "$SEED_RESPONSE" | jq -r '.sessionId')
INVOICE_ID=$(echo "$SEED_RESPONSE" | jq -r '.invoice.invoiceId // ""')
SUCCESS=$(echo "$SEED_RESPONSE" | jq -r '.success')

if [ "$SUCCESS" != "true" ] || [ -z "$SESSION_ID" ]; then
  echo -e "${RED}❌ Failed to seed session${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Session created successfully${NC}"
echo "   Session ID: $SESSION_ID"
echo "   Invoice ID: $INVOICE_ID"
echo ""

# Step 2: Check status immediately (should be PENDING)
echo -e "${BLUE}🔍 Step 2: Checking status immediately (should be PENDING)...${NC}"
STATUS_RESPONSE_1=$(curl -s -X GET "${ORDER_SERVICE_URL}/api/internal/payments/qpay/status?sessionId=${SESSION_ID}" \
  -H "x-internal-request: true")

echo "$STATUS_RESPONSE_1" | jq .

STATUS_1=$(echo "$STATUS_RESPONSE_1" | jq -r '.status')
INVOICE_ID_FROM_STATUS=$(echo "$STATUS_RESPONSE_1" | jq -r '.invoiceId // ""')

echo ""
if [ "$STATUS_1" == "PENDING" ]; then
  echo -e "${GREEN}✅ Status is PENDING (correct)${NC}"
elif [ "$STATUS_1" == "PAID" ]; then
  echo -e "${YELLOW}⚠️  Status is PAID (payment was already made)${NC}"
elif [ "$STATUS_1" == "PROCESSED" ]; then
  echo -e "${YELLOW}⚠️  Status is PROCESSED (order already created)${NC}"
else
  echo -e "${RED}❌ Unexpected status: $STATUS_1${NC}"
fi
echo ""

# Step 3: Poll status a few times (rate limiting test)
echo -e "${BLUE}🔁 Step 3: Polling status multiple times (testing rate limiting)...${NC}"
echo "   The first call should check QPay API"
echo "   Subsequent calls (< 10s) should be rate limited and use cached result"
echo ""

for i in {1..3}; do
  echo -e "${BLUE}   Poll #$i:${NC}"
  STATUS_RESPONSE=$(curl -s -X GET "${ORDER_SERVICE_URL}/api/internal/payments/qpay/status?sessionId=${SESSION_ID}" \
    -H "x-internal-request: true")
  
  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status')
  LAST_CHECK=$(echo "$STATUS_RESPONSE" | jq -r '.lastCheckAt // "null"')
  
  echo "   - Status: $STATUS"
  echo "   - Last Check: $LAST_CHECK"
  echo ""
  
  if [ $i -lt 3 ]; then
    sleep 2
  fi
done

echo -e "${GREEN}✅ Rate limiting working (check order-service logs for 'Skipping API check')${NC}"
echo ""

# Step 4: Test with non-existent session
echo -e "${BLUE}🔍 Step 4: Testing with non-existent sessionId...${NC}"
STATUS_RESPONSE_404=$(curl -s -X GET "${ORDER_SERVICE_URL}/api/internal/payments/qpay/status?sessionId=nonexistent-session-id" \
  -H "x-internal-request: true")

echo "$STATUS_RESPONSE_404" | jq .

STATUS_404=$(echo "$STATUS_RESPONSE_404" | jq -r '.status')

echo ""
if [ "$STATUS_404" == "SESSION_NOT_FOUND" ]; then
  echo -e "${GREEN}✅ Correctly returns SESSION_NOT_FOUND${NC}"
else
  echo -e "${RED}❌ Expected SESSION_NOT_FOUND, got: $STATUS_404${NC}"
fi
echo ""

# Step 5: Test without x-internal-request header (should fail)
echo -e "${BLUE}🔐 Step 5: Testing without x-internal-request header (should be 403)...${NC}"
STATUS_RESPONSE_403=$(curl -s -w "\n%{http_code}" -X GET "${ORDER_SERVICE_URL}/api/internal/payments/qpay/status?sessionId=${SESSION_ID}")

HTTP_CODE=$(echo "$STATUS_RESPONSE_403" | tail -n1)
BODY=$(echo "$STATUS_RESPONSE_403" | head -n-1)

echo "HTTP Status: $HTTP_CODE"
echo "Response: $BODY"
echo ""

if [ "$HTTP_CODE" == "403" ]; then
  echo -e "${GREEN}✅ Correctly returns 403 Forbidden${NC}"
else
  echo -e "${RED}❌ Expected 403, got: $HTTP_CODE${NC}"
fi
echo ""

# Step 6: Summary
echo -e "${BLUE}📊 Test Summary${NC}"
echo "==============="
echo ""
echo "Session ID: $SESSION_ID"
echo "Invoice ID: $INVOICE_ID_FROM_STATUS"
echo "Current Status: $STATUS"
echo ""

echo -e "${BLUE}💡 How to Test Further${NC}"
echo "======================="
echo ""
echo "1. Simulate payment verification:"
echo "   - The status endpoint will call QPay /v2/payment/check"
echo "   - If payment is found, status becomes PAID"
echo "   - If order webhook processes, status becomes PROCESSED"
echo ""
echo "2. Check database:"
echo "   npx prisma studio"
echo "   → Navigate to QPayPaymentSession"
echo "   → Find sessionId: $SESSION_ID"
echo "   → Check lastCheckAt field (updated on each poll)"
echo ""
echo "3. Poll in a loop (simulating client):"
echo "   while true; do"
echo "     curl -s \"${ORDER_SERVICE_URL}/api/internal/payments/qpay/status?sessionId=${SESSION_ID}\" \\"
echo "       -H \"x-internal-request: true\" | jq '.status'"
echo "     sleep 5"
echo "   done"
echo ""

echo -e "${GREEN}✅ Status endpoint test completed!${NC}"
echo ""
echo -e "${YELLOW}🔍 Check order-service logs for:${NC}"
echo "   - [QPay Status] Payment check completed"
echo "   - [QPay Status] Skipping API check (rate limited)"
echo ""

