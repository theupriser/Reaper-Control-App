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
  currentRegionId: null,
  selectedSetlistId: null,
  bpm: 120, // Default BPM value
  timeSignature: {
    numerator: 4,
    denominator: 4
  } // Default time signature (4/4)
});

/**
 * Store for autoplay toggle
 */
export const autoplayEnabled = writable(true);

/**
 * Store for count-in toggle
 */
export const countInEnabled = writable(false);

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
      currentRegionId: data.currentRegionId !== undefined ? Number(data.currentRegionId) : null,
      selectedSetlistId: data.selectedSetlistId || null,
      bpm: data.bpm !== undefined ? Number(data.bpm) : 120, // Use received BPM or default to 120
      timeSignature: data.timeSignature || { numerator: 4, denominator: 4 } // Use received time signature or default to 4/4
    });
    
    // Update the autoplayEnabled store if the value is present in the data
    if (data.autoplayEnabled !== undefined) {
      autoplayEnabled.set(Boolean(data.autoplayEnabled));
    }
    
    // Update the countInEnabled store if the value is present in the data
    if (data.countInEnabled !== undefined) {
      countInEnabled.set(Boolean(data.countInEnabled));
    }
    
    // Log success
    console.log('Successfully updated playback state:', {
      isPlaying: Boolean(data.isPlaying),
      currentPosition: Number(data.currentPosition) || 0,
      currentRegionId: data.currentRegionId !== undefined ? Number(data.currentRegionId) : null,
      selectedSetlistId: data.selectedSetlistId || null,
      bpm: data.bpm !== undefined ? Number(data.bpm) : 120,
      timeSignature: data.timeSignature || { numerator: 4, denominator: 4 },
      autoplayEnabled: data.autoplayEnabled !== undefined ? Boolean(data.autoplayEnabled) : undefined,
      countInEnabled: data.countInEnabled !== undefined ? Boolean(data.countInEnabled) : undefined
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

/**
 * Gets the current count-in setting
 * @returns {boolean} - The current count-in setting
 */
export function getCountInEnabled() {
  let enabled;
  const unsubscribe = countInEnabled.subscribe(value => {
    enabled = value;
  });
  unsubscribe();
  return enabled;
}

/**
 * Toggles the count-in setting
 */
export function toggleCountIn() {
  countInEnabled.update(current => !current);
}

/**
 * Sets the selected setlist ID
 * @param {string|null} setlistId - Setlist ID or null for all regions
 */
export function setSelectedSetlist(setlistId) {
  // Update the local store
  updatePartialPlaybackState({ selectedSetlistId: setlistId });
  
  // Log the change
  console.log(`Setting selected setlist to: ${setlistId || 'null (all regions)'}`);
  
  // Import dynamically to avoid circular dependencies
  import('../services/socketService').then(module => {
    const socketService = module.default;
    
    // Send to backend if socket is connected
    if (socketService.isConnected()) {
      socketService.emit('setSelectedSetlist', setlistId);
      console.log('Sent selected setlist to backend');
    } else {
      console.warn('Socket not connected, selected setlist not sent to backend');
    }
  });
}