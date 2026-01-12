#!/usr/bin/env node
/**
 * Integration test for QPay webhook idempotency
 * Tests that duplicate webhooks return DUPLICATE even after Redis session expires
 */

const fetch = require('node:fetch');
const { createClient } = require('redis');

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:6003';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Test configuration
const TEST_INVOICE_ID = `test_idem_${Date.now()}`;
const TEST_SESSION_ID = `sess_idem_${Date.now()}`;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function seedSession(redis, sessionId, userId = 'test-user-id') {
  const sessionData = {
    userId,
    cart: [
      {
        productId: '507f1f77bcf86cd799439011', // Valid MongoDB ObjectId
        name: 'Test Product',
        quantity: 1,
        price: 10000, // MNT
        selectedOptions: [],
      },
    ],
    sellers: [
      {
        sellerId: '507f1f77bcf86cd799439012',
        items: [
          {
            productId: '507f1f77bcf86cd799439011',
            shopId: '507f1f77bcf86cd799439013',
            quantity: 1,
            price: 10000,
            selectedOptions: [],
          },
        ],
      },
    ],
    totalAmount: 10000,
    shippingAddressId: '507f1f77bcf86cd799439014',
    coupon: null,
  };

  const key = `payment-session:${sessionId}`;
  await redis.setEx(key, 600, JSON.stringify(sessionData));
  log(`✓ Seeded Redis session: ${key}`, 'green');
}

async function callWebhook(invoiceId, sessionId) {
  const response = await fetch(`${ORDER_SERVICE_URL}/api/internal/payments/qpay/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-request': 'true',
    },
    body: JSON.stringify({
      invoiceId,
      status: 'paid',
      payload: {
        sender_invoice_no: sessionId,
        payment_status: 'PAID',
      },
    }),
  });

  const data = await response.json();
  return { status: response.status, data };
}

async function runTest() {
  log('\n═══════════════════════════════════════════════', 'blue');
  log('QPay Webhook Idempotency Integration Test', 'blue');
  log('═══════════════════════════════════════════════\n', 'blue');

  log(`Test Invoice ID: ${TEST_INVOICE_ID}`, 'cyan');
  log(`Test Session ID: ${TEST_SESSION_ID}\n`, 'cyan');

  const redis = createClient({ url: REDIS_URL });
  redis.on('error', (err) => log(`Redis Error: ${err}`, 'red'));

  try {
    await redis.connect();
    log('✓ Connected to Redis\n', 'green');

    // Step 1: Seed session
    log('─────────────────────────────────────────────', 'yellow');
    log('Step 1: Seed payment session in Redis', 'yellow');
    log('─────────────────────────────────────────────', 'yellow');
    await seedSession(redis, TEST_SESSION_ID);

    // Step 2: First webhook call
    log('\n─────────────────────────────────────────────', 'yellow');
    log('Step 2: First webhook call (should create order)', 'yellow');
    log('─────────────────────────────────────────────', 'yellow');
    const result1 = await callWebhook(TEST_INVOICE_ID, TEST_SESSION_ID);
    log(`Response: ${JSON.stringify(result1.data, null, 2)}`, 'cyan');

    if (result1.data.processed === true) {
      log('✓ PASS: First call created order (processed: true)', 'green');
    } else {
      log(
        `⚠ WARNING: First call returned processed: false, reason: ${result1.data.reason}`,
        'yellow'
      );
      log('This might be expected if order creation requires additional setup', 'yellow');
    }

    // Step 3: Second webhook call (with session)
    log('\n─────────────────────────────────────────────', 'yellow');
    log('Step 3: Second webhook call (should return DUPLICATE)', 'yellow');
    log('─────────────────────────────────────────────', 'yellow');
    const result2 = await callWebhook(TEST_INVOICE_ID, TEST_SESSION_ID);
    log(`Response: ${JSON.stringify(result2.data, null, 2)}`, 'cyan');

    if (result2.data.reason === 'DUPLICATE') {
      log('✓ PASS: Second call returned DUPLICATE', 'green');
    } else {
      log(`✗ FAIL: Second call returned reason: ${result2.data.reason}`, 'red');
      log('Expected: DUPLICATE', 'red');
    }

    // Step 4: Delete Redis session
    log('\n─────────────────────────────────────────────', 'yellow');
    log('Step 4: Delete Redis session to simulate expiration', 'yellow');
    log('─────────────────────────────────────────────', 'yellow');
    const sessionKey = `payment-session:${TEST_SESSION_ID}`;
    await redis.del(sessionKey);
    log(`✓ Deleted Redis key: ${sessionKey}`, 'green');

    // Step 5: Third webhook call (without session - CRITICAL TEST)
    log('\n─────────────────────────────────────────────', 'yellow');
    log('Step 5: Third webhook call after Redis deletion', 'yellow');
    log('         🎯 CRITICAL: Must return DUPLICATE, NOT SESSION_MISSING', 'yellow');
    log('─────────────────────────────────────────────', 'yellow');
    const result3 = await callWebhook(TEST_INVOICE_ID, TEST_SESSION_ID);
    log(`Response: ${JSON.stringify(result3.data, null, 2)}`, 'cyan');

    // Check for all required fields
    const hasInvoiceId = 'invoiceId' in result3.data;
    const hasSessionId = 'sessionId' in result3.data;
    const hasOrderIds = 'orderIds' in result3.data;
    const reason = result3.data.reason;

    log('\n─────────────────────────────────────────────', 'blue');
    log('TEST RESULTS', 'blue');
    log('─────────────────────────────────────────────', 'blue');

    const tests = [
      {
        name: 'Response includes invoiceId',
        pass: hasInvoiceId,
        actual: hasInvoiceId ? result3.data.invoiceId : 'MISSING',
      },
      {
        name: 'Response includes sessionId',
        pass: hasSessionId,
        actual: hasSessionId ? result3.data.sessionId : 'MISSING',
      },
      {
        name: 'Response includes orderIds',
        pass: hasOrderIds,
        actual: hasOrderIds ? result3.data.orderIds : 'MISSING',
      },
      {
        name: 'Reason is DUPLICATE (not SESSION_MISSING)',
        pass: reason === 'DUPLICATE',
        actual: reason,
      },
    ];

    let allPassed = true;
    tests.forEach((test) => {
      if (test.pass) {
        log(`✓ ${test.name}`, 'green');
      } else {
        log(`✗ ${test.name} - Got: ${test.actual}`, 'red');
        allPassed = false;
      }
    });

    log('\n═══════════════════════════════════════════════', 'blue');
    if (allPassed) {
      log('🎉 ALL TESTS PASSED', 'green');
      log('═══════════════════════════════════════════════\n', 'blue');
      process.exit(0);
    } else {
      log('❌ SOME TESTS FAILED', 'red');
      log('═══════════════════════════════════════════════\n', 'blue');
      process.exit(1);
    }
  } catch (error) {
    log(`\n✗ ERROR: ${error.message}`, 'red');
    log(error.stack, 'red');
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

// Run the test
runTest();

