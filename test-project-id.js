/**
 * Test script to verify project ID generation
 * 
 * This script tests the projectService's ability to generate and retrieve project IDs
 */

// Import required modules
const projectService = require('./backend/services/projectService');
const logger = require('./backend/utils/logger');
const reaperService = require('./backend/services/reaperService');

// Main test function
async function testProjectIdGeneration() {
  try {
    logger.log('Starting project ID generation test');
    
    // Connect to Reaper first
    logger.log('Connecting to Reaper...');
    await reaperService.connect();
    
    // Clear the existing project ID to simulate a missing ID
    logger.log('Clearing existing project ID to simulate missing ID...');
    await reaperService.setProjectExtState('ReaperControl', 'ProjectId', '');
    
    // Initialize the project service
    logger.log('Initializing project service...');
    await projectService.initialize();
    
    // Get the current project ID
    const initialProjectId = projectService.getProjectId();
    logger.log(`Initial project ID: ${initialProjectId}`);
    
    // Verify that a new project ID was generated
    if (!initialProjectId) {
      logger.error('ERROR: Project ID is null or empty after initialization');
    } else {
      logger.log('SUCCESS: New project ID was generated after finding empty ID');
    }
    
    // Force a refresh of the project ID
    logger.log('Refreshing project ID...');
    const refreshedProjectId = await projectService.refreshProjectId();
    logger.log(`Refreshed project ID: ${refreshedProjectId}`);
    
    // Verify that the project ID is not null or empty
    if (!refreshedProjectId) {
      logger.error('ERROR: Project ID is null or empty after refresh');
    } else {
      logger.log('SUCCESS: Project ID is not null or empty after refresh');
    }
    
    // Stop polling to prevent the script from running indefinitely
    projectService.stopPolling();
    
    logger.log('Project ID generation test completed');
  } catch (error) {
    logger.error('Error during project ID generation test:', error);
  }
}

// Test communication with Reaper
async function testReaperCommunication() {
  try {
    logger.log('\nStarting Reaper communication test');
    
    // Connect to Reaper
    logger.log('Connecting to Reaper...');
    await reaperService.connect();
    
    // Get the current project ID from Reaper directly
    logger.log('Getting project ID directly from Reaper...');
    const projectId = await reaperService.getProjectExtState('ReaperControl', 'ProjectId');
    logger.log(`Project ID from Reaper: ${projectId}`);
    
    // Verify that the project ID is not null or empty
    if (!projectId) {
      logger.error('ERROR: Project ID from Reaper is null or empty');
    } else {
      logger.log('SUCCESS: Project ID is properly stored in Reaper');
    }
    
    // Set a new test value
    const testValue = 'test-' + Date.now();
    logger.log(`Setting test value in Reaper: ${testValue}`);
    await reaperService.setProjectExtState('ReaperControl', 'TestValue', testValue);
    
    // Get the test value back
    const retrievedValue = await reaperService.getProjectExtState('ReaperControl', 'TestValue');
    logger.log(`Retrieved test value from Reaper: ${retrievedValue}`);
    
    // Verify that the test value matches
    if (retrievedValue === testValue) {
      logger.log('SUCCESS: Test value was properly communicated with Reaper');
    } else {
      logger.error(`ERROR: Test value mismatch. Expected: ${testValue}, Got: ${retrievedValue}`);
    }
    
    logger.log('Reaper communication test completed');
  } catch (error) {
    logger.error('Error during Reaper communication test:', error);
  }
}

// Run the tests
async function runAllTests() {
  await testProjectIdGeneration();
  await testReaperCommunication();
  logger.log('\nAll tests completed');
}

runAllTests().then(() => {
  logger.log('Test script execution completed');
}).catch(error => {
  logger.error('Unhandled error in test script:', error);
});