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
    this.isTransitioning = false;
    
    // Set up event listener for playback state updates
    regionService.on('playbackStateUpdated', (playbackState) => {
      this.handlePlaybackStateUpdate(playbackState);
    });

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
   */
  startEndOfRegionPolling() {
    if (this.endOfRegionPollingInterval) {
      clearInterval(this.endOfRegionPollingInterval);
    }

    this.endOfRegionPollingInterval = setInterval(async () => {
      try {
        const playbackState = regionService.getPlaybackState();
        if (playbackState.selectedSetlistId && playbackState.isPlaying) {
          await this.checkEndOfRegion(playbackState);
        }
      } catch (error) {
        logger.error('Error in end of region polling:', error);
      }
    }, 67);
  }

  /**
   * Stop polling for end of region detection
   */
  stopEndOfRegionPolling() {
    if (this.endOfRegionPollingInterval) {
      clearInterval(this.endOfRegionPollingInterval);
      this.endOfRegionPollingInterval = null;
    }
  }

  /**
   * Restart the polling mechanism
   */
  restartPolling() {
    this.stopEndOfRegionPolling();
    this.isTransitioning = false;
    
    setTimeout(() => {
      this.startEndOfRegionPolling();
    }, 100);
  }

  /**
   * Clean up resources when the service is shutting down
   */
  cleanup() {
    this.stopEndOfRegionPolling();
  }

  /**
   * Check if we're at or approaching the end of the current region
   * @param {PlaybackState} playbackState - Current playback state
   */
  async checkEndOfRegion(playbackState) {
    try {
      if (!playbackState.currentRegionId) {
        return;
      }

      const currentPosition = playbackState.currentPosition;
      const currentRegion = regionService.findRegionById(playbackState.currentRegionId);

      if (!currentRegion || this.isTransitioning) {
        return;
      }

      // Check if we're within 0.6 seconds of the end of the region
      // or if we've just passed the end (within 0.1 seconds past)
      const timeToEnd = currentRegion.end - currentPosition;
      if ((timeToEnd > 0 && timeToEnd < 0.6) || (timeToEnd >= -0.1 && timeToEnd <= 0)) {
        this.isTransitioning = true;

        try {
          const nextSetlistItem = await this.getNextSetlistItem(playbackState.selectedSetlistId);
          if (nextSetlistItem) {
            const region = regionService.findRegionById(nextSetlistItem.regionId);
            if (region) {
              await this.seekToRegionAndPlay(region, true);
            }
          }
        } finally {
          this.isTransitioning = false;
        }
      }
    } catch (error) {
      this.isTransitioning = false;
      logger.error('Error checking end of region:', error);
    }
  }

  /**
   * Handle playback state updates to detect when a song ends
   * @param {PlaybackState} playbackState - Current playback state
   */
  async handlePlaybackStateUpdate(playbackState) {
    try {
      if (!playbackState.selectedSetlistId) {
        return;
      }

      const currentPosition = playbackState.currentPosition;
      let isAtEndOfRegion = false;
      let currentRegion = null;

      if (playbackState.currentRegionId) {
        currentRegion = regionService.findRegionById(playbackState.currentRegionId);
      }

      // Case 1: Not playing and not in any region
      if (!playbackState.isPlaying && playbackState.currentRegionId === null) {
        isAtEndOfRegion = true;
      }
      // Case 2: Not playing and at the end of the current region
      else if (!playbackState.isPlaying && currentRegion) {
        if (Math.abs(currentPosition - currentRegion.end) < 0.05) {
          isAtEndOfRegion = true;
        }
      }

      if (isAtEndOfRegion) {
        const nextSetlistItem = await this.getNextSetlistItem(playbackState.selectedSetlistId);
        if (nextSetlistItem) {
          const region = regionService.findRegionById(nextSetlistItem.regionId);
          if (region) {
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
      const playbackState = regionService.getPlaybackState();
      const currentRegionId = playbackState.currentRegionId;

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
      const playbackState = regionService.getPlaybackState();
      const currentRegionId = playbackState.currentRegionId;

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
      const playbackState = regionService.getPlaybackState();
      const selectedSetlistId = playbackState.selectedSetlistId;

      // If a setlist is selected, navigate within the setlist
      if (selectedSetlistId) {
        const nextItem = await this.getNextSetlistItem(selectedSetlistId);
        if (nextItem) {
          const region = regionService.findRegionById(nextItem.regionId);
          if (region) {
            await this.seekToRegionAndPlay(region);
            return true;
          }
        }
        return false;
      } else {
        // No setlist selected, use normal navigation
        const nextRegion = regionService.getNextRegion();
        if (nextRegion) {
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
      const playbackState = regionService.getPlaybackState();
      const selectedSetlistId = playbackState.selectedSetlistId;

      // If a setlist is selected, navigate within the setlist
      if (selectedSetlistId) {
        const prevItem = await this.getPreviousSetlistItem(selectedSetlistId);
        if (prevItem) {
          const region = regionService.findRegionById(prevItem.regionId);
          if (region) {
            await this.seekToRegionAndPlay(region);
            return true;
          }
        }
        return false;
      } else {
        // No setlist selected, use normal navigation
        const prevRegion = regionService.getPreviousRegion();
        if (prevRegion) {
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
      // Get current playback state and autoplay setting
      const playbackState = regionService.getPlaybackState();
      const isPlaying = playbackState.isPlaying;
      const isAutoplayEnabled = autoplay !== null ? autoplay : playbackState.autoplayEnabled;
      
      // If currently playing, pause first
      if (isPlaying) {
        await reaperService.togglePlay(true); // Pause
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // Add a small offset to ensure position is clearly within the region
      const positionWithOffset = region.start + 0.001;
      
      // Send the seek command
      await reaperService.seekToPosition(positionWithOffset);

      // If was playing and autoplay is enabled, resume playback
      if ((isPlaying || autoplay === true) && isAutoplayEnabled) {
        await new Promise(resolve => setTimeout(resolve, 150));
        await reaperService.togglePlay(false); // Resume
      }

      // Restart the polling mechanism
      this.restartPolling();
      
      return true;
    } catch (error) {
      logger.error('Error seeking to region and playing:', error);
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
          const firstItem = setlist.items[0];
          const region = regionService.findRegionById(firstItem.regionId);
          if (region) {
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