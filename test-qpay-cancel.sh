#!/bin/bash
# QPay Cancel/Expire - Quick Test Script
# 
# Prerequisites:
# - Services running (api-gateway, order-service, user-ui)
# - Valid JWT token
# - Active payment session

set -e

# Configuration
API_BASE=${API_BASE:-"http://localhost:8080"}
TOKEN=${QPAY_TEST_TOKEN:-""}
SESSION_ID=${QPAY_TEST_SESSION_ID:-""}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "QPay Cancel/Expire Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -z "$TOKEN" ]; then
    echo "❌ Error: QPAY_TEST_TOKEN not set"
    echo "Usage: QPAY_TEST_TOKEN=<your-jwt> QPAY_TEST_SESSION_ID=<sessionId> ./test-qpay-cancel.sh"
    exit 1
fi

if [ -z "$SESSION_ID" ]; then
    echo "❌ Error: QPAY_TEST_SESSION_ID not set"
    echo "Usage: QPAY_TEST_TOKEN=<your-jwt> QPAY_TEST_SESSION_ID=<sessionId> ./test-qpay-cancel.sh"
    exit 1
fi

echo "🔧 Configuration:"
echo "   API Base: $API_BASE"
echo "   Session ID: $SESSION_ID"
echo "   Token: ${TOKEN:0:20}..."
echo ""

# Test 1: Get initial status
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 1: Get initial payment status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "GET $API_BASE/payments/qpay/status?sessionId=$SESSION_ID"
echo ""

INITIAL_STATUS=$(curl -s \
    -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/payments/qpay/status?sessionId=$SESSION_ID")

echo "Response:"
echo "$INITIAL_STATUS" | jq .
echo ""

STATUS=$(echo "$INITIAL_STATUS" | jq -r '.status')
echo "Current status: $STATUS"
echo ""

if [ "$STATUS" != "PENDING" ] && [ "$STATUS" != "PAID" ]; then
    echo "⚠️  Warning: Status is $STATUS (not PENDING or PAID)"
    echo "   Cancel may not work for this session"
    echo ""
fi

# Test 2: Cancel payment
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 2: Cancel payment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "POST $API_BASE/payments/qpay/cancel"
echo "Body: { \"sessionId\": \"$SESSION_ID\" }"
echo ""

CANCEL_RESPONSE=$(curl -s \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"$SESSION_ID\"}" \
    "$API_BASE/payments/qpay/cancel")

echo "Response:"
echo "$CANCEL_RESPONSE" | jq .
echo ""

CANCEL_OK=$(echo "$CANCEL_RESPONSE" | jq -r '.ok')
CANCEL_STATUS=$(echo "$CANCEL_RESPONSE" | jq -r '.status')

if [ "$CANCEL_OK" == "true" ] && [ "$CANCEL_STATUS" == "CANCELLED" ]; then
    echo "✅ Payment cancelled successfully"
else
    echo "❌ Cancel failed or unexpected response"
    echo "   Expected: ok=true, status=CANCELLED"
    echo "   Got: ok=$CANCEL_OK, status=$CANCEL_STATUS"
fi
echo ""

# Test 3: Verify status is CANCELLED
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 3: Verify status is CANCELLED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "GET $API_BASE/payments/qpay/status?sessionId=$SESSION_ID"
echo ""

FINAL_STATUS=$(curl -s \
    -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/payments/qpay/status?sessionId=$SESSION_ID")

echo "Response:"
echo "$FINAL_STATUS" | jq .
echo ""

STATUS_AFTER=$(echo "$FINAL_STATUS" | jq -r '.status')
CANCELLED_AT=$(echo "$FINAL_STATUS" | jq -r '.cancelledAt')

if [ "$STATUS_AFTER" == "CANCELLED" ]; then
    echo "✅ Status is CANCELLED"
    if [ "$CANCELLED_AT" != "null" ]; then
        echo "✅ cancelledAt field is set: $CANCELLED_AT"
    else
        echo "⚠️  cancelledAt field is null (may be old session)"
    fi
else
    echo "❌ Status is not CANCELLED: $STATUS_AFTER"
fi
echo ""

# Test 4: Try to cancel again (idempotency)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 4: Cancel again (idempotency test)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "POST $API_BASE/payments/qpay/cancel"
echo ""

CANCEL_AGAIN=$(curl -s \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"$SESSION_ID\"}" \
    "$API_BASE/payments/qpay/cancel")

echo "Response:"
echo "$CANCEL_AGAIN" | jq .
echo ""

SECOND_OK=$(echo "$CANCEL_AGAIN" | jq -r '.ok')
if [ "$SECOND_OK" == "true" ]; then
    echo "✅ Idempotent cancel succeeded (returned success)"
else
    echo "❌ Idempotent cancel failed"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Initial status:  $STATUS"
echo "Cancel result:   $CANCEL_OK ($CANCEL_STATUS)"
echo "Final status:    $STATUS_AFTER"
echo "Cancelled at:    $CANCELLED_AT"
echo "Idempotent test: $SECOND_OK"
echo ""

if [ "$CANCEL_OK" == "true" ] && [ "$STATUS_AFTER" == "CANCELLED" ] && [ "$SECOND_OK" == "true" ]; then
    echo "✅ All tests passed!"
    exit 0
else
    echo "❌ Some tests failed"
    exit 1
fi

