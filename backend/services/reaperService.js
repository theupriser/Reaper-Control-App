/**
 * Reaper Service
 * Handles communication with Reaper DAW through the Web adapter
 */

const { Web } = require('../adapters/reaper-web-adapter');
const baseService = require('./baseService');
const { bpmCalculator } = require('../utils/bpmUtils');

class ReaperService extends baseService {
  constructor(config = {}) {
    super('ReaperService');
    
    this.host = config.host || process.env.REAPER_HOST || '127.0.0.1';
    this.webPort = config.webPort || parseInt(process.env.REAPER_WEB_PORT || '8080');
    
    // Initialize the Web adapter
    this.reaper = new Web({
      host: this.host,
      webPort: this.webPort
    });
    
    this.isConnected = false;
  }

  /**
   * Connect to Reaper
   * @returns {Promise} Resolves when connected
   */
  async connect() {
    const context = this.startLogContext('connect');
    
    try {
      this.logWithContext(context, 'Connecting to Reaper...');
      await this.reaper.connect();
      this.isConnected = true;
      this.logWithContext(context, 'Connected to Reaper successfully');
      
      // Check if Reaper is playing and pause it if it is
      try {
        this.logWithContext(context, 'Checking playback state to ensure Reaper is not playing...');
        const transportState = await this.getTransportState();
        const parts = transportState.split('\t');
        
        if (parts.length >= 2) {
          const playstate = parseInt(parts[1]);
          if (playstate === 1) {
            this.logWithContext(context, 'Reaper is playing, pausing to prevent automatic playback');
            // Send pause command (ID 1008)
            await this.sendCommand('/1008');
            this.logWithContext(context, 'Successfully paused Reaper');
          } else {
            this.logWithContext(context, 'Reaper is not playing, no need to pause');
          }
        }
      } catch (stateError) {
        this.logErrorWithContext(context, 'Error checking playback state, continuing anyway', stateError);
      }
      
      this.flushLogs(context);
      return true;
    } catch (error) {
      this.isConnected = false;
      this.logErrorWithContext(context, 'Failed to connect to Reaper', error);
      throw error;
    }
  }

  /**
   * Send a command to Reaper
   * @param {string} command - The command to send
   * @returns {Promise<string>} The response from Reaper
   */
  async sendCommand(command) {
    const context = this.startLogContext('sendCommand');
    
    // Check connection and connect if needed
    if (!this.isConnected) {
      this.logWithContext(context, 'Not connected, attempting to connect...');
      try {
        await this.connect();
      } catch (error) {
        this.logErrorWithContext(context, `Cannot send command, connection failed`, error);
        throw new Error(`Cannot send command, not connected to Reaper: ${error.message}`);
      }
    }

    try {
      this.logWithContext(context, `Sending command: ${command}`);
      const response = await this.reaper.send(command);
      this.logWithContext(context, `Command successful: ${command}`);
      this.flushLogs(context);
      return response;
    } catch (error) {
      this.logErrorWithContext(context, `Error sending command: ${command}`, error);
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
   * Uses the bpmCalculator utility for consistent BPM calculation
   * @returns {Promise<number>} Current BPM
   */
  async getBPM() {
    const context = this.startLogContext('getBPM');
    
    try {
      // Get the beat position data from Reaper
      this.logWithContext(context, 'Getting beat position data from Reaper');
      const beatPosResponse = await this.getBeatPosition();

      // Parse the response
      const parts = beatPosResponse.split('\t');

      // BEATPOS response format:
      // BEATPOS \t playstate \t position_seconds \t full_beat_position \t measure_cnt \t beats_in_measure \t ts_numerator \t ts_denominator
      if (parts.length >= 4 && parts[0] === 'BEATPOS') {
        // Extract position in seconds and beat position
        const positionSeconds = parseFloat(parts[2]);
        const beatPosition = parseFloat(parts[3]);
        
        this.logWithContext(context, `Beat position data: position=${positionSeconds}s, beat=${beatPosition}`);
        
        // Add the beat position to the calculator
        bpmCalculator.addBeatPosition(positionSeconds, beatPosition);
        
        // Calculate BPM using the utility
        const bpm = bpmCalculator.calculateBPM(120); // Default to 120 BPM if calculation fails
        
        this.flushLogs(context);
        return bpm;
      } else {
        this.logWithContext(context, 'Invalid BEATPOS response format, using fallback BPM calculation');
        const bpm = bpmCalculator.calculateBPM(120);
        this.flushLogs(context);
        return bpm;
      }
    } catch (error) {
      this.logErrorWithContext(context, 'Error calculating BPM from BEATPOS', error);
      return bpmCalculator.calculateBPM(120);
    }
  }
  
  /**
   * Reset the beat positions array
   * This should be called when the region changes or when the tempo changes significantly
   * @param {number} [initialBpm=null] - Optional initial BPM to use (from !bpm marker)
   */
  resetBeatPositions(initialBpm = null) {
    const context = this.startLogContext('resetBeatPositions');
    
    this.logWithContext(context, initialBpm !== null && initialBpm > 0 
      ? `Resetting BPM calculation with initial BPM: ${initialBpm}` 
      : 'Resetting BPM calculation');
    
    // Use the bpmCalculator utility to reset beat positions
    bpmCalculator.resetBeatPositions(initialBpm);
    
    this.flushLogs(context);
  }
  
  /**
   * Get the current time signature from Reaper
   * @returns {Promise<{numerator: number, denominator: number}>} Time signature as an object
   */
  async getTimeSignature() {
    const context = this.startLogContext('getTimeSignature');
    
    try {
      this.logWithContext(context, 'Getting time signature from Reaper');
      const beatPosResponse = await this.getBeatPosition();
      const parts = beatPosResponse.split('\t');
      
      // BEATPOS response format:
      // BEATPOS \t playstate \t position_seconds \t full_beat_position \t measure_cnt \t beats_in_measure \t ts_numerator \t ts_denominator
      if (parts.length >= 8 && parts[0] === 'BEATPOS') {
        const numerator = parseInt(parts[6]);
        const denominator = parseInt(parts[7]);
        
        this.logWithContext(context, `Time signature: ${numerator}/${denominator}`);
        this.flushLogs(context);
        
        return {
          numerator,
          denominator
        };
      } else {
        // Default to 4/4 if we can't parse the response
        this.logWithContext(context, 'Could not parse time signature from BEATPOS response, defaulting to 4/4');
        this.flushLogs(context);
        
        return {
          numerator: 4,
          denominator: 4
        };
      }
    } catch (error) {
      this.logErrorWithContext(context, 'Error getting time signature', error);
      
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
    const context = this.startLogContext('calculateBarsToSeconds');
    
    try {
      this.logWithContext(context, `Calculating duration for ${bars} bars`);
      
      // Get the current time signature
      const timeSignature = await this.getTimeSignature();
      this.logWithContext(context, `Using time signature: ${timeSignature.numerator}/${timeSignature.denominator}`);
      
      // Get the current BPM from Reaper
      let bpm = await this.getBPM();
      
      // If BPM is 0 or invalid, use the default BPM
      if (!bpm || bpm <= 0) {
        this.logWithContext(context, `Invalid BPM (${bpm}), using default BPM: ${defaultBpm}`);
        bpm = defaultBpm;
      } else {
        this.logWithContext(context, `Using BPM: ${bpm}`);
      }
      
      // Calculate beats per bar based on time signature
      const beatsPerBar = timeSignature.numerator;
      
      // Calculate seconds per beat based on BPM
      // Formula: 60 seconds / BPM = duration of one beat in seconds
      const secondsPerBeat = 60 / bpm;
      
      // Calculate total seconds
      // Formula: bars * beats per bar * seconds per beat
      const totalSeconds = bars * beatsPerBar * secondsPerBeat;
      
      this.logWithContext(context, `Calculated ${bars} bars at ${timeSignature.numerator}/${timeSignature.denominator} and ${bpm} BPM: ${totalSeconds.toFixed(2)} seconds`);
      this.flushLogs(context);
      
      return totalSeconds;
    } catch (error) {
      this.logErrorWithContext(context, 'Error calculating bars to seconds', error);
      
      // Default calculation assuming 4/4 time at default BPM
      // 4 beats per bar * (60 / BPM) seconds per beat * number of bars
      const defaultSeconds = 4 * (60 / defaultBpm) * bars;
      
      this.logWithContext(context, `Using default calculation for ${bars} bars: ${defaultSeconds.toFixed(2)} seconds`);
      this.flushLogs(context);
      
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
    const context = this.startLogContext('playWithCountIn');
    
    try {
      this.logWithContext(context, 'Enabling count-in (ID 40363)');
      // Enable count-in (ID 40363)
      await this.sendCommand('/40363');
      
      this.logWithContext(context, 'Starting playback (ID 1007)');
      // Start playback (ID 1007)
      await this.sendCommand('/1007');
      
      this.logWithContext(context, 'Started playback with count-in successfully');
      this.flushLogs(context);
    } catch (error) {
      this.logErrorWithContext(context, 'Error starting playback with count-in', error);
      throw error;
    }
  }

  /**
   * Seek to a specific position
   * @param {number} position - Position in seconds
   * @returns {Promise<void>}
   */
  async seekToPosition(position) {
    const context = this.startLogContext('seekToPosition');
    
    try {
      this.logWithContext(context, `Seeking to position: ${position} seconds`);
      await this.sendCommand(`/SET/POS/${position}`);
      this.logWithContext(context, `Successfully seeked to position: ${position} seconds`);
      this.flushLogs(context);
    } catch (error) {
      this.logErrorWithContext(context, `Error seeking to position: ${position}`, error);
      throw error;
    }
  }

  /**
   * Get project extended state
   * @param {string} section - The section name
   * @param {string} key - The key name
   * @returns {Promise<string>} The value or empty string if not found
   */
  async getProjectExtState(section, key) {
    const context = this.startLogContext('getProjectExtState');
    
    // Check connection and connect if needed
    if (!this.isConnected) {
      this.logWithContext(context, 'Not connected, attempting to connect...');
      try {
        await this.connect();
      } catch (error) {
        this.logErrorWithContext(context, 'Connection failed', error);
        throw new Error(`Cannot get project extended state, not connected to Reaper: ${error.message}`);
      }
    }

    try {
      this.logWithContext(context, `Getting project extended state for ${section}/${key}`);
      const result = await this.reaper.getProjectExtState(section, key);
      this.logWithContext(context, `Successfully got project extended state for ${section}/${key}`);
      this.flushLogs(context);
      return result;
    } catch (error) {
      this.logErrorWithContext(context, `Error getting project extended state for ${section}/${key}`, error);
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
    const context = this.startLogContext('setProjectExtState');
    
    // Check connection and connect if needed
    if (!this.isConnected) {
      this.logWithContext(context, 'Not connected, attempting to connect...');
      try {
        await this.connect();
      } catch (error) {
        this.logErrorWithContext(context, 'Connection failed', error);
        throw new Error(`Cannot set project extended state, not connected to Reaper: ${error.message}`);
      }
    }

    try {
      this.logWithContext(context, `Setting project extended state for ${section}/${key}`);
      await this.reaper.setProjectExtState(section, key, value);
      this.logWithContext(context, `Successfully set project extended state for ${section}/${key}`);
      this.flushLogs(context);
    } catch (error) {
      this.logErrorWithContext(context, `Error setting project extended state for ${section}/${key}`, error);
      throw error;
    }
  }
}

// Create and export a singleton instance
const reaperService = new ReaperService();

module.exports = reaperService;