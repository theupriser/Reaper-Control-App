/**
 * Setlist Navigation Service
 * Handles navigation within setlists and provides shared logic for MIDI and Socket services
 */

const logger = require('../utils/logger');
const regionService = require('./regionService');
const setlistService = require('./setlistService');
const reaperService = require('./reaperService');

class SetlistNavigationService {
  constructor() {
    this.eventListeners = {
      setlistNavigationUpdated: [],
      error: []
    };
    
    this.endOfRegionPollingInterval = null;
    
    // Flag to track if a transition is in progress to prevent race conditions
    this.isTransitioning = false;
    
    // Set up event listener for playback state updates to detect when a song ends
    regionService.on('playbackStateUpdated', (playbackState) => {
      this.handlePlaybackStateUpdate(playbackState);
    });

    // Start the high-frequency polling for end of region detection
    this.startEndOfRegionPolling();
  }

  /**
   * Register an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback);
    }
  }

  /**
   * Emit an event to all registered listeners
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emitEvent(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => callback(data));
    }
  }

  /**
   * Start polling for end of region detection at 15Hz (approximately 67ms interval)
   * This is a separate mechanism from the regionService polling to ensure timely detection
   * of when a song is about to end during playback
   */
  startEndOfRegionPolling() {
    // Clear any existing interval
    if (this.endOfRegionPollingInterval) {
      clearInterval(this.endOfRegionPollingInterval);
    }

    // Set up new polling interval at 15Hz (approximately 67ms)
    this.endOfRegionPollingInterval = setInterval(async () => {
      try {
        // Get the current playback state directly
        const playbackState = regionService.getPlaybackState();

        // Only check for end of region if a setlist is selected and we're playing
        if (playbackState.selectedSetlistId && playbackState.isPlaying) {
          // Check if we're approaching the end of the current region
          await this.checkEndOfRegion(playbackState);
        }
      } catch (error) {
        logger.error('Error in end of region polling:', error);
      }
    }, 67); // Poll at 15Hz (approximately 67ms)

    logger.log('Started end of region polling at 15Hz');
  }

  /**
   * Stop polling for end of region detection
   */
  stopEndOfRegionPolling() {
    if (this.endOfRegionPollingInterval) {
      clearInterval(this.endOfRegionPollingInterval);
      this.endOfRegionPollingInterval = null;
      logger.log('Stopped end of region polling');
    }
  }

  /**
   * Restart the polling mechanism
   * This is used to ensure polling continues working after song transitions
   */
  restartPolling() {
    // Stop any existing polling
    this.stopEndOfRegionPolling();

    // Reset the transitioning flag to ensure it's in a clean state
    this.isTransitioning = false;

    // Force a small delay before restarting to ensure clean state
    // Increased from 50ms to 100ms for better reliability
    setTimeout(() => {
      // Start a new polling interval
      this.startEndOfRegionPolling();
      logger.log('Restarted end of region polling after song transition');
    }, 100);
  }

  /**
   * Clean up resources when the service is shutting down
   * This should be called when the application is terminating
   */
  cleanup() {
    this.stopEndOfRegionPolling();
    logger.log('Cleaned up setlist navigation service resources');
  }

  /**
   * Check if we're at or approaching the end of the current region
   * @param {PlaybackState} playbackState - Current playback state
   */
  async checkEndOfRegion(playbackState) {
    logger.log('Checking end of region...');

    try {
      // Log detailed information about the current state for better diagnostics
      if (playbackState.currentRegionId) {
        const currentRegion = regionService.findRegionById(playbackState.currentRegionId);
        if (currentRegion) {
          const timeToEnd = currentRegion.end - playbackState.currentPosition;
          logger.log(`Current position: ${playbackState.currentPosition.toFixed(3)}, Region end: ${currentRegion.end.toFixed(3)}, Time to end: ${timeToEnd.toFixed(3)}`);
        }
      }
      // Only proceed if we're in a region
      if (!playbackState.currentRegionId) {
        return;
      }

      const currentPosition = playbackState.currentPosition;
      const currentRegion = regionService.findRegionById(playbackState.currentRegionId);

      if (!currentRegion) {
        return;
      }

      // Add a flag to prevent multiple transitions being triggered simultaneously
      // This helps prevent race conditions where multiple polling cycles detect the end at the same time
      if (this.isTransitioning) {
        return;
      }

      // Check if we're within 0.5 seconds of the end of the region (increased from 0.2 for better reliability)
      // or if we've just passed the end (within 0.1 seconds past) to catch cases where position jumps
      const timeToEnd = currentRegion.end - currentPosition;
      if ((timeToEnd > 0 && timeToEnd < 0.6) || (timeToEnd >= -0.1 && timeToEnd <= 0)) {
        logger.log('Polling detected approaching/at end of region:', currentRegion.name, 'Time to end:', timeToEnd);

        // Set transitioning flag to prevent multiple transitions
        this.isTransitioning = true;

        try {
          // Get the next setlist item
          const nextSetlistItem = await this.getNextSetlistItem(playbackState.selectedSetlistId);
          if (nextSetlistItem) {
            logger.log('Song ending, automatically moving to next song in setlist:', nextSetlistItem.name);

            // Find the region for this setlist item
            const region = regionService.findRegionById(nextSetlistItem.regionId);
            if (region) {
              // Seek to the next region and start playback (force autoplay to true)
              await this.seekToRegionAndPlay(region, true);
            } else {
              logger.log('Could not find region for next setlist item:', nextSetlistItem.regionId);
            }
          } else {
            logger.log('No next setlist item found, reached end of setlist');
          }
        } finally {
          // Always clear the transitioning flag when done
          this.isTransitioning = false;
        }
      }
    } catch (error) {
      // Make sure to clear the transitioning flag even if an error occurs
      this.isTransitioning = false;
      logger.error('Error checking end of region:', error);
    }
  }

  /**
   * Handle playback state updates to detect when a song ends
   * This is triggered by the regionService's playbackStateUpdated event
   * and complements the high-frequency polling mechanism
   * @param {PlaybackState} playbackState - Current playback state
   */
  async handlePlaybackStateUpdate(playbackState) {
    try {
      // Check if a setlist is selected
      if (!playbackState.selectedSetlistId) {
        return; // No setlist selected, use normal navigation
      }

      // Store the current position for comparison
      const currentPosition = playbackState.currentPosition;

      let isAtEndOfRegion = false;
      let currentRegion = null;

      if (playbackState.currentRegionId) {
        currentRegion = regionService.findRegionById(playbackState.currentRegionId);
      }

      // We only handle non-playing cases here since the polling mechanism handles the playing case

      // Case 1: Not playing and not in any region
      if (!playbackState.isPlaying && playbackState.currentRegionId === null) {
        isAtEndOfRegion = true;
      }
      // Case 2: Not playing and at the end of the current region
      else if (!playbackState.isPlaying && currentRegion) {
        // Increased margin from 0.01 to 0.05 seconds to better detect end of region
        if (Math.abs(currentPosition - currentRegion.end) < 0.05) {
          isAtEndOfRegion = true;
          logger.log('Detected end of region (stopped):', currentRegion.name);
        }
      }
      // Note: We don't handle the "playing and approaching end" case here anymore
      // That's now handled by the high-frequency polling mechanism

      // If we're at the end of a region, move to the next song in the setlist
      if (isAtEndOfRegion) {
        const nextSetlistItem = await this.getNextSetlistItem(playbackState.selectedSetlistId);
        if (nextSetlistItem) {
          logger.log('Song ended, automatically moving to next song in setlist:', nextSetlistItem.name);

          // Find the region for this setlist item
          const region = regionService.findRegionById(nextSetlistItem.regionId);
          if (region) {
            // Seek to the next region and start playback (force autoplay to true)
            await this.seekToRegionAndPlay(region, true);
          }
        }
      }
    } catch (error) {
      logger.error('Error handling playback state update:', error);
    }
  }

  /**
   * Get the next item in a setlist based on the current region
   * @param {string} setlistId - ID of the setlist
   * @returns {Object|null} Next setlist item or null if at the end
   */
  async getNextSetlistItem(setlistId) {
    try {
      // Get the current playback state
      const playbackState = regionService.getPlaybackState();
      const currentRegionId = playbackState.currentRegionId;

      // Get the setlist
      const setlist = setlistService.getSetlist(setlistId);
      if (!setlist || setlist.items.length === 0) {
        return null;
      }

      // If no current region, return the first item in the setlist
      if (!currentRegionId) {
        return setlist.items[0];
      }

      // Find the current item in the setlist
      const currentItemIndex = setlist.items.findIndex(item => item.regionId === currentRegionId);

      // If current region is not in the setlist or it's the last item, return null
      if (currentItemIndex === -1 || currentItemIndex >= setlist.items.length - 1) {
        return null;
      }

      // Return the next item
      return setlist.items[currentItemIndex + 1];
    } catch (error) {
      logger.error('Error getting next setlist item:', error);
      return null;
    }
  }

  /**
   * Get the previous item in a setlist based on the current region
   * @param {string} setlistId - ID of the setlist
   * @returns {Object|null} Previous setlist item or null if at the beginning
   */
  async getPreviousSetlistItem(setlistId) {
    try {
      // Get the current playback state
      const playbackState = regionService.getPlaybackState();
      const currentRegionId = playbackState.currentRegionId;

      // Get the setlist
      const setlist = setlistService.getSetlist(setlistId);
      if (!setlist || setlist.items.length === 0) {
        return null;
      }

      // If no current region, return the first item in the setlist
      if (!currentRegionId) {
        return setlist.items[0];
      }

      // Find the current item in the setlist
      const currentItemIndex = setlist.items.findIndex(item => item.regionId === currentRegionId);

      // If current region is not in the setlist or it's the first item, return null
      if (currentItemIndex <= 0) {
        return null;
      }

      // Return the previous item
      return setlist.items[currentItemIndex - 1];
    } catch (error) {
      logger.error('Error getting previous setlist item:', error);
      return null;
    }
  }

  /**
   * Navigate to the next item in the setlist or next region if no setlist is selected
   * @returns {Promise<boolean>} True if navigation was successful
   */
  async navigateToNext() {
    try {
      // Get the current playback state
      const playbackState = regionService.getPlaybackState();
      const selectedSetlistId = playbackState.selectedSetlistId;

      // If a setlist is selected, navigate within the setlist
      if (selectedSetlistId) {
        const nextItem = await this.getNextSetlistItem(selectedSetlistId);
        if (nextItem) {
          // Find the region for this setlist item
          const region = regionService.findRegionById(nextItem.regionId);
          if (region) {
            // Seek to the region
            await this.seekToRegionAndPlay(region);
            return true;
          }
        }
        return false;
      } else {
        // No setlist selected, use normal navigation
        const nextRegion = regionService.getNextRegion();
        if (nextRegion) {
          // Seek to the region
          await this.seekToRegionAndPlay(nextRegion);
          return true;
        }
        return false;
      }
    } catch (error) {
      logger.error('Error navigating to next:', error);
      return false;
    }
  }

  /**
   * Navigate to the previous item in the setlist or previous region if no setlist is selected
   * @returns {Promise<boolean>} True if navigation was successful
   */
  async navigateToPrevious() {
    try {
      // Get the current playback state
      const playbackState = regionService.getPlaybackState();
      const selectedSetlistId = playbackState.selectedSetlistId;

      // If a setlist is selected, navigate within the setlist
      if (selectedSetlistId) {
        const prevItem = await this.getPreviousSetlistItem(selectedSetlistId);
        if (prevItem) {
          // Find the region for this setlist item
          const region = regionService.findRegionById(prevItem.regionId);
          if (region) {
            // Seek to the region
            await this.seekToRegionAndPlay(region);
            return true;
          }
        }
        return false;
      } else {
        // No setlist selected, use normal navigation
        const prevRegion = regionService.getPreviousRegion();
        if (prevRegion) {
          // Seek to the region
          await this.seekToRegionAndPlay(prevRegion);
          return true;
        }
        return false;
      }
    } catch (error) {
      logger.error('Error navigating to previous:', error);
      return false;
    }
  }

  /**
   * Seek to a region and optionally start playback
   * @param {Region} region - Region to seek to
   * @param {boolean} autoplay - Whether to start playback after seeking (defaults to current autoplay setting)
   * @returns {Promise<boolean>} True if successful
   */
  async seekToRegionAndPlay(region, autoplay = null) {
    try {
      logger.log(`Seeking to region: ${region.name} (ID: ${region.id}), Start: ${region.start}, End: ${region.end}`);
      
      // Get current playback state and autoplay setting
      const playbackState = regionService.getPlaybackState();
      const isPlaying = playbackState.isPlaying;
      const isAutoplayEnabled = autoplay !== null ? autoplay : playbackState.autoplayEnabled;
      
      logger.log(`Current state - Playing: ${isPlaying}, Autoplay enabled: ${isAutoplayEnabled}, Forced autoplay: ${autoplay}`);

      // If currently playing, pause first
      if (isPlaying) {
        logger.log('Pausing playback before seeking');
        await reaperService.togglePlay(true); // Pause

        // Wait a short time for pause to take effect - increased for reliability
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // Add a small offset to ensure position is clearly within the region
      const positionWithOffset = region.start + 0.001;
      logger.log(`Seeking to position: ${positionWithOffset}`);

      // Send the seek command
      await reaperService.seekToPosition(positionWithOffset);

      // If was playing and autoplay is enabled, resume playback
      if ((isPlaying || autoplay === true) && isAutoplayEnabled) {
        // Wait a short time for seek to take effect - increased for reliability
        await new Promise(resolve => setTimeout(resolve, 150));

        logger.log('Resuming playback after seeking');
        await reaperService.togglePlay(false); // Resume
      }

      // Restart the polling mechanism to ensure it continues working after transitions
      // This is crucial to fix the issue where polling stops after the first transition
      logger.log('Restarting polling after region transition');
      this.restartPolling();
      
      return true;
    } catch (error) {
      logger.error('Error seeking to region and playing:', error);
      // Make sure to reset the transitioning flag in case of error
      this.isTransitioning = false;
      return false;
    }
  }

  /**
   * Handle toggle play with setlist awareness
   * @returns {Promise<boolean>} True if successful
   */
  async handleTogglePlay() {
    try {
      const playbackState = regionService.getPlaybackState();
      
      // If not in a region and a setlist is selected, start from the first item
      if (!playbackState.currentRegionId && playbackState.selectedSetlistId) {
        const setlist = setlistService.getSetlist(playbackState.selectedSetlistId);
        if (setlist && setlist.items.length > 0) {
          // Get the first item in the setlist
          const firstItem = setlist.items[0];
          
          // Find the region for this setlist item
          const region = regionService.findRegionById(firstItem.regionId);
          if (region) {
            // Seek to the region and start playback
            await this.seekToRegionAndPlay(region, true);
            return true;
          }
        }
      }
      
      // Otherwise, just toggle play normally
      await reaperService.togglePlay(playbackState.isPlaying);
      return true;
    } catch (error) {
      logger.error('Error handling toggle play:', error);
      return false;
    }
  }
}

// Create and export a singleton instance
const setlistNavigationService = new SetlistNavigationService();
module.exports = setlistNavigationService;