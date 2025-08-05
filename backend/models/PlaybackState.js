/**
 * PlaybackState Model
 * Represents the current playback state of Reaper
 */

class PlaybackState {
  /**
   * Create a new PlaybackState
   * @param {Object} data - Playback state data
   * @param {boolean} data.isPlaying - Whether playback is active
   * @param {number} data.currentPosition - Current position in seconds
   * @param {number|null} data.currentRegionId - ID of the current region (if any)
   */
  constructor(data = {}) {
    this.isPlaying = data.isPlaying || false;
    this.currentPosition = data.currentPosition || 0;
    this.currentRegionId = data.currentRegionId || null;
    this.autoplayEnabled = data.autoplayEnabled !== undefined ? data.autoplayEnabled : true;
    this.countInEnabled = data.countInEnabled !== undefined ? data.countInEnabled : false;
    this.selectedSetlistId = data.selectedSetlistId || null;
    this.bpm = data.bpm || 120; // Default to 120 BPM if not provided
    this.timeSignature = {
      numerator: data.timeSignature?.numerator || 4,
      denominator: data.timeSignature?.denominator || 4
    }; // Default to 4/4 if not provided
  }

  /**
   * Update the playback state from a transport response
   * @param {string} transportResponse - Raw transport response from Reaper
   * @param {Array} regions - Array of Region objects
   * @returns {Promise<boolean>} True if the state changed
   */
  async updateFromTransportResponse(transportResponse, regions) {
    const logger = require('../utils/logger');
    const reaperService = require('../services/reaperService');
    let logContext = null;
    
    // Only collect logs if PLAYBACK_STATE_LOG is enabled
    if (process.env.PLAYBACK_STATE_LOG === 'true') {
      logContext = logger.startCollection('PlaybackState-update');
      logger.collect(logContext, 'Updating playback state from transport response');
      logger.collect(logContext, 'Raw transport response:', transportResponse);
    }
    
    const parts = transportResponse.split('\t');
    if (logContext) {
      logger.collect(logContext, 'Split response parts:', parts);
    }
    
    if (parts.length < 3) {
      if (logContext) {
        logger.collect(logContext, 'Invalid transport response: not enough parts');
        logger.flushLogs(logContext);
      }
      return false;
    }

    const wasPlaying = this.isPlaying;
    const previousPosition = this.currentPosition;
    const previousRegionId = this.currentRegionId;
    const previousBpm = this.bpm;
    
    if (logContext) {
      logger.collect(logContext, 'Previous state:', 
        `isPlaying=${wasPlaying}, position=${previousPosition}, regionId=${previousRegionId}, bpm=${previousBpm}`);
    }

    // Update play state and position
    const playstate = parseInt(parts[1]);
    if (logContext) {
      logger.collect(logContext, 'Parsed playstate:', playstate);
    }
    
    this.isPlaying = playstate === 1;
    this.currentPosition = parseFloat(parts[2]);
    
    // Only update BPM and time signature when Reaper is playing
    if (this.isPlaying) {
      // Get current BPM from Reaper
      try {
        this.bpm = await reaperService.getBPM();
        if (logContext) {
          logger.collect(logContext, 'Updated BPM:', this.bpm);
        }
        
        // Get current time signature from Reaper
        const timeSignature = await reaperService.getTimeSignature();
        this.timeSignature = timeSignature;
        if (logContext) {
          logger.collect(logContext, 'Updated time signature:', `${this.timeSignature.numerator}/${this.timeSignature.denominator}`);
        }
      } catch (error) {
        logger.error('Error getting BPM or time signature:', error);
        // Keep the previous values if there's an error
      }
    } else if (logContext) {
      logger.collect(logContext, 'Skipping BPM and time signature update because Reaper is not playing');
    }
    
    if (logContext) {
      logger.collect(logContext, 'Updated state (before region check):', 
        `isPlaying=${this.isPlaying}, position=${this.currentPosition}, bpm=${this.bpm}`);
    }

    // Find current region based on position
    this.currentRegionId = this.findCurrentRegionId(regions);
    
    // Check if region has changed and reset beat positions if it has
    if (previousRegionId !== this.currentRegionId) {
      if (logContext) {
        logger.collect(logContext, 'Region changed, resetting beat positions');
      }
      // Reset beat positions when region changes to ensure accurate BPM calculation
      reaperService.resetBeatPositions();
    }
    
    if (logContext) {
      logger.collect(logContext, 'Final updated state:', 
        `isPlaying=${this.isPlaying}, position=${this.currentPosition}, regionId=${this.currentRegionId}, bpm=${this.bpm}`);
    }

    // Check if anything changed
    const changed = (
      wasPlaying !== this.isPlaying ||
      previousPosition !== this.currentPosition ||
      previousRegionId !== this.currentRegionId ||
      previousBpm !== this.bpm
    );
    
    if (logContext) {
      logger.collect(logContext, 'State changed:', changed);
      logger.flushLogs(logContext);
    }
    
    // Return true if anything changed
    return changed;
  }

  /**
   * Find the current region ID based on position
   * @param {Array} regions - Array of Region objects
   * @returns {number|null} Region ID or null if not in a region
   */
  findCurrentRegionId(regions) {
    if (!regions || regions.length === 0) {
      return null;
    }

    // First check if there's a region that starts exactly at this position
    const regionStartingHere = regions.find(
      region => this.currentPosition === region.start
    );
    
    if (regionStartingHere) {
      return regionStartingHere.id;
    }

    // Check if the position is at the end of a region and the start of another
    // This handles the case where regions are adjacent (end of one = start of another)
    const regionEndingHere = regions.find(
      region => this.currentPosition === region.end
    );
    
    // If we're at the end of a region, check if there's another region starting at this position
    // If not, we're still in the current region
    if (regionEndingHere) {
      // We already checked for regions starting here above and didn't find any,
      // so we're at the end of a region with no new region starting
      return regionEndingHere.id;
    }

    // Otherwise find any region that contains this position
    const currentRegion = regions.find(
      region => region.containsPosition(this.currentPosition)
    );

    return currentRegion ? currentRegion.id : null;
  }

  /**
   * Convert to a plain object for serialization
   * @returns {Object} Plain object representation
   */
  toJSON() {
    return {
      isPlaying: this.isPlaying,
      currentPosition: this.currentPosition,
      currentRegionId: this.currentRegionId,
      autoplayEnabled: this.autoplayEnabled,
      countInEnabled: this.countInEnabled,
      selectedSetlistId: this.selectedSetlistId,
      bpm: this.bpm,
      timeSignature: this.timeSignature
    };
  }
}

module.exports = PlaybackState;