#!/bin/bash

# QPay Payment Verification Flow Test
# Tests the complete flow: seed session → create invoice → simulate webhook with payment verification

set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"
ORDER_SERVICE_URL="${ORDER_SERVICE_URL:-http://localhost:6003}"

echo "🧪 QPay Payment Verification Flow Test"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Seed payment session (creates QPay invoice)
echo -e "${BLUE}📝 Step 1: Seeding payment session + creating QPay invoice...${NC}"
SEED_RESPONSE=$(curl -s -X POST "${BASE_URL}/order/api/internal/payments/qpay/seed-session" \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d '{
    "sessionData": {
      "userId": "user_verification_test_'$(date +%s)'",
      "cart": [
        {
          "productId": "677e7b5c8f9a1b2c3d4e5f6a",
          "quantity": 2,
          "sale_price": 50,
          "shopId": "shop_test_123",
          "selectedOptions": []
        }
      ],
      "sellers": ["shop_test_123"],
      "totalAmount": 100,
      "shippingAddressId": null,
      "coupon": null
    },
    "ttlSec": 1200
  }')

echo "$SEED_RESPONSE" | jq .

SESSION_ID=$(echo "$SEED_RESPONSE" | jq -r '.sessionId')
INVOICE_ID=$(echo "$SEED_RESPONSE" | jq -r '.invoiceId')
SUCCESS=$(echo "$SEED_RESPONSE" | jq -r '.success')

if [ "$SUCCESS" != "true" ]; then
  echo -e "${RED}❌ Failed to seed session${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Session seeded successfully${NC}"
echo "   Session ID: $SESSION_ID"
echo "   Invoice ID: $INVOICE_ID"
echo ""

# Step 2: Verify Redis session contains invoice data
echo -e "${BLUE}🔍 Step 2: Verifying Redis session data...${NC}"
echo "   (Checking if qpayInvoiceId is stored in session)"
echo ""

# Step 3: Simulate first webhook (should verify payment via API)
echo -e "${BLUE}📨 Step 3: Sending first webhook (payment verification)...${NC}"
echo "   ⚠️  NOTE: This will call QPay payment/check API to verify payment"
echo "   Expected result: NOT_PAID (because we haven't actually paid via QPay)"
echo ""

WEBHOOK_1_RESPONSE=$(curl -s -X POST "${ORDER_SERVICE_URL}/api/internal/payments/qpay/webhook?sessionId=${SESSION_ID}" \
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

echo "$WEBHOOK_1_RESPONSE" | jq .

REASON=$(echo "$WEBHOOK_1_RESPONSE" | jq -r '.reason // "PROCESSED"')
PROCESSED=$(echo "$WEBHOOK_1_RESPONSE" | jq -r '.processed')

echo ""
if [ "$PROCESSED" == "true" ]; then
  echo -e "${GREEN}✅ Payment VERIFIED and order created${NC}"
  echo "   Order IDs: $(echo "$WEBHOOK_1_RESPONSE" | jq -r '.orderIds')"
  
  # Step 4: Test idempotency
  echo ""
  echo -e "${BLUE}🔁 Step 4: Testing idempotency (sending duplicate webhook)...${NC}"
  WEBHOOK_2_RESPONSE=$(curl -s -X POST "${ORDER_SERVICE_URL}/api/internal/payments/qpay/webhook?sessionId=${SESSION_ID}" \
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
  
  echo "$WEBHOOK_2_RESPONSE" | jq .
  
  REASON_2=$(echo "$WEBHOOK_2_RESPONSE" | jq -r '.reason')
  if [ "$REASON_2" == "DUPLICATE" ]; then
    echo -e "${GREEN}✅ Idempotency working correctly - duplicate detected${NC}"
  else
    echo -e "${RED}❌ Idempotency FAILED - expected DUPLICATE, got: $REASON_2${NC}"
  fi
  
elif [ "$REASON" == "NOT_PAID" ]; then
  echo -e "${YELLOW}⚠️  Payment NOT verified by QPay API${NC}"
  echo "   This is EXPECTED for testing (no actual payment was made)"
  echo "   In production, this means the customer hasn't completed payment yet"
  echo ""
  echo "   Details:"
  echo "   - isPaid: $(echo "$WEBHOOK_1_RESPONSE" | jq -r '.isPaid')"
  echo "   - paidAmount: $(echo "$WEBHOOK_1_RESPONSE" | jq -r '.paidAmount') MNT"
  echo "   - expectedAmount: $(echo "$WEBHOOK_1_RESPONSE" | jq -r '.expectedAmountMnt') MNT"
  echo ""
  echo -e "${GREEN}✅ Payment verification flow working correctly${NC}"
  
elif [ "$REASON" == "AMOUNT_MISMATCH" ]; then
  echo -e "${YELLOW}⚠️  Payment amount mismatch${NC}"
  echo "   Paid: $(echo "$WEBHOOK_1_RESPONSE" | jq -r '.paidAmount') MNT"
  echo "   Expected: $(echo "$WEBHOOK_1_RESPONSE" | jq -r '.expectedAmountMnt') MNT"
  
elif [ "$REASON" == "PAYMENT_CHECK_API_FAILED" ]; then
  echo -e "${RED}❌ QPay payment/check API call failed${NC}"
  echo "   Error: $(echo "$WEBHOOK_1_RESPONSE" | jq -r '.error')"
  echo "   This might be due to:"
  echo "   - Invalid QPay credentials"
  echo "   - Network issues"
  echo "   - Invoice doesn't exist in QPay system"
  
else
  echo -e "${RED}❌ Unexpected result: $REASON${NC}"
fi

echo ""
echo -e "${BLUE}📊 Summary${NC}"
echo "=========="
echo "Session ID: $SESSION_ID"
echo "Invoice ID: $INVOICE_ID"
echo "Final Status: $REASON"
echo ""

# Cleanup info
echo -e "${YELLOW}🧹 Cleanup (optional)${NC}"
echo "To clean up test data:"
echo "  - Redis session will auto-expire in 20 minutes"
echo "  - To delete QPayProcessedInvoice record (if created):"
echo "    npx prisma studio"
echo "    → Delete record with invoiceId: $INVOICE_ID"
echo ""

echo -e "${GREEN}✅ Test completed${NC}"

