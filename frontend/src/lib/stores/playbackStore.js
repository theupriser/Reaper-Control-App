/**
 * Playback Store
 * Manages the state of playback including play/pause status, position, and current region
 */

import { writable } from 'svelte/store';

/**
 * Store for playback state
 */
export const playbackState = writable({
  isPlaying: false,
  currentPosition: 0,
  currentRegionId: null
});

/**
 * Store for autoplay toggle
 */
export const autoplayEnabled = writable(true);

/**
 * Updates the playback state with new data
 * @param {Object} data - Playback state data
 * @returns {boolean} - True if update was successful
 */
export function updatePlaybackState(data) {
  try {
    // Validate the data
    if (!data) {
      console.warn('No playback state received');
      return false;
    }
    
    // Ensure required fields are present
    if (data.isPlaying === undefined || data.currentPosition === undefined) {
      console.error('Received playback state is missing required fields:', data);
      return false;
    }
    
    // Update the playback state store
    playbackState.set({
      isPlaying: Boolean(data.isPlaying),
      currentPosition: Number(data.currentPosition) || 0,
      currentRegionId: data.currentRegionId !== undefined ? Number(data.currentRegionId) : null
    });
    
    // Log success
    console.log('Successfully updated playback state:', {
      isPlaying: Boolean(data.isPlaying),
      currentPosition: Number(data.currentPosition) || 0,
      currentRegionId: data.currentRegionId !== undefined ? Number(data.currentRegionId) : null
    });
    
    return true;
  } catch (error) {
    console.error('Error processing playback state data:', error);
    return false;
  }
}

/**
 * Updates only specific fields of the playback state
 * @param {Object} partialState - Partial playback state data
 */
export function updatePartialPlaybackState(partialState) {
  playbackState.update(state => ({
    ...state,
    ...partialState
  }));
}

/**
 * Gets the current playback state
 * @returns {Object} - The current playback state
 */
export function getPlaybackState() {
  let state;
  const unsubscribe = playbackState.subscribe(value => {
    state = value;
  });
  unsubscribe();
  return state;
}

/**
 * Gets the current autoplay setting
 * @returns {boolean} - The current autoplay setting
 */
export function getAutoplayEnabled() {
  let enabled;
  const unsubscribe = autoplayEnabled.subscribe(value => {
    enabled = value;
  });
  unsubscribe();
  return enabled;
}

/**
 * Toggles the autoplay setting
 */
export function toggleAutoplay() {
  autoplayEnabled.update(current => !current);
}