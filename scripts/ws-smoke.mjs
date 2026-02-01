#!/usr/bin/env node
/**
 * WebSocket smoke test for chatting-service and logger-service
 * Usage: node scripts/ws-smoke.mjs <service> <port>
 * Example: node scripts/ws-smoke.mjs chatting 6006
 */

import WebSocket from 'ws';

const service = process.argv[2] || 'chatting';
const port = parseInt(process.argv[3]) || (service === 'chatting' ? 6006 : 6008);
const url = `ws://localhost:${port}`;

console.log(`Testing WebSocket connection to ${url}...`);

const ws = new WebSocket(url);

ws.on('open', () => {
  console.log(`✅ Connected to ${service}-service WebSocket`);
  
  if (service === 'chatting') {
    // For chatting-service, send userId as first message (registration)
    ws.send('test-user-123');
    console.log('Sent registration: test-user-123');
    
    // Wait a bit then send a test message
    setTimeout(() => {
      const testMessage = JSON.stringify({
        fromUserId: 'test-user-123',
        toUserId: 'test-user-456',
        messageBody: 'Test message',
        conversationId: 'test-conv-1',
        senderType: 'user'
      });
      ws.send(testMessage);
      console.log('Sent test message');
    }, 500);
  } else if (service === 'logger') {
    // Logger service just needs connection, no specific message format
    console.log('Logger service connected - ready to receive logs');
  }
  
  // Close after 2 seconds
  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 2000);
});

ws.on('message', (data) => {
  console.log(`📨 Received: ${data.toString().substring(0, 100)}`);
});

ws.on('error', (error) => {
  console.log(`❌ WebSocket error: ${error.message}`);
  process.exit(1);
});

ws.on('close', () => {
  console.log('🔌 WebSocket closed');
});

// Timeout after 5 seconds
setTimeout(() => {
  console.log('⏱️  Connection timeout');
  ws.close();
  process.exit(1);
}, 5000);
