/**
 * BPM Utilities
 * Provides functions for BPM calculation and management
 */

const logger = require('./logger');

/**
 * BPM calculation class that maintains beat positions and calculates BPM
 */
class BpmCalculator {
  constructor() {
    // Store for recent beat positions and timestamps for BPM calculation
    this.beatPositions = [];
    this.initialBpm = null;
  }

  /**
   * Reset the beat positions array
   * This should be called when the region changes or when the tempo changes significantly
   * @param {number} [initialBpm=null] - Optional initial BPM to use (from !bpm marker)
   */
  resetBeatPositions(initialBpm = null) {
    const logContext = logger.startCollection('bpmUtils.resetBeatPositions');
    
    if (initialBpm !== null && initialBpm > 0) {
      logger.collect(logContext, `Resetting beat positions with initial BPM: ${initialBpm}`);
      this.initialBpm = initialBpm;
    } else {
      logger.collect(logContext, 'Resetting beat positions');
      this.initialBpm = null;
    }
    
    this.beatPositions = [];
    logger.flushLogs(logContext);
  }

  /**
   * Add a beat position for BPM calculation
   * @param {number} positionSeconds - Position in seconds
   * @param {number} beatPosition - Beat position
   * @returns {void}
   */
  addBeatPosition(positionSeconds, beatPosition) {
    const timestamp = Date.now();
    
    // Store the current beat position with timestamp
    this.beatPositions.push({
      positionSeconds,
      beatPosition,
      timestamp
    });
    
    // Keep only the latest 2 beat positions
    if (this.beatPositions.length > 2) {
      this.beatPositions = this.beatPositions.slice(-2);
    }
  }

  /**
   * Calculate BPM from stored beat positions
   * @param {number} [defaultBpm=120] - Default BPM to use if calculation fails
   * @returns {number} Calculated BPM
   */
  calculateBPM(defaultBpm = 120) {
    const logContext = logger.startCollection('bpmUtils.calculateBPM');
    
    try {
      // If we have at least 2 beat positions, calculate BPM based on the difference
      if (this.beatPositions.length >= 2) {
        // Get the oldest and newest beat positions
        const oldest = this.beatPositions[0];
        const newest = this.beatPositions[this.beatPositions.length - 1];
        
        // Calculate the difference in beat position and seconds
        const beatDiff = newest.beatPosition - oldest.beatPosition;
        const secondsDiff = newest.positionSeconds - oldest.positionSeconds;
        
        // Calculate BPM: (beats / seconds) * 60
        const bpm = (beatDiff / secondsDiff) * 60;
        
        // Round to 2 decimal places
        const roundedBpm = Math.round(bpm * 100) / 100;
        
        // Check if the calculated BPM is valid
        if (isNaN(roundedBpm) || !isFinite(roundedBpm) || roundedBpm > 999 || roundedBpm <= 0) {
          // If we have an initial BPM from a marker, use that
          if (this.initialBpm !== null && this.initialBpm > 0) {
            logger.collect(logContext, `Calculated BPM is invalid (${roundedBpm}), using initial BPM: ${this.initialBpm}`);
            logger.flushLogs(logContext);
            return this.initialBpm;
          }
          
          // Otherwise use default BPM
          logger.collect(logContext, `Calculated BPM is invalid (${roundedBpm}), using default BPM: ${defaultBpm}`);
          logger.flushLogs(logContext);
          return defaultBpm;
        }
        
        logger.collect(logContext, `Calculated BPM from ${this.beatPositions.length} beat positions: ${roundedBpm}`);
        logger.flushLogs(logContext);
        return roundedBpm;
      } 
      // If we only have one beat position
      else if (this.beatPositions.length === 1) {
        // If we have an initial BPM from a marker, use that
        if (this.initialBpm !== null && this.initialBpm > 0) {
          logger.collect(logContext, `Using initial BPM from marker: ${this.initialBpm}`);
          logger.flushLogs(logContext);
          return this.initialBpm;
        }
        
        // Otherwise calculate BPM using the traditional method
        const position = this.beatPositions[0];
        const bpm = (position.beatPosition / position.positionSeconds) * 60;
        const roundedBpm = Math.round(bpm * 100) / 100;
        
        // Check if the calculated BPM is valid
        if (isNaN(roundedBpm) || !isFinite(roundedBpm) || roundedBpm > 999 || roundedBpm <= 0) {
          logger.collect(logContext, `Calculated BPM from single beat position is invalid (${roundedBpm}), using default BPM: ${defaultBpm}`);
          logger.flushLogs(logContext);
          return defaultBpm;
        }
        
        logger.collect(logContext, `Calculated BPM from single beat position: ${roundedBpm}`);
        logger.flushLogs(logContext);
        return roundedBpm;
      }
      // No beat positions available
      else {
        // If we have an initial BPM from a marker, use that
        if (this.initialBpm !== null && this.initialBpm > 0) {
          logger.collect(logContext, `No beat positions available, using initial BPM: ${this.initialBpm}`);
          logger.flushLogs(logContext);
          return this.initialBpm;
        }
        
        // Otherwise use default BPM
        logger.collect(logContext, `No beat positions available, using default BPM: ${defaultBpm}`);
        logger.flushLogs(logContext);
        return defaultBpm;
      }
    } catch (error) {
      logger.collectError(logContext, 'Error calculating BPM:', error);
      
      // If we have an initial BPM from a marker, use that
      if (this.initialBpm !== null && this.initialBpm > 0) {
        return this.initialBpm;
      }
      
      // Return default BPM in case of error
      return defaultBpm;
    }
  }
}

/**
 * Extract BPM from a marker name
 * @param {string} name - Marker name
 * @returns {number|null} BPM value or null if not a BPM marker
 */
function extractBpmFromMarker(name) {
  const bpmMatch = name.match(/!bpm:(\d+(\.\d+)?)/);
  return bpmMatch ? parseFloat(bpmMatch[1]) : null;
}

/**
 * Get the BPM for a region if a !bpm marker is present
 * @param {Object} region - Region object
 * @param {Array} markers - Array of markers
 * @returns {number|null} - BPM value or null if no !bpm marker
 */
function getBpmForRegion(region, markers) {
  if (!region || !markers || markers.length === 0) return null;
  
  // Find markers that are within the region
  const regionMarkers = markers.filter(marker => 
    marker.position >= region.start && 
    marker.position <= region.end
  );
  
  // Check each marker for !bpm tag
  for (const marker of regionMarkers) {
    const bpm = extractBpmFromMarker(marker.name);
    if (bpm !== null) {
      return bpm;
    }
  }
  
  return null;
}

// Create and export a singleton instance of the BPM calculator
const bpmCalculator = new BpmCalculator();

module.exports = {
  bpmCalculator,
  extractBpmFromMarker,
  getBpmForRegion
};