/**
 * Test script to verify the 50ms delay fix in restartPolling
 */

const setlistNavigationService = require('../services/setlistNavigationService');
const logger = require('../utils/logger');

// Enable debug logging
process.env.DEBUG = 'true';

// Test function
async function testDelayFix() {
  try {
    logger.log('=== Testing 50ms Delay Fix in restartPolling ===');
    
    // Check initial polling state
    logger.log('Initial polling state:');
    logger.log(`Polling interval: ${setlistNavigationService.endOfRegionPollingInterval ? 'active' : 'inactive'}`);
    
    // Test restart polling with delay
    logger.log('\n--- Testing restart polling with 50ms delay ---');
    
    // Call restartPolling which should now have the 50ms delay
    setlistNavigationService.restartPolling();
    
    // Log immediately after calling restartPolling
    logger.log('Immediately after calling restartPolling:');
    logger.log(`Polling interval: ${setlistNavigationService.endOfRegionPollingInterval ? 'active' : 'inactive'}`);
    
    // Wait 25ms (before the 50ms delay completes)
    await new Promise(resolve => setTimeout(resolve, 25));
    logger.log('\nAfter 25ms (before delay completes):');
    logger.log(`Polling interval: ${setlistNavigationService.endOfRegionPollingInterval ? 'active' : 'inactive'}`);
    
    // Wait another 50ms (after the 50ms delay should complete)
    await new Promise(resolve => setTimeout(resolve, 50));
    logger.log('\nAfter 75ms total (after delay should complete):');
    logger.log(`Polling interval: ${setlistNavigationService.endOfRegionPollingInterval ? 'active' : 'inactive'}`);
    
    // Test multiple restarts in quick succession
    logger.log('\n--- Testing multiple restarts in quick succession ---');
    
    // Call restart multiple times to simulate multiple transitions
    setlistNavigationService.restartPolling();
    setlistNavigationService.restartPolling();
    setlistNavigationService.restartPolling();
    
    // Check immediately
    logger.log('Immediately after multiple restartPolling calls:');
    logger.log(`Polling interval: ${setlistNavigationService.endOfRegionPollingInterval ? 'active' : 'inactive'}`);
    
    // Wait for all delays to complete (at least 50ms)
    await new Promise(resolve => setTimeout(resolve, 100));
    logger.log('\nAfter 100ms (all delays should complete):');
    logger.log(`Polling interval: ${setlistNavigationService.endOfRegionPollingInterval ? 'active' : 'inactive'}`);
    
    logger.log('\n=== Test completed successfully ===');
  } catch (error) {
    logger.error('Test error:', error);
  }
}

// Run the test
testDelayFix().catch(error => {
  logger.error('Test failed:', error);
});