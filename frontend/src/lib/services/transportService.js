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
  getPreviousRegion
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
    
    // Get current playback state and autoplay setting
    const currentPlaybackState = getPlaybackState();
    const isAutoplayEnabled = getAutoplayEnabled();
    
    // If currently playing, pause first
    if (currentPlaybackState.isPlaying) {
      console.log('Pausing before seeking to position');
      socketService.emit('togglePlay'); // Pause
      
      // Wait a short time for pause to take effect
      setTimeout(() => {
        // Send the seek command
        socketService.emit('seekToPosition', position);
        
        // If autoplay is enabled, resume playback
        if (isAutoplayEnabled) {
          console.log('Autoplay enabled, resuming playback');
          setTimeout(() => {
            socketService.emit('togglePlay'); // Resume
          }, TIMEOUTS.reconnect);
        }
      }, TIMEOUTS.reconnect);
    } else {
      // If already paused, just send the command
      socketService.emit('seekToPosition', position);
    }
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
    
    // Get current playback state and autoplay setting
    const currentPlaybackState = getPlaybackState();
    const isAutoplayEnabled = getAutoplayEnabled();
    
    // Provide immediate feedback by updating the playback state
    // This will be overridden by the next server update
    updatePartialPlaybackState({ currentRegionId: regionId });
    
    // If currently playing, pause first
    if (currentPlaybackState.isPlaying) {
      console.log('Pausing before seeking to region');
      socketService.emit('togglePlay'); // Pause
      
      // Wait a short time for pause to take effect
      setTimeout(() => {
        // Send the seek command
        socketService.emit('seekToRegion', regionId);
        
        // If autoplay is enabled, resume playback
        if (isAutoplayEnabled) {
          console.log('Autoplay enabled, resuming playback');
          setTimeout(() => {
            socketService.emit('togglePlay'); // Resume
          }, TIMEOUTS.reconnect);
        }
      }, TIMEOUTS.reconnect);
    } else {
      // If already paused, just send the command
      socketService.emit('seekToRegion', regionId);
    }
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
    // Get current playback state and autoplay setting
    const currentPlaybackState = getPlaybackState();
    const isAutoplayEnabled = getAutoplayEnabled();
    
    // If currently playing, pause first
    if (currentPlaybackState.isPlaying) {
      console.log('Pausing before going to next region');
      socketService.emit('togglePlay'); // Pause
      
      // Wait a short time for pause to take effect
      setTimeout(() => {
        // Send the next region command
        socketService.emit('nextRegion');
        
        // If autoplay is enabled, resume playback
        if (isAutoplayEnabled) {
          console.log('Autoplay enabled, resuming playback');
          setTimeout(() => {
            socketService.emit('togglePlay'); // Resume
          }, TIMEOUTS.reconnect);
        }
      }, TIMEOUTS.reconnect);
    } else {
      // If already paused, just send the command
      socketService.emit('nextRegion');
    }
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
    // Get current playback state and autoplay setting
    const currentPlaybackState = getPlaybackState();
    const isAutoplayEnabled = getAutoplayEnabled();
    
    // If currently playing, pause first
    if (currentPlaybackState.isPlaying) {
      console.log('Pausing before going to previous region');
      socketService.emit('togglePlay'); // Pause
      
      // Wait a short time for pause to take effect
      setTimeout(() => {
        // Send the previous region command
        socketService.emit('previousRegion');
        
        // If autoplay is enabled, resume playback
        if (isAutoplayEnabled) {
          console.log('Autoplay enabled, resuming playback');
          setTimeout(() => {
            socketService.emit('togglePlay'); // Resume
          }, TIMEOUTS.reconnect);
        }
      }, TIMEOUTS.reconnect);
    } else {
      // If already paused, just send the command
      socketService.emit('previousRegion');
    }
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
    // Get current playback state and autoplay setting
    const currentPlaybackState = getPlaybackState();
    const isAutoplayEnabled = getAutoplayEnabled();
    
    // If currently playing, pause first
    if (currentPlaybackState.isPlaying) {
      console.log('Pausing before rewinding to region start');
      socketService.emit('togglePlay'); // Pause
      
      // Wait a short time for pause to take effect
      setTimeout(() => {
        // Send the rewind command
        socketService.emit('seekToCurrentRegionStart');
        
        // If autoplay is enabled, resume playback
        if (isAutoplayEnabled) {
          console.log('Autoplay enabled, resuming playback');
          setTimeout(() => {
            socketService.emit('togglePlay'); // Resume
          }, TIMEOUTS.reconnect);
        }
      }, TIMEOUTS.reconnect);
    } else {
      // If already paused, just send the command
      socketService.emit('seekToCurrentRegionStart');
    }
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

// Export all transport functions as a single object for compatibility
export const transportService = {
  seekToPosition,
  togglePlay,
  seekToRegion,
  nextRegion,
  previousRegion,
  seekToCurrentRegionStart,
  refreshRegions,
  disconnect
};