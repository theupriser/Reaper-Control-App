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
    this.enableLogging = process.env.BPM_UTILS_LOG === 'true';
    this.serviceName = 'BpmUtils';
  }
  
  /**
   * Log a message if logging is enabled
   * @param {string} message - The message to log
   * @param {...any} args - Additional arguments to log
   */
  log(message, ...args) {
    if (!this.enableLogging) {
      return;
    }
    logger.log(`[${this.serviceName}] ${message}`, ...args);
  }
  
  /**
   * Log an error (always logs regardless of enableLogging)
   * @param {string} message - The error message
   * @param {Error} error - The error object
   */
  logError(message, error) {
    logger.error(`[${this.serviceName}] ${message}`, error);
  }
  
  /**
   * Start a log collection context if logging is enabled
   * @param {string} operation - The operation name
   * @returns {string} The log context or null if logging is disabled
   */
  startLogContext(operation) {
    if (!this.enableLogging && process.env.NODE_ENV !== 'production') {
      return null;
    }
    return logger.startCollection(`${this.serviceName}.${operation}`);
  }
  
  /**
   * Log a message within a context if logging is enabled
   * @param {string} context - The log context
   * @param {string} message - The message to log
   * @param {...any} args - Additional arguments to log
   */
  logWithContext(context, message, ...args) {
    if (!context || !this.enableLogging) {
      return;
    }
    logger.collect(context, message, ...args);
  }
  
  /**
   * Log an error within a context (always logs errors)
   * @param {string} context - The log context
   * @param {string} message - The error message
   * @param {Error} error - The error object
   */
  logErrorWithContext(context, message, error) {
    if (!context) {
      // If context is null due to disabled logging, log the error directly
      this.logError(message, error);
      return;
    }
    logger.collectError(context, message, error);
  }
  
  /**
   * Flush logs for a context
   * @param {string} context - The log context
   */
  flushLogs(context) {
    if (context) {
      logger.flushLogs(context);
    }
  }

  /**
   * Reset the beat positions array
   * This should be called when the region changes or when the tempo changes significantly
   * @param {number} [initialBpm=null] - Optional initial BPM to use (from !bpm marker)
   */
  resetBeatPositions(initialBpm = null) {
    const logContext = this.startLogContext('resetBeatPositions');
    
    if (initialBpm !== null && initialBpm > 0) {
      this.logWithContext(logContext, `Resetting beat positions with initial BPM: ${initialBpm}`);
    } else {
      this.logWithContext(logContext, 'Resetting beat positions');
    }
    
    if (initialBpm !== null && initialBpm > 0) {
      this.initialBpm = initialBpm;
    } else {
      this.initialBpm = null;
    }
    
    this.beatPositions = [];
    
    this.flushLogs(logContext);
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
    const logContext = this.startLogContext('calculateBPM');
    
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
            this.logWithContext(logContext, `Calculated BPM is invalid (${roundedBpm}), using initial BPM: ${this.initialBpm}`);
            this.flushLogs(logContext);
            return this.initialBpm;
          }
          
          // Otherwise use default BPM
          this.logWithContext(logContext, `Calculated BPM is invalid (${roundedBpm}), using default BPM: ${defaultBpm}`);
          this.flushLogs(logContext);
          return defaultBpm;
        }
        
        this.logWithContext(logContext, `Calculated BPM from ${this.beatPositions.length} beat positions: ${roundedBpm}`);
        this.flushLogs(logContext);
        return roundedBpm;
      } 
      // If we only have one beat position
      else if (this.beatPositions.length === 1) {
        // If we have an initial BPM from a marker, use that
        if (this.initialBpm !== null && this.initialBpm > 0) {
          this.logWithContext(logContext, `Using initial BPM from marker: ${this.initialBpm}`);
          this.flushLogs(logContext);
          return this.initialBpm;
        }
        
        // Otherwise calculate BPM using the traditional method
        const position = this.beatPositions[0];
        const bpm = (position.beatPosition / position.positionSeconds) * 60;
        const roundedBpm = Math.round(bpm * 100) / 100;
        
        // Check if the calculated BPM is valid
        if (isNaN(roundedBpm) || !isFinite(roundedBpm) || roundedBpm > 999 || roundedBpm <= 0) {
          this.logWithContext(logContext, `Calculated BPM from single beat position is invalid (${roundedBpm}), using default BPM: ${defaultBpm}`);
          this.flushLogs(logContext);
          return defaultBpm;
        }
        
        this.logWithContext(logContext, `Calculated BPM from single beat position: ${roundedBpm}`);
        this.flushLogs(logContext);
        return roundedBpm;
      }
      // No beat positions available
      else {
        // If we have an initial BPM from a marker, use that
        if (this.initialBpm !== null && this.initialBpm > 0) {
          this.logWithContext(logContext, `No beat positions available, using initial BPM: ${this.initialBpm}`);
          this.flushLogs(logContext);
          return this.initialBpm;
        }
        
        // Otherwise use default BPM
        this.logWithContext(logContext, `No beat positions available, using default BPM: ${defaultBpm}`);
        this.flushLogs(logContext);
        return defaultBpm;
      }
    } catch (error) {
      this.logErrorWithContext(logContext, 'Error calculating BPM:', error);
      
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