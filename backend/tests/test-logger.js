/**
 * Test script for the logger bundling functionality
 */

// Import the logger
const logger = require('./utils/logger');

// Set up a test context
const testContext = logger.startCollection('TestContext');

// Log some messages to the test context
console.log('Starting logger test...');
console.log('The following should appear as a single bundled log:');
console.log('---------------------------------------------------');

// Add several log entries to the test context
logger.collect(testContext, 'This is test message 1');
logger.collect(testContext, 'This is test message 2 with', 'multiple arguments');
logger.collect(testContext, 'This is test message 3 with', { data: 'object' });
logger.collect(testContext, 'This is test message 4 with numbers:', 42, 3.14);

// Force flush the logs to see the output
logger.flushLogs(testContext);

console.log('---------------------------------------------------');
console.log('Logger test completed.');