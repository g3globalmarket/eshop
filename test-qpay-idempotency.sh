#!/bin/bash

# Test script for QPay webhook idempotency
# Usage: ./test-qpay-idempotency.sh

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ORDER_SERVICE_URL="http://localhost:6003"
INVOICE_ID="test_inv_$(date +%s)"
SESSION_ID="test_session_$(date +%s)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}QPay Webhook Idempotency Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Invoice ID: ${YELLOW}${INVOICE_ID}${NC}"
echo -e "Session ID: ${YELLOW}${SESSION_ID}${NC}"
echo ""

# Step 1: First webhook call (should create order)
echo -e "${BLUE}Step 1: First webhook call (should create order)${NC}"
echo ""

RESPONSE1=$(curl -s -X POST ${ORDER_SERVICE_URL}/api/internal/payments/qpay/webhook \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d "{
    \"invoiceId\": \"${INVOICE_ID}\",
    \"status\": \"paid\",
    \"payload\": {
      \"sender_invoice_no\": \"${SESSION_ID}\",
      \"payment_status\": \"PAID\"
    }
  }")

echo "Response:"
echo "${RESPONSE1}" | jq .

PROCESSED1=$(echo "${RESPONSE1}" | jq -r '.processed')
REASON1=$(echo "${RESPONSE1}" | jq -r '.reason // "none"')

if [ "$PROCESSED1" == "true" ]; then
  echo -e "${GREEN}✓ First call succeeded (processed:true)${NC}"
else
  echo -e "${YELLOW}⚠ First call returned processed:false, reason: ${REASON1}${NC}"
  echo -e "${YELLOW}This might be because payment session is missing in Redis.${NC}"
  echo -e "${YELLOW}Please seed the session first or check Redis connection.${NC}"
fi

echo ""
sleep 2

# Step 2: Second webhook call (should return DUPLICATE)
echo -e "${BLUE}Step 2: Second webhook call with SAME invoiceId (should return DUPLICATE)${NC}"
echo ""

RESPONSE2=$(curl -s -X POST ${ORDER_SERVICE_URL}/api/internal/payments/qpay/webhook \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d "{
    \"invoiceId\": \"${INVOICE_ID}\",
    \"status\": \"paid\",
    \"payload\": {
      \"sender_invoice_no\": \"${SESSION_ID}\",
      \"payment_status\": \"PAID\"
    }
  }")

echo "Response:"
echo "${RESPONSE2}" | jq .

PROCESSED2=$(echo "${RESPONSE2}" | jq -r '.processed')
REASON2=$(echo "${RESPONSE2}" | jq -r '.reason')

echo ""
if [ "$PROCESSED2" == "false" ] && [ "$REASON2" == "DUPLICATE" ]; then
  echo -e "${GREEN}✓ Second call correctly returned DUPLICATE${NC}"
else
  echo -e "${RED}✗ FAIL: Second call returned processed:${PROCESSED2}, reason:${REASON2}${NC}"
  echo -e "${RED}Expected: processed:false, reason:DUPLICATE${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Check order-service logs for:${NC}"
echo -e "  1. ${YELLOW}[QPay Webhook] IDEM lookup${NC}"
echo -e "  2. ${GREEN}✅ [QPay Webhook] IDEM DUPLICATE${NC}"
echo -e "${BLUE}========================================${NC}"

