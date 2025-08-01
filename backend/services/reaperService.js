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
   * Get transport state from Reaper
   * @returns {Promise<string>} Raw transport state response
   */
  async getTransportState() {
    return this.sendCommand('/TRANSPORT');
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
   * Seek to a specific position
   * @param {number} position - Position in seconds
   * @returns {Promise<void>}
   */
  async seekToPosition(position) {
    await this.sendCommand(`/SET/POS/${position}`);
  }
}

// Create and export a singleton instance
const reaperService = new ReaperService();

module.exports = reaperService;