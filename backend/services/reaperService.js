/**
 * Reaper Service
 * Handles communication with Reaper DAW through the Web adapter
 */

const { Web } = require('../adapters/reaper-web-adapter');
const logger = require('../utils/logger');

class ReaperService {
  constructor(config = {}) {
    this.host = config.host || process.env.REAPER_HOST || '127.0.0.1';
    this.webPort = config.webPort || parseInt(process.env.REAPER_WEB_PORT || '8080');
    
    // Initialize the Web adapter
    this.reaper = new Web({
      host: this.host,
      webPort: this.webPort
    });
    
    this.isConnected = false;
    
    // Store for recent beat positions and timestamps for BPM calculation
    // We'll keep only the latest 4 beat positions for more accurate BPM calculation
    this.beatPositions = [];
  }

  /**
   * Connect to Reaper
   * @returns {Promise} Resolves when connected
   */
  async connect() {
    try {
      await this.reaper.connect();
      this.isConnected = true;
      logger.log('Connected to Reaper');
      return true;
    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to connect to Reaper:', error);
      throw error;
    }
  }

  /**
   * Send a command to Reaper
   * @param {string} command - The command to send
   * @returns {Promise<string>} The response from Reaper
   */
  async sendCommand(command) {
    if (!this.isConnected) {
      try {
        await this.connect();
      } catch (error) {
        throw new Error(`Cannot send command, not connected to Reaper: ${error.message}`);
      }
    }

    try {
      return await this.reaper.send(command);
    } catch (error) {
      logger.error(`Error sending command to Reaper: ${command}`, error);
      throw error;
    }
  }

  /**
   * Get all regions from Reaper
   * @returns {Promise<string>} Raw region list response
   */
  async getRegions() {
    return this.sendCommand('/REGION');
  }

  /**
   * Get all markers from Reaper
   * @returns {Promise<string>} Raw marker list response
   */
  async getMarkers() {
    return this.sendCommand('/MARKER');
  }

  /**
   * Get transport state from Reaper
   * @returns {Promise<string>} Raw transport state response
   */
  async getTransportState() {
    return this.sendCommand('/TRANSPORT');
  }
  
  /**
   * Get beat position and time signature from Reaper
   * @returns {Promise<string>} Raw beat position response
   */
  async getBeatPosition() {
    return this.sendCommand('/BEATPOS');
  }
  
  /**
   * Get the current BPM from Reaper by calculating it from the BEATPOS response
   * Uses the latest 4 beat positions for more accurate BPM calculation
   * If initialBpm is set (from !bpm marker), it will be used until we have enough beat positions
   * @returns {Promise<number>} Current BPM
   */
  async getBPM() {
    try {
      // Get the beat position data from Reaper
      const beatPosResponse = await this.getBeatPosition();

      // Parse the response
      const parts = beatPosResponse.split('\t');

      // BEATPOS response format:
      // BEATPOS \t playstate \t position_seconds \t full_beat_position \t measure_cnt \t beats_in_measure \t ts_numerator \t ts_denominator
      if (parts.length >= 4 && parts[0] === 'BEATPOS') {
        // Extract position in seconds and beat position
        const positionSeconds = parseFloat(parts[2]);
        const beatPosition = parseFloat(parts[3]);
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

        // If we have at least 2 beat positions, calculate BPM based on the difference
        if (this.beatPositions.length >= 2) {
          // Get the oldest and newest beat positions
          const oldest = this.beatPositions[0];
          const newest = this.beatPositions[this.beatPositions.length - 1];

          // Calculate the difference in beat position and seconds
          const beatDiff = newest.beatPosition - oldest.beatPosition;
          const secondsDiff = newest.positionSeconds - oldest.positionSeconds;

          // Calculate BPM: (beats / seconds) * 60
          // This gives us the tempo in beats per minute
          const bpm = (beatDiff / secondsDiff) * 60;

          // Round to 2 decimal places for display purposes
          const roundedBpm = Math.round(bpm * 100) / 100;
          
          // Check if the calculated BPM is NaN, Infinity, -Infinity, or an extreme value
          if (isNaN(roundedBpm) || !isFinite(roundedBpm) || roundedBpm > 999 || roundedBpm <= 0) {
            // If we have an initial BPM from a marker, use that
            if (this.initialBpm !== null && this.initialBpm > 0) {
              logger.log(`Calculated BPM is invalid (${roundedBpm}), using initial BPM from marker: ${this.initialBpm}`);
              return this.initialBpm;
            }
            // Otherwise use default BPM of 120
            logger.log(`Calculated BPM is invalid (${roundedBpm}) and no marker BPM available, using default BPM: 120`);
            return 120;
          }

          logger.log(`Calculated BPM from ${this.beatPositions.length} beat positions: ${roundedBpm}`);
          return roundedBpm;
        } else {
          // If we only have one beat position, check if we have an initial BPM from a marker
          if (this.initialBpm !== null && this.initialBpm > 0) {
            logger.log(`Using initial BPM from marker: ${this.initialBpm}`);
            return this.initialBpm;
          }
        
          // Otherwise calculate BPM using the traditional method
          const bpm = (beatPosition / positionSeconds) * 60;
          const roundedBpm = Math.round(bpm * 100) / 100;
          
          // Check if the calculated BPM is NaN, Infinity, -Infinity, or an extreme value
          if (isNaN(roundedBpm) || !isFinite(roundedBpm) || roundedBpm > 999 || roundedBpm <= 0) {
            // If we have an initial BPM from a marker, use that
            if (this.initialBpm !== null && this.initialBpm > 0) {
              logger.log(`Calculated BPM from single beat position is invalid (${roundedBpm}), using initial BPM from marker: ${this.initialBpm}`);
              return this.initialBpm;
            }
            // Otherwise use default BPM of 120
            logger.log(`Calculated BPM from single beat position is invalid (${roundedBpm}) and no marker BPM available, using default BPM: 120`);
            return 120;
          }
        
          logger.log(`Calculated BPM from single beat position: ${roundedBpm}`);
          return roundedBpm;
        }
      } else {
        // Check if we have an initial BPM from a marker
        if (this.initialBpm !== null && this.initialBpm > 0) {
          logger.log(`Using initial BPM from marker (fallback): ${this.initialBpm}`);
          return this.initialBpm;
        }
      
        // Return 0 if we can't parse the response and have no initial BPM
        logger.warn('Could not parse BPM from BEATPOS response, returning 0');
        return 0;
      }
    } catch (error) {
      logger.error('Error calculating BPM from BEATPOS:', error);
    
      // Check if we have an initial BPM from a marker
      if (this.initialBpm !== null && this.initialBpm > 0) {
        logger.log(`Using initial BPM from marker (error fallback): ${this.initialBpm}`);
        return this.initialBpm;
      }
    
      // Return 0 in case of error and no initial BPM
      return 0;
    }
  }
  
  /**
   * Reset the beat positions array
   * This should be called when the region changes or when the tempo changes significantly
   * @param {number} [initialBpm=null] - Optional initial BPM to use (from !bpm marker)
   */
  resetBeatPositions(initialBpm = null) {
    if (initialBpm !== null && initialBpm > 0) {
      logger.log(`Resetting beat positions array with initial BPM: ${initialBpm}`);
      // Store the initial BPM for use in getBPM until we have enough beat positions
      this.initialBpm = initialBpm;
    } else {
      logger.log('Resetting beat positions array');
      this.initialBpm = null;
    }
    this.beatPositions = [];
  }
  
  /**
   * Get the current time signature from Reaper
   * @returns {Promise<{numerator: number, denominator: number}>} Time signature as an object
   */
  async getTimeSignature() {
    try {
      const beatPosResponse = await this.getBeatPosition();
      const parts = beatPosResponse.split('\t');
      
      // BEATPOS response format:
      // BEATPOS \t playstate \t position_seconds \t full_beat_position \t measure_cnt \t beats_in_measure \t ts_numerator \t ts_denominator
      if (parts.length >= 8 && parts[0] === 'BEATPOS') {
        const numerator = parseInt(parts[6]);
        const denominator = parseInt(parts[7]);
        
        return {
          numerator,
          denominator
        };
      } else {
        // Default to 4/4 if we can't parse the response
        logger.error('Could not parse time signature from BEATPOS response, defaulting to 4/4');
        return {
          numerator: 4,
          denominator: 4
        };
      }
    } catch (error) {
      logger.error('Error getting time signature:', error);
      // Default to 4/4 in case of error
      return {
        numerator: 4,
        denominator: 4
      };
    }
  }
  
  /**
   * Calculate the duration of a specified number of bars in seconds
   * based on the current time signature and BPM
   * @param {number} bars - Number of bars to calculate
   * @param {number} [defaultBpm=90] - Default BPM to use if not available from Reaper
   * @returns {Promise<number>} Duration in seconds
   */
  async calculateBarsToSeconds(bars, defaultBpm = 90) {
    try {
      // Get the current time signature
      const timeSignature = await this.getTimeSignature();
      
      // Get the current BPM from Reaper
      let bpm = await this.getBPM();
      
      // If BPM is 0 or invalid, use the default BPM
      if (!bpm || bpm <= 0) {
        logger.warn(`Invalid BPM (${bpm}), using default BPM: ${defaultBpm}`);
        bpm = defaultBpm;
      }
      
      // Calculate beats per bar based on time signature
      const beatsPerBar = timeSignature.numerator;
      
      // Calculate seconds per beat based on BPM
      // Formula: 60 seconds / BPM = duration of one beat in seconds
      const secondsPerBeat = 60 / bpm;
      
      // Calculate total seconds
      // Formula: bars * beats per bar * seconds per beat
      const totalSeconds = bars * beatsPerBar * secondsPerBeat;
      
      logger.log(`Calculated ${bars} bars at time signature ${timeSignature.numerator}/${timeSignature.denominator} and ${bpm} BPM: ${totalSeconds.toFixed(2)} seconds`);
      
      return totalSeconds;
    } catch (error) {
      logger.error('Error calculating bars to seconds:', error);
      
      // Default calculation assuming 4/4 time at default BPM
      // 4 beats per bar * (60 / BPM) seconds per beat * number of bars
      const defaultSeconds = 4 * (60 / defaultBpm) * bars;
      
      logger.error(`Using default calculation for ${bars} bars: ${defaultSeconds.toFixed(2)} seconds`);
      
      return defaultSeconds;
    }
  }

  /**
   * Toggle play/pause
   * @param {boolean} isPlaying - Current play state
   * @returns {Promise<void>}
   */
  async togglePlay(isPlaying) {
    if (isPlaying) {
      // If currently playing, send pause command (ID 1008)
      await this.sendCommand('/1008');
    } else {
      // If currently paused/stopped, send play command (ID 1007)
      await this.sendCommand('/1007');
    }
  }
  
  /**
   * Start playback with count-in
   * @returns {Promise<void>}
   */
  async playWithCountIn() {
    try {
      // Enable count-in (ID 40363)
      await this.sendCommand('/40363');
      
      // Start playback (ID 1007)
      await this.sendCommand('/1007');
      
      logger.log('Started playback with count-in');
    } catch (error) {
      logger.error('Error starting playback with count-in:', error);
      throw error;
    }
  }

  /**
   * Seek to a specific position
   * @param {number} position - Position in seconds
   * @returns {Promise<void>}
   */
  async seekToPosition(position) {
    await this.sendCommand(`/SET/POS/${position}`);
  }

  /**
   * Get project extended state
   * @param {string} section - The section name
   * @param {string} key - The key name
   * @returns {Promise<string>} The value or empty string if not found
   */
  async getProjectExtState(section, key) {
    if (!this.isConnected) {
      try {
        await this.connect();
      } catch (error) {
        throw new Error(`Cannot get project extended state, not connected to Reaper: ${error.message}`);
      }
    }

    try {
      return await this.reaper.getProjectExtState(section, key);
    } catch (error) {
      logger.error(`Error getting project extended state for ${section}/${key}:`, error);
      throw error;
    }
  }

  /**
   * Set project extended state
   * @param {string} section - The section name
   * @param {string} key - The key name
   * @param {string} value - The value to set
   * @returns {Promise<void>}
   */
  async setProjectExtState(section, key, value) {
    if (!this.isConnected) {
      try {
        await this.connect();
      } catch (error) {
        throw new Error(`Cannot set project extended state, not connected to Reaper: ${error.message}`);
      }
    }

    try {
      await this.reaper.setProjectExtState(section, key, value);
    } catch (error) {
      logger.error(`Error setting project extended state for ${section}/${key}:`, error);
      throw error;
    }
  }
}

// Create and export a singleton instance
const reaperService = new ReaperService();

module.exports = reaperService;