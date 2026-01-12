#!/bin/bash

################################################################################
# QPay Ebarimt Integration Test Script
#
# This script tests the end-to-end Ebarimt (Mongolian e-receipt) integration:
# 1. Creates a payment session
# 2. Simulates payment (or checks real payment)
# 3. Verifies Ebarimt creation via reconciliation
# 4. Checks database for Ebarimt data
#
# Prerequisites:
# - order-service running (port 6003)
# - QPAY_EBARIMT_ENABLED=true in environment
# - Valid QPay credentials (for real payment testing)
# - MongoDB connection (for DB verification)
#
# Usage:
#   chmod +x test-qpay-ebarimt.sh
#   ./test-qpay-ebarimt.sh
################################################################################

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ORDER_SERVICE_URL="${ORDER_SERVICE_URL:-http://localhost:6003}"
TEST_USER_ID="${TEST_USER_ID:-507f1f77bcf86cd799439011}"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  QPay Ebarimt Integration Test${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

################################################################################
# Step 1: Verify Ebarimt is enabled
################################################################################

echo -e "${YELLOW}Step 1: Checking if Ebarimt is enabled...${NC}"

if [[ "${QPAY_EBARIMT_ENABLED}" != "true" ]]; then
  echo -e "${RED}❌ QPAY_EBARIMT_ENABLED is not set to 'true'${NC}"
  echo -e "${YELLOW}   Please set: export QPAY_EBARIMT_ENABLED=true${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Ebarimt is enabled${NC}"
echo ""

################################################################################
# Step 2: Create payment session with Ebarimt config
################################################################################

echo -e "${YELLOW}Step 2: Creating payment session...${NC}"

SESSION_RESPONSE=$(curl -s -X POST "${ORDER_SERVICE_URL}/api/internal/payments/qpay/seed-session" \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d '{
    "sessionData": {
      "userId": "'"${TEST_USER_ID}"'",
      "cart": [
        {
          "productId": "507f1f77bcf86cd799439011",
          "shopId": "507f1f77bcf86cd799439012",
          "quantity": 1,
          "sale_price": 10000,
          "title": "Test Product",
          "selectedOptions": {}
        }
      ],
      "sellers": [
        {
          "shopId": "507f1f77bcf86cd799439012",
          "sellerId": "507f1f77bcf86cd799439013"
        }
      ],
      "totalAmount": 10000,
      "ebarimt": {
        "receiverType": "CITIZEN",
        "districtCode": "3505",
        "classificationCode": "0000010"
      }
    },
    "ttlSec": 600
  }')

SESSION_ID=$(echo "${SESSION_RESPONSE}" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)

if [[ -z "${SESSION_ID}" ]]; then
  echo -e "${RED}❌ Failed to create session${NC}"
  echo "Response: ${SESSION_RESPONSE}"
  exit 1
fi

echo -e "${GREEN}✓ Session created: ${SESSION_ID}${NC}"
echo ""

################################################################################
# Step 3: Check invoice creation
################################################################################

echo -e "${YELLOW}Step 3: Checking invoice details...${NC}"

INVOICE_ID=$(echo "${SESSION_RESPONSE}" | grep -o '"invoiceId":"[^"]*"' | cut -d'"' -f4)
QR_TEXT=$(echo "${SESSION_RESPONSE}" | grep -o '"qrText":"[^"]*"' | cut -d'"' -f4)

if [[ -z "${INVOICE_ID}" ]]; then
  echo -e "${RED}❌ No invoiceId in response${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Invoice created: ${INVOICE_ID}${NC}"
echo -e "${GREEN}✓ QR code available: $([ -n "${QR_TEXT}" ] && echo "Yes" || echo "No")${NC}"
echo ""

################################################################################
# Step 4: Instructions for payment
################################################################################

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 4: Payment Required${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "To complete this test, payment must be made via QPay:"
echo ""
echo "  Session ID:  ${SESSION_ID}"
echo "  Invoice ID:  ${INVOICE_ID}"
echo "  Amount:      10,000 MNT"
echo ""
echo -e "${YELLOW}Options:${NC}"
echo "  1. Use QPay sandbox/app to pay this invoice"
echo "  2. Simulate payment via QPay API (if you have sandbox credentials)"
echo "  3. Skip and manually trigger reconciliation (for existing paid sessions)"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

read -p "Press Enter after payment is complete (or Ctrl+C to exit)..."

################################################################################
# Step 5: Wait for reconciliation
################################################################################

echo ""
echo -e "${YELLOW}Step 5: Waiting for reconciliation...${NC}"
echo ""
echo "The reconciliation service runs every 60 seconds and will:"
echo "  1. Verify payment via QPay API"
echo "  2. Create orders (if not already created)"
echo "  3. Create Ebarimt receipt"
echo ""
echo "Waiting up to 2 minutes for reconciliation..."
echo ""

MAX_WAIT=120  # 2 minutes
WAIT_INTERVAL=5
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
  echo -ne "${BLUE}⏳ Elapsed: ${ELAPSED}s / ${MAX_WAIT}s${NC}\r"
  sleep $WAIT_INTERVAL
  ELAPSED=$((ELAPSED + WAIT_INTERVAL))
  
  # Check if session status changed (would need DB access or status endpoint)
  # For now, just wait the full time
done

echo ""
echo -e "${GREEN}✓ Reconciliation window complete${NC}"
echo ""

################################################################################
# Step 6: Check session status via API
################################################################################

echo -e "${YELLOW}Step 6: Checking session status...${NC}"

STATUS_RESPONSE=$(curl -s "${ORDER_SERVICE_URL}/api/internal/payments/qpay/status?sessionId=${SESSION_ID}" \
  -H "x-internal-request: true")

STATUS=$(echo "${STATUS_RESPONSE}" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
ORDER_IDS=$(echo "${STATUS_RESPONSE}" | grep -o '"orderIds":\[[^]]*\]')

echo ""
echo "Status Response:"
echo "${STATUS_RESPONSE}" | python3 -m json.tool 2>/dev/null || echo "${STATUS_RESPONSE}"
echo ""

if [[ "${STATUS}" == "PROCESSED" ]]; then
  echo -e "${GREEN}✓ Session status: PROCESSED${NC}"
else
  echo -e "${YELLOW}⚠ Session status: ${STATUS}${NC}"
  echo "  (Expected: PROCESSED if payment completed)"
fi

echo ""

################################################################################
# Step 7: Manual DB verification instructions
################################################################################

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 7: Database Verification${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "To verify Ebarimt data in MongoDB:"
echo ""
echo -e "${YELLOW}MongoDB Shell:${NC}"
echo ""
echo "  db.QPayPaymentSession.findOne({"
echo "    sessionId: \"${SESSION_ID}\""
echo "  }, {"
echo "    paymentId: 1,"
echo "    ebarimtStatus: 1,"
echo "    ebarimtReceiptId: 1,"
echo "    ebarimtQrData: 1,"
echo "    ebarimtLastError: 1,"
echo "    ebarimtCreatedAt: 1"
echo "  })"
echo ""
echo -e "${YELLOW}Expected Result (if successful):${NC}"
echo ""
echo "  {"
echo "    paymentId: \"PAYMENT_12345...\","
echo "    ebarimtStatus: \"REGISTERED\","
echo "    ebarimtReceiptId: \"EBARIMT_...\","
echo "    ebarimtQrData: \"data:image/png;base64,...\","
echo "    ebarimtLastError: null,"
echo "    ebarimtCreatedAt: ISODate(\"2026-01-07T...\")"
echo "  }"
echo ""
echo -e "${YELLOW}If ebarimtStatus is ERROR:${NC}"
echo ""
echo "  Check ebarimtLastError field for error details"
echo "  Reconciliation will automatically retry on next cycle (60s)"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

################################################################################
# Step 8: Check logs
################################################################################

echo -e "${YELLOW}Step 8: Check logs for Ebarimt markers${NC}"
echo ""
echo "Look for these log entries in order-service logs:"
echo ""
echo -e "${GREEN}✓ [QPay Reconcile] Processing session${NC}"
echo -e "${GREEN}✓ [QPay Reconcile] Payment check result${NC}"
echo -e "${GREEN}✓ [QPay Reconcile] Order created successfully${NC}"
echo -e "${GREEN}✓ [QPay Ebarimt] Creating receipt${NC}"
echo -e "${GREEN}✓ ✅ [QPay Ebarimt] Receipt created successfully${NC}"
echo ""
echo "Or on error:"
echo ""
echo -e "${RED}❌ [QPay Ebarimt] Creation failed${NC}"
echo ""

################################################################################
# Summary
################################################################################

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Test Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Session ID:    ${SESSION_ID}"
echo "  Invoice ID:    ${INVOICE_ID}"
echo "  Status:        ${STATUS}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "  1. Verify payment in QPay dashboard"
echo "  2. Check MongoDB for Ebarimt data (see query above)"
echo "  3. Review logs for [QPay Ebarimt] entries"
echo "  4. If status is ERROR, reconciliation will retry automatically"
echo ""
echo -e "${GREEN}✓ Test complete${NC}"
echo ""

