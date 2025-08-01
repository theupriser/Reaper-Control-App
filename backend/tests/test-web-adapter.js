/**
 * Test script for the web adapter with updated logger
 */

// Import required modules
const logger = require('./utils/logger');
const { Web } = require('./adapters/reaper-web-adapter');

// Create a web adapter instance
const adapter = new Web({
  host: '127.0.0.1',
  webPort: 8080
});

// Log a test message
logger.log('Testing web adapter with updated logger...');

// The adapter constructor should have already created a log context and collected some logs
// We can add a few more logs to test the collection
setTimeout(() => {
  // Try to connect to trigger more logs
  // Note: This might fail if Reaper is not running, but it will still generate logs
  adapter.connect()
    .then(() => {
      logger.log('Web adapter connected successfully');
    })
    .catch(error => {
      logger.log('Web adapter connection failed (expected if Reaper is not running)');
    })
    .finally(() => {
      logger.log('Web adapter test completed');
    });
}, 1000);