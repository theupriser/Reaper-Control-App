/**
 * Transport Service
 * Handles transport control commands for playback
 */

import socketService from './socketService';
import { TIMEOUTS } from '../config/socketConfig';
import {
  getPlaybackState,
  getAutoplayEnabled,
  updatePartialPlaybackState,
  setStatusMessage,
  createErrorMessage,
  findRegionById,
  getNextRegion,
  getPreviousRegion,
  toggleAutoplay as toggleAutoplayStore,
  autoplayEnabled
} from '../stores';

/**
 * Seeks to a specific position with enhanced feedback and error handling
 * @param {number} position - The position to seek to in seconds
 */
export function seekToPosition(position) {
  console.log('Sending seekToPosition command for position:', position);
  try {
    if (position === undefined || position === null || isNaN(position)) {
      console.error('Invalid position:', position);
      return;
    }
    
    // Send the seek command to the backend
    // The backend will handle pausing and resuming playback as needed
    socketService.emit('seekToPosition', position);
    
    // Clear the status message after 1.5 seconds
    setTimeout(() => {
      setStatusMessage(null);
    }, 1500);
  } catch (error) {
    console.error('Error sending seekToPosition command:', error);
    setStatusMessage(createErrorMessage(
      'Failed to seek to position',
      'There was an error communicating with the server. Please try again.'
    ));
  }
}

/**
 * Toggles play/pause with enhanced feedback and error handling
 */
export function togglePlay() {
  console.log('Sending togglePlay command');
  try {
    // Send the command to the backend
    socketService.emit('togglePlay');
    
    // Don't update the UI immediately - wait for the backend to confirm
    // This ensures the UI reflects Reaper's actual state
    console.log('Waiting for backend to confirm playback state change');
    
    // Clear the status message after 1.5 seconds (after backend check completes)
    setTimeout(() => {
      setStatusMessage(null);
    }, 1500);
  } catch (error) {
    console.error('Error sending togglePlay command:', error);
    setStatusMessage(createErrorMessage(
      'Failed to toggle playback',
      'There was an error communicating with the server. Please try again.'
    ));
  }
}

/**
 * Seeks to a specific region with enhanced feedback and error handling
 * @param {number} regionId - The ID of the region to seek to
 */
export function seekToRegion(regionId) {
  console.log('Sending seekToRegion command for region ID:', regionId);
  try {
    if (regionId === undefined || regionId === null) {
      console.error('Invalid region ID:', regionId);
      return;
    }
    
    // Provide immediate feedback by updating the playback state
    // This will be overridden by the next server update
    updatePartialPlaybackState({ currentRegionId: regionId });
    
    // Send the seek command to the backend
    // The backend will handle pausing and resuming playback as needed
    socketService.emit('seekToRegion', regionId);
    
    // Clear the status message after 1.5 seconds
    setTimeout(() => {
      setStatusMessage(null);
    }, 1500);
  } catch (error) {
    console.error('Error sending seekToRegion command:', error);
    setStatusMessage(createErrorMessage(
      'Failed to seek to region',
      'There was an error communicating with the server. Please try again.'
    ));
  }
}

/**
 * Navigates to the next region with enhanced feedback and error handling
 */
export function nextRegion() {
  console.log('Sending nextRegion command');
  try {
    // Send the next region command to the backend
    // The backend will handle pausing and resuming playback as needed
    socketService.emit('nextRegion');
    
    // Clear the status message after 1.5 seconds
    setTimeout(() => {
      setStatusMessage(null);
    }, 1500);
  } catch (error) {
    console.error('Error sending nextRegion command:', error);
    setStatusMessage(createErrorMessage(
      'Failed to go to next region',
      'There was an error communicating with the server. Please try again.'
    ));
  }
}

/**
 * Navigates to the previous region with enhanced feedback and error handling
 */
export function previousRegion() {
  console.log('Sending previousRegion command');
  try {
    // Send the previous region command to the backend
    // The backend will handle pausing and resuming playback as needed
    socketService.emit('previousRegion');
    
    // Clear the status message after 1.5 seconds
    setTimeout(() => {
      setStatusMessage(null);
    }, 1500);
  } catch (error) {
    console.error('Error sending previousRegion command:', error);
    setStatusMessage(createErrorMessage(
      'Failed to go to previous region',
      'There was an error communicating with the server. Please try again.'
    ));
  }
}

/**
 * Seeks to the start of the current region with enhanced feedback and error handling
 */
export function seekToCurrentRegionStart() {
  console.log('Sending seekToCurrentRegionStart command');
  try {
    // Send the rewind command to the backend
    // The backend will handle pausing and resuming playback as needed
    socketService.emit('seekToCurrentRegionStart');
    
    // Clear the status message after 1.5 seconds
    setTimeout(() => {
      setStatusMessage(null);
    }, 1500);
  } catch (error) {
    console.error('Error sending seekToCurrentRegionStart command:', error);
    setStatusMessage(createErrorMessage(
      'Failed to restart current region',
      'There was an error communicating with the server. Please try again.'
    ));
  }
}

/**
 * Refreshes the regions list with enhanced feedback and error handling
 */
export function refreshRegions() {
  console.log('Sending refreshRegions command');
  try {
    socketService.emit('refreshRegions');
    
    // Clear any status message after 2 seconds
    setTimeout(() => {
      setStatusMessage(null);
    }, TIMEOUTS.statusClear);
  } catch (error) {
    console.error('Error sending refreshRegions command:', error);
    setStatusMessage(createErrorMessage(
      'Failed to refresh regions',
      'There was an error communicating with the server. Please try again.'
    ));
  }
}

/**
 * Disconnects the socket
 */
export function disconnect() {
  socketService.disconnect();
}

/**
 * Toggles the autoplay setting with enhanced feedback and error handling
 * @param {boolean} enabled - The new autoplay setting
 */
export function toggleAutoplay(enabled) {
  console.log('Sending toggleAutoplay command:', enabled);
  try {
    // If no value is provided, toggle the current value
    if (enabled === undefined) {
      const currentValue = getAutoplayEnabled();
      enabled = !currentValue;
      toggleAutoplayStore();
    } else {
      // If a specific value is provided, set it directly
      // This requires updating the store manually since toggleAutoplayStore only toggles
      autoplayEnabled.set(enabled);
    }
    
    // Send the command to the backend
    socketService.emit('toggleAutoplay', enabled);
    
    // Clear the status message after 1.5 seconds
    setTimeout(() => {
      setStatusMessage(null);
    }, 1500);
  } catch (error) {
    console.error('Error sending toggleAutoplay command:', error);
    setStatusMessage(createErrorMessage(
      'Failed to toggle autoplay',
      'There was an error communicating with the server. Please try again.'
    ));
  }
}

// Export all transport functions as a single object for compatibility
export const transportService = {
  seekToPosition,
  togglePlay,
  seekToRegion,
  nextRegion,
  previousRegion,
  seekToCurrentRegionStart,
  refreshRegions,
  toggleAutoplay,
  disconnect
};