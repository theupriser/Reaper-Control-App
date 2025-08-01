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
  }

  /**
   * Update the playback state from a transport response
   * @param {string} transportResponse - Raw transport response from Reaper
   * @param {Array} regions - Array of Region objects
   * @returns {boolean} True if the state changed
   */
  updateFromTransportResponse(transportResponse, regions) {
    const parts = transportResponse.split('\t');
    if (parts.length < 3) {
      return false;
    }

    const wasPlaying = this.isPlaying;
    const previousPosition = this.currentPosition;
    const previousRegionId = this.currentRegionId;

    // Update play state and position
    const playstate = parseInt(parts[1]);
    this.isPlaying = playstate === 1;
    this.currentPosition = parseFloat(parts[2]);

    // Find current region based on position
    this.currentRegionId = this.findCurrentRegionId(regions);

    // Return true if anything changed
    return (
      wasPlaying !== this.isPlaying ||
      previousPosition !== this.currentPosition ||
      previousRegionId !== this.currentRegionId
    );
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
      currentRegionId: this.currentRegionId
    };
  }
}

module.exports = PlaybackState;