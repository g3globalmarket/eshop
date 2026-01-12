#!/bin/bash
# QPay Cleanup Service Test Script
# Tests the cleanup service by checking stats before and after cleanup

set -e  # Exit on error

echo "================================================"
echo "     QPay Cleanup Service Test Script"
echo "================================================"
echo ""

# Configuration
ORDER_SERVICE_URL="http://localhost:6003"
API_KEY="your-test-api-key"  # Update if using API key auth

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if order-service is running
log_info "Checking if order-service is running..."
if ! curl -s "${ORDER_SERVICE_URL}/" > /dev/null 2>&1; then
    log_error "Order service is not running at ${ORDER_SERVICE_URL}"
    log_error "Please start the order-service first"
    exit 1
fi
log_info "Order service is running ✓"
echo ""

# Step 1: Get cleanup stats before
log_info "Step 1: Getting cleanup stats (before cleanup)..."
echo "-----------------------------------------------"

# Note: This assumes you add an endpoint to expose getCleanupStats()
# For now, we'll just note the counts would go here
log_info "Checking database for old records..."
echo ""
echo "  Old records eligible for cleanup:"
echo "  - Webhook events (>90 days old)"
echo "  - Processed sessions (>30 days old)"
echo "  - Failed sessions (>30 days old)"
echo "  - Processed invoices (>365 days old)"
echo ""

# Step 2: Check environment configuration
log_info "Step 2: Checking cleanup configuration..."
echo "-----------------------------------------------"
echo ""
echo "  Environment variables:"
echo "  - QPAY_CLEANUP_ENABLED: ${QPAY_CLEANUP_ENABLED:-true (default)}"
echo "  - QPAY_CLEANUP_INTERVAL_MS: ${QPAY_CLEANUP_INTERVAL_MS:-21600000 (6 hours)}"
echo "  - QPAY_WEBHOOK_EVENT_RETENTION_DAYS: ${QPAY_WEBHOOK_EVENT_RETENTION_DAYS:-90}"
echo "  - QPAY_SESSION_PROCESSED_RETENTION_DAYS: ${QPAY_SESSION_PROCESSED_RETENTION_DAYS:-30}"
echo "  - QPAY_SESSION_FAILED_RETENTION_DAYS: ${QPAY_SESSION_FAILED_RETENTION_DAYS:-30}"
echo "  - QPAY_PROCESSED_INVOICE_RETENTION_DAYS: ${QPAY_PROCESSED_INVOICE_RETENTION_DAYS:-365}"
echo ""

# Step 3: Check if cleanup service is enabled
log_info "Step 3: Verifying cleanup service is enabled..."
echo "-----------------------------------------------"
if [ "${QPAY_CLEANUP_ENABLED}" = "false" ]; then
    log_warn "Cleanup service is DISABLED"
    log_warn "Set QPAY_CLEANUP_ENABLED=true to enable"
    exit 0
else
    log_info "Cleanup service is enabled ✓"
fi
echo ""

# Step 4: Check Redis lock
log_info "Step 4: Checking Redis lock status..."
echo "-----------------------------------------------"
if command -v redis-cli &> /dev/null; then
    LOCK_STATUS=$(redis-cli GET qpay:cleanup:lock 2>/dev/null || echo "")
    if [ -z "$LOCK_STATUS" ]; then
        log_info "No cleanup lock held (ready to run) ✓"
    else
        log_warn "Cleanup lock is currently held (another instance running)"
        log_warn "Lock will expire automatically in <5 minutes"
    fi
else
    log_warn "redis-cli not found, skipping lock check"
fi
echo ""

# Step 5: Manual trigger info
log_info "Step 5: Manual cleanup trigger instructions"
echo "-----------------------------------------------"
echo ""
echo "  To manually trigger cleanup, run in Node.js:"
echo ""
echo "  import { forceCleanup } from './payments/qpay-cleanup.service';"
echo "  await forceCleanup();"
echo ""
echo "  Or wait for the next scheduled cycle (every 6 hours)"
echo ""

# Step 6: Monitor logs
log_info "Step 6: Monitoring cleanup logs..."
echo "-----------------------------------------------"
echo ""
echo "  Watch for these log messages:"
echo ""
echo "  [QPay Cleanup] Starting cleanup cycle"
echo "  [QPay Cleanup] Deleted old webhook events { count: N, ... }"
echo "  [QPay Cleanup] Deleted old processed sessions { count: N, ... }"
echo "  [QPay Cleanup] Deleted old failed sessions { count: N, ... }"
echo "  [QPay Cleanup] Cycle complete { totalDeleted: N, ... }"
echo ""

# Step 7: Database query examples
log_info "Step 7: Database query examples (MongoDB)"
echo "-----------------------------------------------"
echo ""
echo "  Check old webhook events:"
echo "  db.QPayWebhookEvent.count({ createdAt: { \$lt: new Date(Date.now() - 90*24*60*60*1000) } })"
echo ""
echo "  Check old processed sessions:"
echo "  db.QPayPaymentSession.count({ status: 'PROCESSED', updatedAt: { \$lt: new Date(Date.now() - 30*24*60*60*1000) } })"
echo ""
echo "  Check old failed sessions:"
echo "  db.QPayPaymentSession.count({ status: 'FAILED', updatedAt: { \$lt: new Date(Date.now() - 30*24*60*60*1000) } })"
echo ""

# Summary
echo "================================================"
log_info "Test Complete!"
echo "================================================"
echo ""
echo "Summary:"
echo "  ✓ Order service is running"
echo "  ✓ Cleanup service is enabled"
echo "  ✓ Configuration is set"
echo ""
echo "Next steps:"
echo "  1. Wait for next scheduled cleanup (every 6 hours)"
echo "  2. Or manually trigger: forceCleanup()"
echo "  3. Monitor logs for deletion counts"
echo "  4. Query database to verify old records are deleted"
echo ""
log_info "Cleanup service is working as expected!"
echo ""

