/**
 * Test script to reproduce the issue with polling not working after the first song transition
 */

const setlistNavigationService = require('../services/setlistNavigationService');
const regionService = require('../services/regionService');
const setlistService = require('../services/setlistService');
const reaperService = require('../services/reaperService');
const PlaybackState = require('../models/PlaybackState');
const Region = require('../models/Region');
const logger = require('../utils/logger');

// Enable debug logging
process.env.DEBUG = 'true';

// Mock regions
const mockRegions = [
  new Region({ id: 1, name: 'Song 1', start: 0, end: 60 }),
  new Region({ id: 2, name: 'Song 2', start: 60, end: 120 }),
  new Region({ id: 3, name: 'Song 3', start: 120, end: 180 })
];

// Mock setlist
const mockSetlist = {
  id: 'test-setlist-id',
  name: 'Test Setlist',
  items: [
    { regionId: 1, name: 'Song 1' },
    { regionId: 2, name: 'Song 2' },
    { regionId: 3, name: 'Song 3' }
  ]
};

// Mock playback state
let mockPlaybackState = new PlaybackState({
  isPlaying: true,
  currentPosition: 59.85, // Very close to the end of region 1 (Song 1)
  currentRegionId: 1,
  selectedSetlistId: 'test-setlist-id'
});

// Store original methods to restore later
const originalGetRegions = regionService.getRegions;
const originalFindRegionById = regionService.findRegionById;
const originalGetPlaybackState = regionService.getPlaybackState;
const originalGetSetlist = setlistService.getSetlist;
const originalSeekToPosition = reaperService.seekToPosition;
const originalTogglePlay = reaperService.togglePlay;

// Mock regionService methods
regionService.getRegions = () => mockRegions;
regionService.findRegionById = (id) => mockRegions.find(r => r.id === id);
regionService.getPlaybackState = () => mockPlaybackState;

// Mock setlistService methods
setlistService.getSetlist = () => mockSetlist;

// Mock reaperService methods
reaperService.seekToPosition = async (position) => {
  logger.log(`[MOCK] Seeking to position: ${position}`);
  return true;
};

reaperService.togglePlay = async (pause) => {
  logger.log(`[MOCK] Toggling play state: ${pause ? 'pause' : 'play'}`);
  return true;
};

// Track if seekToRegionAndPlay was called
let seekToRegionAndPlayCallCount = 0;
const originalSeekToRegionAndPlay = setlistNavigationService.seekToRegionAndPlay;

// Override seekToRegionAndPlay to track calls and simulate behavior
setlistNavigationService.seekToRegionAndPlay = async (region, autoplay) => {
  seekToRegionAndPlayCallCount++;
  logger.log(`[MOCK] seekToRegionAndPlay called (${seekToRegionAndPlayCallCount}): Region ${region.name}, autoplay=${autoplay}`);
  
  // Simulate the actual behavior
  // Update the mock playback state to reflect the new region
  mockPlaybackState = new PlaybackState({
    isPlaying: true,
    currentPosition: region.start + 0.001, // Just after the start
    currentRegionId: region.id,
    selectedSetlistId: 'test-setlist-id'
  });
  
  return true;
};

// Test function to simulate multiple song transitions
async function testMultipleSongTransitions() {
  try {
    logger.log('=== Testing Multiple Song Transitions with Fixed Implementation ===');
    
    // Reset tracking variable
    seekToRegionAndPlayCallCount = 0;
    
    // Track if restartPolling was called
    let restartPollingCalled = false;
    const originalRestartPolling = setlistNavigationService.restartPolling;
    setlistNavigationService.restartPolling = () => {
      restartPollingCalled = true;
      logger.log('[MOCK] restartPolling called - polling mechanism restarted');
      originalRestartPolling.call(setlistNavigationService);
    };
    
    // Restart the polling to ensure a clean state
    setlistNavigationService.stopEndOfRegionPolling();
    setlistNavigationService.startEndOfRegionPolling();
    
    logger.log('\n--- First transition test ---');
    // Set up first song near the end
    mockPlaybackState = new PlaybackState({
      isPlaying: true,
      currentPosition: 59.85, // Very close to the end of Song 1
      currentRegionId: 1,
      selectedSetlistId: 'test-setlist-id'
    });
    
    logger.log(`Current position: ${mockPlaybackState.currentPosition}, Region: ${mockRegions[0].name}`);
    logger.log(`Time to end: ${mockRegions[0].end - mockPlaybackState.currentPosition} seconds`);
    
    // Reset tracking variables
    restartPollingCalled = false;
    
    // Manually trigger the check to simulate what polling would do
    await setlistNavigationService.checkEndOfRegion(mockPlaybackState);
    
    // Check if transition happened and if polling was restarted
    logger.log(`First transition - seekToRegionAndPlay called: ${seekToRegionAndPlayCallCount > 0}`);
    logger.log(`First transition - restartPolling called: ${restartPollingCalled}`);
    
    // Wait a moment to simulate time passing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    logger.log('\n--- Second transition test ---');
    // Now simulate approaching the end of the second song
    // This should be Song 2 after the first transition
    mockPlaybackState = new PlaybackState({
      isPlaying: true,
      currentPosition: 119.85, // Very close to the end of Song 2
      currentRegionId: 2,
      selectedSetlistId: 'test-setlist-id'
    });
    
    logger.log(`Current position: ${mockPlaybackState.currentPosition}, Region: ${mockRegions[1].name}`);
    logger.log(`Time to end: ${mockRegions[1].end - mockPlaybackState.currentPosition} seconds`);
    
    // Reset the call count to clearly see if the second transition works
    const firstTransitionCount = seekToRegionAndPlayCallCount;
    seekToRegionAndPlayCallCount = 0;
    restartPollingCalled = false;
    
    // Manually trigger the check again
    await setlistNavigationService.checkEndOfRegion(mockPlaybackState);
    
    // Check if second transition happened and if polling was restarted
    logger.log(`Second transition - seekToRegionAndPlay called: ${seekToRegionAndPlayCallCount > 0}`);
    logger.log(`Second transition - restartPolling called: ${restartPollingCalled}`);
    
    // Test race condition prevention
    logger.log('\n--- Race condition prevention test ---');
    // Set isTransitioning flag to true to simulate a transition in progress
    setlistNavigationService.isTransitioning = true;
    
    // Reset tracking variables
    seekToRegionAndPlayCallCount = 0;
    
    // Try to trigger another transition while one is in progress
    await setlistNavigationService.checkEndOfRegion(mockPlaybackState);
    
    // Check if the race condition prevention worked
    logger.log(`Race condition test - seekToRegionAndPlay called: ${seekToRegionAndPlayCallCount > 0}`);
    logger.log(`Race condition test - transition prevented: ${seekToRegionAndPlayCallCount === 0}`);
    
    // Reset the flag
    setlistNavigationService.isTransitioning = false;
    
    // Log overall results
    logger.log('\n=== Test Results ===');
    logger.log(`First transition successful: ${firstTransitionCount > 0}`);
    logger.log(`Second transition successful: ${seekToRegionAndPlayCallCount > 0}`);
    logger.log(`Polling restart mechanism working: ${restartPollingCalled}`);
    logger.log(`Race condition prevention working: ${seekToRegionAndPlayCallCount === 0}`);
    logger.log(`Fix successful: ${firstTransitionCount > 0 && seekToRegionAndPlayCallCount > 0 && restartPollingCalled}`);
    
  } catch (error) {
    logger.error('Test error:', error);
  } finally {
    // Restore original methods
    regionService.getRegions = originalGetRegions;
    regionService.findRegionById = originalFindRegionById;
    regionService.getPlaybackState = originalGetPlaybackState;
    setlistService.getSetlist = originalGetSetlist;
    reaperService.seekToPosition = originalSeekToPosition;
    reaperService.togglePlay = originalTogglePlay;
    setlistNavigationService.seekToRegionAndPlay = originalSeekToRegionAndPlay;
    
    // Restore restartPolling if we mocked it
    if (typeof originalRestartPolling === 'function') {
      setlistNavigationService.restartPolling = originalRestartPolling;
    }
    
    // Reset the transitioning flag
    setlistNavigationService.isTransitioning = false;
    
    // Restart the polling with original implementation
    setlistNavigationService.stopEndOfRegionPolling();
    setlistNavigationService.startEndOfRegionPolling();
  }
}

// Run the test
testMultipleSongTransitions().catch(error => {
  logger.error('Test failed:', error);
});