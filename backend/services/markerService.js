/**
 * Marker Service
 * Handles fetching, parsing, and managing markers from Reaper
 */

const logger = require('../utils/logger');
const reaperService = require('./reaperService');
const Marker = require('../models/Marker');

class MarkerService {
  constructor() {
    this.markers = [];
    this.eventListeners = {
      markersUpdated: [],
      error: []
    };
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
   * Fetch all markers from Reaper
   * @returns {Promise<Array>} Array of Marker objects
   */
  async fetchMarkers() {
    const logContext = logger.startCollection('fetchMarkers');
    
    try {
      logger.collect(logContext, 'Fetching markers from Reaper...');
      
      // Get all markers using the MARKER command
      const markerList = await reaperService.getMarkers();
      
      logger.collect(logContext, 'Received marker list from Reaper');
      
      if (markerList && markerList.length > 0) {
        logger.collect(logContext, 'Marker list has content, length:', markerList.length);
        
        // Parse the marker list response
        this.markers = this.parseMarkerList(markerList);
        
        logger.collect(logContext, `Parsed ${this.markers.length} markers successfully`);
        
        // Emit markers updated event
        this.emitEvent('markersUpdated', this.markers);
        
        logger.collect(logContext, `Emitted ${this.markers.length} markers to listeners`);
      } else {
        logger.collect(logContext, 'Marker list is empty or invalid');
        
        // Clear markers and emit empty array
        this.markers = [];
        this.emitEvent('markersUpdated', []);
      }
      
      // Flush all collected logs
      logger.flushLogs(logContext);
      
      return this.markers;
    } catch (error) {
      // Use collectError to ensure errors are always logged
      logger.collectError(logContext, 'Error fetching markers:', error);
      
      // Emit error status
      this.emitEvent('error', {
        type: 'error',
        message: 'Error fetching markers from Reaper',
        details: error.message
      });
      
      throw error;
    }
  }

  /**
   * Parse marker list response from Reaper
   * @param {string} response - Raw marker list response
   * @returns {Array} Array of Marker objects
   */
  parseMarkerList(response) {
    const logContext = logger.startCollection('parseMarkerList');
    
    logger.collect(logContext, 'Parsing marker list response...');
    logger.collect(logContext, 'Raw response length:', response ? response.length : 0);
    
    const parsedMarkers = [];
    
    // Skip the first line (MARKER_LIST) and last line (MARKER_LIST_END)
    const lines = response.split('\n').filter(line => 
      line !== 'MARKER_LIST' && line !== 'MARKER_LIST_END' && line.trim() !== '');
    
    logger.collect(logContext, 'Filtered lines count:', lines.length);
    
    // Track statistics
    let validMarkerCount = 0;
    let invalidLineCount = 0;
    let insufficientPartsCount = 0;
    
    for (const line of lines) {
      if (line.startsWith('MARKER')) {
        const parts = line.split('\t');

        if (parts.length >= 4) {
          const markerData = {
            id: parseInt(parts[2]),
            name: parts[1],
            position: parseFloat(parts[3]),
            color: parts[4] ? parts[4] : '#FF0000' // Default to red if no color specified
          };
          
          // Create a Marker object
          const marker = new Marker(markerData);
          
          logger.collect(logContext, `Marker ${marker.id}:`,
            `Name: ${marker.name}, Position: ${marker.position}`);
          
          parsedMarkers.push(marker);
          validMarkerCount++;
        } else {
          insufficientPartsCount++;
          // Log the first few invalid lines as examples
          if (insufficientPartsCount <= 2) {
            logger.collect(logContext, 'Example of line with insufficient parts:', 
              `Line: ${line}, Parts: ${parts.length}`);
          }
        }
      } else {
        invalidLineCount++;
      }
    }
    
    // Log summary statistics
    logger.collect(logContext, 'Parsing summary:', 
      `Total lines: ${lines.length}, Valid markers: ${validMarkerCount}, ` +
      `Invalid lines: ${invalidLineCount}, Lines with insufficient parts: ${insufficientPartsCount}`);
    
    // Flush all collected logs
    logger.flushLogs(logContext);
    
    return parsedMarkers;
  }

  /**
   * Get all markers
   * @returns {Array} Array of Marker objects
   */
  getMarkers() {
    return this.markers;
  }

  /**
   * Find a marker by ID
   * @param {number} id - Marker ID
   * @returns {Marker|null} Marker object or null if not found
   */
  findMarkerById(id) {
    return this.markers.find(marker => marker.id === id);
  }
}

// Create and export a singleton instance
const markerService = new MarkerService();

module.exports = markerService;