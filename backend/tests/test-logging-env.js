/**
 * Test script for environment variable controlled logging
 * 
 * This script tests the logging functionality with different environment variables.
 * Run with: node test-logging-env.js
 */

// Import required modules
const logger = require('../utils/logger');
const { Web } = require('../adapters/reaper-web-adapter');
const PlaybackState = require('../models/PlaybackState');

// Test function
async function testLogging() {
  console.log('=== Testing Environment Variable Controlled Logging ===');
  
  // Test 1: Test MIDI logging (simulated)
  console.log('\n--- Test 1: MIDI Logging ---');
  console.log('MIDI_LOG_ALL =', process.env.MIDI_LOG_ALL);
  console.log('Simulating MIDI input event...');
  
  if (process.env.MIDI_LOG_ALL === 'true') {
    console.log('MIDI logging is enabled, detailed logs would be shown');
  } else {
    console.log('MIDI logging is disabled, only mapped notes would be logged');
  }
  
  // Test 2: Test PlaybackState logging
  console.log('\n--- Test 2: PlaybackState Logging ---');
  console.log('PLAYBACK_STATE_LOG =', process.env.PLAYBACK_STATE_LOG);
  
  const playbackState = new PlaybackState();
  console.log('Created PlaybackState instance');
  console.log('Updating from simulated transport response...');
  
  // Simulate a transport response
  const changed = playbackState.updateFromTransportResponse('TRANSPORT\t1\t10.5\t0\t0:10.5\t1.1.00', []);
  
  console.log('PlaybackState updated, changed =', changed);
  console.log('Current state:', JSON.stringify(playbackState.toJSON()));
  
  if (process.env.PLAYBACK_STATE_LOG === 'true') {
    console.log('PlaybackState logging is enabled, detailed logs would be shown above');
  } else {
    console.log('PlaybackState logging is disabled, no detailed logs would be shown');
  }
  
  // Test 3: Test WebAdapter logging
  console.log('\n--- Test 3: WebAdapter Logging ---');
  console.log('WEB_ADAPTER_LOG =', process.env.WEB_ADAPTER_LOG);
  
  const webAdapter = new Web({
    host: '127.0.0.1',
    webPort: 8080
  });
  
  console.log('Created WebAdapter instance');
  
  if (process.env.WEB_ADAPTER_LOG === 'true') {
    console.log('WebAdapter logging is enabled, detailed logs would be shown');
  } else {
    console.log('WebAdapter logging is disabled, only critical logs would be shown');
  }
  
  console.log('\n=== Logging Test Complete ===');
}

// Set environment variables for testing
// You can modify these values to test different configurations
process.env.MIDI_LOG_ALL = process.env.MIDI_LOG_ALL || 'false';
process.env.PLAYBACK_STATE_LOG = process.env.PLAYBACK_STATE_LOG || 'false';
process.env.WEB_ADAPTER_LOG = process.env.WEB_ADAPTER_LOG || 'false';

// Run the test
testLogging().catch(error => {
  console.error('Error in test:', error);
});