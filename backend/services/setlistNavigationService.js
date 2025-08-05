/**
 * Setlist Navigation Service
 * Handles navigation within setlists and provides shared logic for MIDI and Socket services
 */

const logger = require('../utils/logger');
const regionService = require('./regionService');
const setlistService = require('./setlistService');
const reaperService = require('./reaperService');
const markerService = require('./markerService');

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
              // Check if the region has a !bpm marker
              const bpm = this._getBpmForRegion(region);
              
              // Reset BPM when automatically transitioning to the next song
              reaperService.resetBeatPositions(bpm);
              if (bpm !== null) {
                logger.log(`Reset beat positions for BPM calculation when automatically transitioning to next song with initial BPM: ${bpm}`);
              } else {
                logger.log('Reset beat positions for BPM calculation when automatically transitioning to next song');
              }
              
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
            // Check if the region has a !bpm marker
            const bpm = this._getBpmForRegion(region);
            
            // Reset BPM when automatically transitioning to the next song
            reaperService.resetBeatPositions(bpm);
            if (bpm !== null) {
              logger.log(`Reset beat positions for BPM calculation when transitioning to next song after end detection with initial BPM: ${bpm}`);
            } else {
              logger.log('Reset beat positions for BPM calculation when transitioning to next song after end detection');
            }
            
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
            // Always disable count-in for next button navigation, regardless of the global setting
            // seekToRegionAndPlay will check for !bpm markers and set the BPM accordingly
            await this.seekToRegionAndPlay(region, null, false);
            return true;
          }
        }
        return false;
      } else {
        // No setlist selected, use normal navigation
        const nextRegion = regionService.getNextRegion();
        if (nextRegion) {
          // Always disable count-in for next button navigation, regardless of the global setting
          // seekToRegionAndPlay will check for !bpm markers and set the BPM accordingly
          await this.seekToRegionAndPlay(nextRegion, null, false);
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
            // Always disable count-in for previous button navigation, regardless of the global setting
            // seekToRegionAndPlay will check for !bpm markers and set the BPM accordingly
            await this.seekToRegionAndPlay(region, null, false);
            return true;
          }
        }
        return false;
      } else {
        // No setlist selected, use normal navigation
        const prevRegion = regionService.getPreviousRegion();
        if (prevRegion) {
          // Always disable count-in for previous button navigation, regardless of the global setting
          // seekToRegionAndPlay will check for !bpm markers and set the BPM accordingly
          await this.seekToRegionAndPlay(prevRegion, null, false);
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
   * Extract BPM from a marker name
   * @param {string} name - Marker name
   * @returns {number|null} BPM value or null if not a BPM marker
   * @private
   */
  _extractBpmFromMarker(name) {
    const bpmMatch = name.match(/!bpm:(\d+(\.\d+)?)/);
    return bpmMatch ? parseFloat(bpmMatch[1]) : null;
  }

  /**
   * Get the BPM for a region if a !bpm marker is present
   * @param {Object} region - Region object
   * @returns {number|null} - BPM value or null if no !bpm marker
   * @private
   */
  _getBpmForRegion(region) {
    if (!region) return null;
    
    // Get all markers
    const markers = markerService.getMarkers();
    if (!markers || markers.length === 0) return null;
    
    // Find markers that are within the region
    const regionMarkers = markers.filter(marker => 
      marker.position >= region.start && 
      marker.position <= region.end
    );
    
    // Check each marker for !bpm tag
    for (const marker of regionMarkers) {
      const bpm = this._extractBpmFromMarker(marker.name);
      if (bpm !== null) {
        logger.log(`Found !bpm marker in region ${region.name} with BPM: ${bpm}`);
        return bpm;
      }
    }
    
    return null;
  }

  /**
   * Seek to a region and optionally start playback
   * @param {Region} region - Region to seek to
   * @param {boolean} autoplay - Whether to start playback after seeking (defaults to current autoplay setting)
   * @param {boolean} countIn - Whether to use count-in before playback (defaults to current countIn setting)
   * @returns {Promise<boolean>} True if successful
   */
  async seekToRegionAndPlay(region, autoplay = null, countIn = null) {
    try {
      // Get current playback state and settings
      const playbackState = regionService.getPlaybackState();
      const isPlaying = playbackState.isPlaying;
      const isAutoplayEnabled = autoplay !== null ? autoplay : playbackState.autoplayEnabled;
      const isCountInEnabled = countIn !== null ? countIn : playbackState.countInEnabled;
      
      // Check if the region has a !bpm marker
      const bpm = this._getBpmForRegion(region);
      
      // Reset BPM when changing to a new region/song, passing the BPM from marker if available
      reaperService.resetBeatPositions(bpm);
      if (bpm !== null) {
        logger.log(`Reset beat positions for BPM calculation when seeking to region ${region.name} with initial BPM: ${bpm}`);
      } else {
        logger.log('Reset beat positions for BPM calculation when seeking to region:', region.name);
      }
      
      // If currently playing, pause first
      if (isPlaying) {
        await reaperService.togglePlay(true); // Pause
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      let positionToSeek;
      
      // If count-in is enabled, position the cursor 2 bars before the marker
      // Calculate the actual duration of 2 bars based on the current time signature and BPM
      if (isCountInEnabled) {
        try {
          // Get the duration of 2 bars in seconds based on the current time signature
          const countInDuration = await reaperService.calculateBarsToSeconds(2);
          
          // Calculate position 2 bars before region start
          // Ensure we don't go before the start of the project (negative time)
          positionToSeek = Math.max(0, region.start - countInDuration);
          logger.log(`Count-in enabled, positioning cursor 2 bars (${countInDuration.toFixed(2)}s) before region at ${positionToSeek.toFixed(2)}s`);
        } catch (error) {
          // Fallback to default calculation if there's an error
          logger.error('Error calculating count-in position, using default:', error);
          positionToSeek = Math.max(0, region.start - 4); // Default to 4 seconds (2 bars at 4/4 and 120 BPM)
          logger.log(`Count-in enabled (fallback), positioning cursor 2 bars (4s) before region at ${positionToSeek}s`);
        }
      } else {
        // Add a small offset to ensure position is clearly within the region
        positionToSeek = region.start + 0.001;
      }
      
      // Send the seek command
      await reaperService.seekToPosition(positionToSeek);

      // If was playing and autoplay is enabled, resume playback
      if ((isPlaying || autoplay === true) && isAutoplayEnabled) {
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // If count-in is enabled, use playWithCountIn, otherwise use normal togglePlay
        if (isCountInEnabled) {
          await reaperService.playWithCountIn();
        } else {
          await reaperService.togglePlay(false); // Resume without count-in
        }
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
            // Check if the region has a !bpm marker
            const bpm = this._getBpmForRegion(region);
            
            // Reset BPM when starting playback from the first item in a setlist
            reaperService.resetBeatPositions(bpm);
            if (bpm !== null) {
              logger.log(`Reset beat positions for BPM calculation when starting playback from first setlist item with initial BPM: ${bpm}`);
            } else {
              logger.log('Reset beat positions for BPM calculation when starting playback from first setlist item');
            }
            
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