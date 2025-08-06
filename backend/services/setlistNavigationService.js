/**
 * Setlist Navigation Service
 * Handles navigation within setlists and provides shared logic for MIDI and Socket services
 */

const baseService = require('./baseService');
const regionService = require('./regionService');
const setlistService = require('./setlistService');
const reaperService = require('./reaperService');
const markerService = require('./markerService');
const { getBpmForRegion, extractBpmFromMarker } = require('../utils/bpmUtils');

class SetlistNavigationService extends baseService {
  constructor() {
    super('SetlistNavigationService');
    
    this.endOfRegionPollingInterval = null;
    this.isTransitioning = false;
    this.enableLogging = process.env.SETLIST_NAVIGATION_SERVICE_LOG === 'true';
    
    // Store original methods
    this._originalStartLogContext = this.startLogContext;
    this._originalLogWithContext = this.logWithContext;
    this._originalLog = this.log;
    this._originalLogErrorWithContext = this.logErrorWithContext;
    
    /**
     * Override startLogContext to check if logging is enabled
     * @param {string} operation - The operation name
     * @returns {string} The log context or null if logging is disabled
     */
    this.startLogContext = (operation) => {
      if (!this.enableLogging && process.env.NODE_ENV !== 'production') {
        return null;
      }
      return this._originalStartLogContext(operation);
    };
    
    /**
     * Override logWithContext to check if logging is enabled
     * @param {string} context - The log context
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    this.logWithContext = (context, message, ...args) => {
      if (!context || !this.enableLogging) {
        return;
      }
      this._originalLogWithContext(context, message, ...args);
    };
    
    /**
     * Override log to check if logging is enabled
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    this.log = (message, ...args) => {
      if (!this.enableLogging) {
        return;
      }
      this._originalLog(message, ...args);
    };
    
    /**
     * Override logErrorWithContext to always log errors but respect context
     * @param {string} context - The log context
     * @param {string} message - The error message
     * @param {Error} error - The error object
     */
    this.logErrorWithContext = (context, message, error) => {
      if (!context) {
        // If context is null due to disabled logging, log the error directly
        this.logError(message, error);
        return;
      }
      this._originalLogErrorWithContext(context, message, error);
    };
    
    // Set up event listener for playback state updates
    regionService.on('playbackStateUpdated', (playbackState) => {
      this.handlePlaybackStateUpdate(playbackState);
    });

    this.startEndOfRegionPolling();
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
    const context = this.startLogContext('checkEndOfRegion');
    
    try {
      if (!playbackState.currentRegionId) {
        this.logWithContext(context, 'No current region ID, skipping check');
        this.flushLogs(context);
        return;
      }

      const currentPosition = playbackState.currentPosition;
      const currentRegion = regionService.findRegionById(playbackState.currentRegionId);

      if (!currentRegion) {
        this.logWithContext(context, 'Current region not found, skipping check');
        this.flushLogs(context);
        return;
      }
      
      if (this.isTransitioning) {
        this.logWithContext(context, 'Already transitioning, skipping check');
        this.flushLogs(context);
        return;
      }

      // Check if we're within 0.6 seconds of the end of the region
      // or if we've just passed the end (within 0.1 seconds past)
      const timeToEnd = currentRegion.end - currentPosition;
      this.logWithContext(context, `Current position: ${currentPosition.toFixed(2)}s, Region end: ${currentRegion.end.toFixed(2)}s, Time to end: ${timeToEnd.toFixed(2)}s`);
      
      if ((timeToEnd > 0 && timeToEnd < 0.6) || (timeToEnd >= -0.1 && timeToEnd <= 0)) {
        this.logWithContext(context, 'Approaching end of region, initiating transition');
        this.isTransitioning = true;

        try {
          const nextSetlistItem = await this.getNextSetlistItem(playbackState.selectedSetlistId);
          if (nextSetlistItem) {
            this.logWithContext(context, `Found next setlist item: ${nextSetlistItem.name || nextSetlistItem.regionId}`);
            const region = regionService.findRegionById(nextSetlistItem.regionId);
            if (region) {
              this.logWithContext(context, `Found next region: ${region.name}`);
              
              // Check if the region has a !bpm marker
              const bpm = this._getBpmForRegion(region);
              
              // Reset BPM when automatically transitioning to the next song
              this.logWithContext(context, 'Resetting BPM calculation for next region');
              reaperService.resetBeatPositions(bpm);
              
              this.logWithContext(context, 'Seeking to next region and playing');
              await this.seekToRegionAndPlay(region, true);
            } else {
              this.logWithContext(context, 'Next region not found');
            }
          } else {
            this.logWithContext(context, 'No next setlist item found');
          }
        } finally {
          this.isTransitioning = false;
          this.logWithContext(context, 'Transition completed');
        }
      }
      
      this.flushLogs(context);
    } catch (error) {
      this.isTransitioning = false;
      this.logErrorWithContext(context, 'Error checking end of region', error);
    }
  }

  /**
   * Handle playback state updates to detect when a song ends
   * @param {PlaybackState} playbackState - Current playback state
   */
  async handlePlaybackStateUpdate(playbackState) {
    const context = this.startLogContext('handlePlaybackStateUpdate');
    
    try {
      if (!playbackState.selectedSetlistId) {
        this.logWithContext(context, 'No setlist selected, skipping update');
        this.flushLogs(context);
        return;
      }

      const currentPosition = playbackState.currentPosition;
      let isAtEndOfRegion = false;
      let currentRegion = null;

      if (playbackState.currentRegionId) {
        currentRegion = regionService.findRegionById(playbackState.currentRegionId);
        this.logWithContext(context, `Current region: ${currentRegion ? currentRegion.name : 'not found'}`);
      }

      // Case 1: Not playing and not in any region
      if (!playbackState.isPlaying && playbackState.currentRegionId === null) {
        this.logWithContext(context, 'Not playing and not in any region, considering end of region');
        isAtEndOfRegion = true;
      }
      // Case 2: Not playing and at the end of the current region
      else if (!playbackState.isPlaying && currentRegion) {
        const distanceToEnd = Math.abs(currentPosition - currentRegion.end);
        this.logWithContext(context, `Not playing, distance to end: ${distanceToEnd.toFixed(3)}s`);
        
        if (distanceToEnd < 0.05) {
          this.logWithContext(context, 'At end of region, considering end of region');
          isAtEndOfRegion = true;
        }
      }

      if (isAtEndOfRegion) {
        this.logWithContext(context, 'End of region detected, looking for next setlist item');
        const nextSetlistItem = await this.getNextSetlistItem(playbackState.selectedSetlistId);
        if (nextSetlistItem) {
          this.logWithContext(context, `Found next setlist item: ${nextSetlistItem.name || nextSetlistItem.regionId}`);
          const region = regionService.findRegionById(nextSetlistItem.regionId);
          if (region) {
            this.logWithContext(context, `Found next region: ${region.name}`);
            
            // Check if the region has a !bpm marker
            const bpm = this._getBpmForRegion(region);
            
            // Reset BPM when automatically transitioning to the next song
            this.logWithContext(context, 'Resetting BPM calculation for next region');
            reaperService.resetBeatPositions(bpm);
            
            this.logWithContext(context, 'Seeking to next region and playing');
            await this.seekToRegionAndPlay(region, true);
          } else {
            this.logWithContext(context, 'Next region not found');
          }
        } else {
          this.logWithContext(context, 'No next setlist item found');
        }
      }
      
      this.flushLogs(context);
    } catch (error) {
      this.logErrorWithContext(context, 'Error handling playback state update', error);
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
   * Get the BPM for a region if a !bpm marker is present
   * Uses the imported getBpmForRegion utility function
   * @param {Object} region - Region object
   * @returns {number|null} - BPM value or null if no !bpm marker
   * @private
   */
  _getBpmForRegion(region) {
    const context = this.startLogContext('_getBpmForRegion');
    
    if (!region) {
      this.logWithContext(context, 'No region provided, returning null');
      this.flushLogs(context);
      return null;
    }
    
    // Get all markers
    const markers = markerService.getMarkers();
    if (!markers || markers.length === 0) {
      this.logWithContext(context, 'No markers available, returning null');
      this.flushLogs(context);
      return null;
    }
    
    // Use the utility function to get BPM for the region
    const bpm = getBpmForRegion(region, markers);
    
    if (bpm !== null) {
      this.logWithContext(context, `Found !bpm marker in region ${region.name} with BPM: ${bpm}`);
    } else {
      this.logWithContext(context, `No !bpm marker found in region ${region.name}`);
    }
    
    this.flushLogs(context);
    return bpm;
  }

  /**
   * Seek to a region and optionally start playback
   * @param {Region} region - Region to seek to
   * @param {boolean} autoplay - Whether to start playback after seeking (defaults to current autoplay setting)
   * @param {boolean} countIn - Whether to use count-in before playback (defaults to current countIn setting)
   * @returns {Promise<boolean>} True if successful
   */
  async seekToRegionAndPlay(region, autoplay = null, countIn = null) {
    const context = this.startLogContext('seekToRegionAndPlay');
    
    try {
      this.logWithContext(context, `Seeking to region: ${region.name} (${region.start.toFixed(2)}s - ${region.end.toFixed(2)}s)`);
      
      // Get current playback state and settings
      const playbackState = regionService.getPlaybackState();
      const isPlaying = playbackState.isPlaying;
      const isAutoplayEnabled = autoplay !== null ? autoplay : playbackState.autoplayEnabled;
      const isCountInEnabled = countIn !== null ? countIn : playbackState.countInEnabled;
      
      this.logWithContext(context, `Current state: playing=${isPlaying}, autoplay=${isAutoplayEnabled}, countIn=${isCountInEnabled}`);
      
      // Check if the region has a !bpm marker
      const bpm = this._getBpmForRegion(region);
      
      // Reset BPM when changing to a new region/song, passing the BPM from marker if available
      this.logWithContext(context, `Resetting BPM calculation for region: ${region.name}`);
      reaperService.resetBeatPositions(bpm);
      
      // If currently playing, pause first
      if (isPlaying) {
        this.logWithContext(context, 'Currently playing, pausing first');
        await reaperService.togglePlay(true); // Pause
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      let positionToSeek;
      
      // If count-in is enabled, position the cursor 2 bars before the marker
      if (isCountInEnabled) {
        try {
          this.logWithContext(context, 'Count-in enabled, calculating position 2 bars before region start');
          
          // Get the duration of 2 bars in seconds based on the current time signature
          const countInDuration = await reaperService.calculateBarsToSeconds(2);
          
          // Calculate position 2 bars before region start
          // Ensure we don't go before the start of the project (negative time)
          positionToSeek = Math.max(0, region.start - countInDuration);
          this.logWithContext(context, `Positioning cursor 2 bars (${countInDuration.toFixed(2)}s) before region at ${positionToSeek.toFixed(2)}s`);
        } catch (error) {
          // Fallback to default calculation if there's an error
          this.logErrorWithContext(context, 'Error calculating count-in position, using default', error);
          positionToSeek = Math.max(0, region.start - 4); // Default to 4 seconds (2 bars at 4/4 and 120 BPM)
          this.logWithContext(context, `Using fallback: positioning cursor 2 bars (4s) before region at ${positionToSeek.toFixed(2)}s`);
        }
      } else {
        // Add a small offset to ensure position is clearly within the region
        positionToSeek = region.start + 0.001;
        this.logWithContext(context, `Count-in disabled, positioning cursor at region start: ${positionToSeek.toFixed(3)}s`);
      }
      
      // Send the seek command
      this.logWithContext(context, `Seeking to position: ${positionToSeek.toFixed(3)}s`);
      await reaperService.seekToPosition(positionToSeek);

      // If was playing and autoplay is enabled, resume playback
      if ((isPlaying || autoplay === true) && isAutoplayEnabled) {
        this.logWithContext(context, 'Autoplay enabled, resuming playback after short delay');
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // If count-in is enabled, use playWithCountIn, otherwise use normal togglePlay
        if (isCountInEnabled) {
          this.logWithContext(context, 'Using count-in for playback');
          await reaperService.playWithCountIn();
        } else {
          this.logWithContext(context, 'Resuming playback without count-in');
          await reaperService.togglePlay(false); // Resume without count-in
        }
      } else {
        this.logWithContext(context, 'Autoplay disabled, not resuming playback');
      }

      // Restart the polling mechanism
      this.logWithContext(context, 'Restarting polling mechanism');
      this.restartPolling();
      
      this.logWithContext(context, 'Successfully seeked to region and configured playback');
      this.flushLogs(context);
      return true;
    } catch (error) {
      this.logErrorWithContext(context, 'Error seeking to region and playing', error);
      this.isTransitioning = false;
      return false;
    }
  }

  /**
   * Handle toggle play with setlist awareness
   * @returns {Promise<boolean>} True if successful
   */
  async handleTogglePlay() {
    const context = this.startLogContext('handleTogglePlay');
    
    try {
      const playbackState = regionService.getPlaybackState();
      this.logWithContext(context, `Current state: playing=${playbackState.isPlaying}, currentRegionId=${playbackState.currentRegionId}, selectedSetlistId=${playbackState.selectedSetlistId}`);
      
      // If not in a region and a setlist is selected, start from the first item
      if (!playbackState.currentRegionId && playbackState.selectedSetlistId) {
        this.logWithContext(context, 'Not in a region and setlist is selected, checking for first item');
        
        const setlist = setlistService.getSetlist(playbackState.selectedSetlistId);
        if (setlist && setlist.items.length > 0) {
          this.logWithContext(context, `Found setlist with ${setlist.items.length} items`);
          
          const firstItem = setlist.items[0];
          this.logWithContext(context, `First item: ${firstItem.name || firstItem.regionId}`);
          
          const region = regionService.findRegionById(firstItem.regionId);
          if (region) {
            this.logWithContext(context, `Found region: ${region.name}`);
            
            // Check if the region has a !bpm marker
            const bpm = this._getBpmForRegion(region);
            
            // Reset BPM when starting playback from the first item in a setlist
            this.logWithContext(context, 'Resetting BPM calculation for first setlist item');
            reaperService.resetBeatPositions(bpm);
            
            this.logWithContext(context, 'Seeking to first region and playing');
            await this.seekToRegionAndPlay(region, true);
            
            this.flushLogs(context);
            return true;
          } else {
            this.logWithContext(context, 'Region not found for first item');
          }
        } else {
          this.logWithContext(context, 'No setlist found or setlist is empty');
        }
      }
      
      // Otherwise, just toggle play normally
      this.logWithContext(context, `Toggling play normally (current state: ${playbackState.isPlaying ? 'playing' : 'stopped'})`);
      await reaperService.togglePlay(playbackState.isPlaying);
      
      this.logWithContext(context, 'Successfully toggled play state');
      this.flushLogs(context);
      return true;
    } catch (error) {
      this.logErrorWithContext(context, 'Error handling toggle play', error);
      return false;
    }
  }
}

// Create and export a singleton instance
const setlistNavigationService = new SetlistNavigationService();
module.exports = setlistNavigationService;