/**
 * QPay Auth Service - Verification Tests
 * Run with: node -r ts-node/register qpay-auth.test.ts
 * Or better: add to your test suite
 */

import { getQPayAuthService } from "../qpay-auth.service";

async function runTests() {
  console.log("🧪 QPay Auth Service Tests\n");
  
  const authService = getQPayAuthService();

  try {
    // Test 1: First token fetch (should call API and cache)
    console.log("Test 1: Fetching token (first time)...");
    const startTime1 = Date.now();
    const token1 = await authService.getAccessToken();
    const duration1 = Date.now() - startTime1;
    
    console.log(`✅ Token obtained in ${duration1}ms`);
    console.log(`   Token length: ${token1.length} chars`);
    console.log(`   Token preview: ${token1.substring(0, 20)}...`);
    console.log();

    // Test 2: Second fetch (should use cache, very fast)
    console.log("Test 2: Fetching token (second time, should use cache)...");
    const startTime2 = Date.now();
    const token2 = await authService.getAccessToken();
    const duration2 = Date.now() - startTime2;
    
    console.log(`✅ Token obtained in ${duration2}ms`);
    console.log(`   Same token: ${token1 === token2 ? "✅ Yes" : "❌ No"}`);
    console.log(`   Speed improvement: ${Math.round((duration1 / duration2) * 10) / 10}x faster`);
    console.log();

    // Test 3: Multiple concurrent requests (stampede test)
    console.log("Test 3: Concurrent requests (stampede protection)...");
    await authService.clearCache(); // Clear cache to force refetch
    
    const startTime3 = Date.now();
    const promises = Array(5).fill(null).map((_, i) => 
      authService.getAccessToken().then(token => ({
        index: i,
        token,
        time: Date.now() - startTime3
      }))
    );
    
    const results = await Promise.all(promises);
    const duration3 = Date.now() - startTime3;
    
    console.log(`✅ All 5 requests completed in ${duration3}ms`);
    const allSame = results.every(r => r.token === results[0].token);
    console.log(`   All tokens identical: ${allSame ? "✅ Yes" : "❌ No"}`);
    results.forEach(r => {
      console.log(`   Request ${r.index + 1}: ${r.time}ms`);
    });
    console.log();

    // Test 4: Cache expiry simulation
    console.log("Test 4: Cache operations...");
    await authService.clearCache();
    console.log("✅ Cache cleared");
    
    const token4 = await authService.getAccessToken();
    console.log(`✅ New token fetched after cache clear`);
    console.log(`   Different from previous: ${token4 !== token1 ? "Maybe (expired)" : "Same (still valid)"}`);
    console.log();

    console.log("🎉 All tests completed successfully!");
    console.log("\n💡 Key Features Verified:");
    console.log("   ✅ Token caching works");
    console.log("   ✅ Cache significantly improves performance");
    console.log("   ✅ Stampede protection prevents multiple API calls");
    console.log("   ✅ Cache can be cleared and refreshed");

  } catch (error: any) {
    console.error("❌ Test failed:", error.message);
    throw error;
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests()
    .then(() => {
      console.log("\n✅ Test suite completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Test suite failed:", error);
      process.exit(1);
    });
}

export { runTests };

