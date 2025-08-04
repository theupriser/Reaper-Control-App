/**
 * Test script for end of region polling
 * Tests the automatic playback of the next song when the current song ends
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

// Mock dependencies
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

// Mock regionService methods
const originalGetRegions = regionService.getRegions;
const originalFindRegionById = regionService.findRegionById;
const originalGetPlaybackState = regionService.getPlaybackState;

regionService.getRegions = () => mockRegions;
regionService.findRegionById = (id) => mockRegions.find(r => r.id === id);
regionService.getPlaybackState = () => mockPlaybackState;

// Mock setlistService methods
const originalGetSetlist = setlistService.getSetlist;
setlistService.getSetlist = () => mockSetlist;

// Mock reaperService methods to avoid connection errors
const originalSeekToPosition = reaperService.seekToPosition;
const originalTogglePlay = reaperService.togglePlay;

reaperService.seekToPosition = async () => {
  logger.log('[MOCK] Seeking to position');
  return true;
};

reaperService.togglePlay = async () => {
  logger.log('[MOCK] Toggling play state');
  return true;
};

// Track if seekToRegionAndPlay was called
let seekToRegionAndPlayCalled = false;
const originalSeekToRegionAndPlay = setlistNavigationService.seekToRegionAndPlay;
setlistNavigationService.seekToRegionAndPlay = async (region, autoplay) => {
  logger.log(`[MOCK] Seeking to region ${region.name} with autoplay=${autoplay}`);
  seekToRegionAndPlayCalled = true;
  return true;
};

// Test cases
async function testEndOfRegionPolling() {
  try {
    logger.log('=== Testing End of Region Polling ===');
    
    // Stop the existing polling to avoid interference
    setlistNavigationService.stopEndOfRegionPolling();
    
    // Test Case 1: Song about to end during playback
    logger.log('--- Test Case 1: Song about to end during playback ---');
    mockPlaybackState = new PlaybackState({
      isPlaying: true,
      currentPosition: 59.85, // Very close to the end of region 1 (Song 1)
      currentRegionId: 1,
      selectedSetlistId: 'test-setlist-id'
    });
    
    logger.log(`Current position: ${mockPlaybackState.currentPosition}, Region end: ${mockRegions[0].end}`);
    logger.log(`Time to end: ${mockRegions[0].end - mockPlaybackState.currentPosition} seconds`);
    
    // Reset tracking variable
    seekToRegionAndPlayCalled = false;
    
    // Call checkEndOfRegion directly to simulate what the polling would do
    await setlistNavigationService.checkEndOfRegion(mockPlaybackState);
    
    // Check if seekToRegionAndPlay was called
    logger.log(`seekToRegionAndPlay called: ${seekToRegionAndPlayCalled}`);
    
    // Test Case 2: Song not near end during playback (should not trigger next song)
    logger.log('\n--- Test Case 2: Song not near end during playback ---');
    mockPlaybackState = new PlaybackState({
      isPlaying: true,
      currentPosition: 30.0, // Middle of the song, not near end
      currentRegionId: 1,
      selectedSetlistId: 'test-setlist-id'
    });
    
    logger.log(`Current position: ${mockPlaybackState.currentPosition}, Region end: ${mockRegions[0].end}`);
    logger.log(`Time to end: ${mockRegions[0].end - mockPlaybackState.currentPosition} seconds`);
    
    // Reset tracking variable
    seekToRegionAndPlayCalled = false;
    
    // Call checkEndOfRegion directly to simulate what the polling would do
    await setlistNavigationService.checkEndOfRegion(mockPlaybackState);
    
    // Check if seekToRegionAndPlay was called
    logger.log(`seekToRegionAndPlay called: ${seekToRegionAndPlayCalled}`);
    
    logger.log('\nAll test cases completed');
  } catch (error) {
    logger.error('Test error:', error);
    throw error;
  } finally {
    // Restore original methods
    regionService.getRegions = originalGetRegions;
    regionService.findRegionById = originalFindRegionById;
    regionService.getPlaybackState = originalGetPlaybackState;
    setlistService.getSetlist = originalGetSetlist;
    reaperService.seekToPosition = originalSeekToPosition;
    reaperService.togglePlay = originalTogglePlay;
    setlistNavigationService.seekToRegionAndPlay = originalSeekToRegionAndPlay;
    
    // Restart the polling
    setlistNavigationService.startEndOfRegionPolling();
  }
}

// Run the test
testEndOfRegionPolling().catch(error => {
  logger.error('Test failed:', error);
});