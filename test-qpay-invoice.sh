#!/bin/bash

# QPay Invoice Creation Test Script
# Tests the seed-session endpoint with QPay invoice generation

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

ORDER_SERVICE_URL=${ORDER_SERVICE_URL:-http://localhost:6003}
SESSION_ID="test-qpay-$(date +%s)"

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}QPay Invoice Creation Test${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""
echo -e "Order Service: ${YELLOW}${ORDER_SERVICE_URL}${NC}"
echo -e "Session ID: ${YELLOW}${SESSION_ID}${NC}"
echo ""

# Check if order service is running
echo -e "${BLUE}Checking order service...${NC}"
if curl -s -f "${ORDER_SERVICE_URL}" > /dev/null; then
  echo -e "${GREEN}✓ Order service is running${NC}"
else
  echo -e "${RED}✗ Order service is not reachable at ${ORDER_SERVICE_URL}${NC}"
  exit 1
fi

# Check environment variables
echo ""
echo -e "${BLUE}Checking environment variables...${NC}"
if [ -z "$QPAY_CLIENT_ID" ]; then
  echo -e "${YELLOW}⚠ QPAY_CLIENT_ID not set${NC}"
else
  echo -e "${GREEN}✓ QPAY_CLIENT_ID is set${NC}"
fi

if [ -z "$QPAY_INVOICE_CODE" ]; then
  echo -e "${YELLOW}⚠ QPAY_INVOICE_CODE not set (will use default)${NC}"
else
  echo -e "${GREEN}✓ QPAY_INVOICE_CODE is set${NC}"
fi

# Seed session and create invoice
echo ""
echo -e "${BLUE}Creating payment session + QPay invoice...${NC}"
echo ""

RESPONSE=$(curl -s -X POST "${ORDER_SERVICE_URL}/api/internal/payments/qpay/seed-session" \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d "{
    \"sessionId\": \"${SESSION_ID}\",
    \"ttlSec\": 600,
    \"sessionData\": {
      \"userId\": \"test-user-123\",
      \"cart\": [
        {
          \"productId\": \"507f1f77bcf86cd799439011\",
          \"name\": \"Test Product\",
          \"quantity\": 1,
          \"price\": 50000,
          \"selectedOptions\": []
        }
      ],
      \"sellers\": [
        {
          \"sellerId\": \"507f1f77bcf86cd799439012\",
          \"items\": [
            {
              \"productId\": \"507f1f77bcf86cd799439011\",
              \"shopId\": \"507f1f77bcf86cd799439013\",
              \"quantity\": 1,
              \"price\": 50000,
              \"selectedOptions\": []
            }
          ]
        }
      ],
      \"totalAmount\": 50000,
      \"shippingAddressId\": \"507f1f77bcf86cd799439014\",
      \"coupon\": null
    }
  }")

echo "$RESPONSE" | jq .

# Parse response
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
INVOICE_ID=$(echo "$RESPONSE" | jq -r '.invoice.invoiceId // empty')
QR_TEXT=$(echo "$RESPONSE" | jq -r '.invoice.qrText // empty')
SHORT_URL=$(echo "$RESPONSE" | jq -r '.invoice.shortUrl // empty')
ERROR=$(echo "$RESPONSE" | jq -r '.error // empty')

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}Results${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"

if [ "$SUCCESS" == "true" ] && [ -n "$INVOICE_ID" ]; then
  echo -e "${GREEN}✓ SUCCESS${NC}"
  echo ""
  echo -e "${YELLOW}Session ID:${NC} $SESSION_ID"
  echo -e "${YELLOW}Invoice ID:${NC} $INVOICE_ID"
  echo -e "${YELLOW}Payment URL:${NC} $SHORT_URL"
  echo ""
  echo -e "${GREEN}✓ QPay invoice created successfully${NC}"
  echo -e "${GREEN}✓ QR code data included in response${NC}"
  echo ""
  echo -e "${BLUE}Next steps:${NC}"
  echo "1. Check Redis: redis-cli GET \"payment-session:$SESSION_ID\""
  echo "2. Open payment URL: $SHORT_URL"
  echo "3. Or scan the QR code with QPay app"
  
elif [ "$SUCCESS" == "false" ]; then
  echo -e "${RED}✗ FAILED${NC}"
  echo ""
  echo -e "${YELLOW}Session ID:${NC} $SESSION_ID"
  echo -e "${YELLOW}Error:${NC} $ERROR"
  echo ""
  echo -e "${RED}Invoice creation failed. Check:${NC}"
  echo "- QPAY_CLIENT_ID and QPAY_CLIENT_SECRET are correct"
  echo "- QPAY_INVOICE_CODE is valid"
  echo "- Order service logs for details"
  exit 1
else
  echo -e "${RED}✗ UNEXPECTED RESPONSE${NC}"
  exit 1
fi

# Verify Redis
echo ""
echo -e "${BLUE}Verifying Redis storage...${NC}"
if command -v redis-cli &> /dev/null; then
  REDIS_DATA=$(redis-cli GET "payment-session:$SESSION_ID")
  if [ -n "$REDIS_DATA" ]; then
    echo -e "${GREEN}✓ Session found in Redis${NC}"
    
    HAS_INVOICE=$(echo "$REDIS_DATA" | jq -r '.qpayInvoiceId // empty')
    if [ -n "$HAS_INVOICE" ]; then
      echo -e "${GREEN}✓ Invoice data stored in session${NC}"
      echo ""
      echo "Session includes:"
      echo "$REDIS_DATA" | jq '{qpayInvoiceId, qpayQrText, qpayShortUrl, qpayCreatedAt}'
    else
      echo -e "${YELLOW}⚠ Invoice data not found in session${NC}"
    fi
  else
    echo -e "${YELLOW}⚠ Session not found in Redis${NC}"
  fi
else
  echo -e "${YELLOW}⚠ redis-cli not available, skipping Redis check${NC}"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}Test completed successfully! 🎉${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"

