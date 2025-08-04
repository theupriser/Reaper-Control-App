/**
 * Region Service
 * Handles fetching, parsing, and managing regions from Reaper
 */

const logger = require('../utils/logger');
const reaperService = require('./reaperService');
const Region = require('../models/Region');
const PlaybackState = require('../models/PlaybackState');

class RegionService {
  constructor() {
    this.regions = [];
    this.playbackState = new PlaybackState();
    this.pollingInterval = null;
    this.eventListeners = {
      regionsUpdated: [],
      playbackStateUpdated: [],
      error: []
    };
    this.setlistSection = 'ReaperControl';
    this.selectedSetlistKey = 'SelectedSetlistId';
  }

  /**
   * Initialize the service
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Fetch initial regions
      await this.fetchRegions();
      
      // Load the selected setlist from Reaper extended data
      await this.loadSelectedSetlist();
      
      // Start polling for transport state
      this.startPolling();
      
      logger.log('Region service initialized');
    } catch (error) {
      logger.error('Failed to initialize region service:', error);
      this.emitEvent('error', {
        type: 'error',
        message: 'Error initializing region service',
        details: error.message
      });
      throw error;
    }
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
   * Fetch all regions from Reaper
   * @returns {Promise<Array>} Array of Region objects
   */
  async fetchRegions() {
    const logContext = logger.startCollection('fetchRegions');
    
    try {
      logger.collect(logContext, 'Fetching regions from Reaper...');
      
      // Get all regions using the REGION command
      const regionList = await reaperService.getRegions();
      
      logger.collect(logContext, 'Received region list from Reaper');
      
      if (regionList && regionList.length > 0) {
        logger.collect(logContext, 'Region list has content, length:', regionList.length);
        
        // Parse the region list response
        this.regions = this.parseRegionList(regionList);
        
        logger.collect(logContext, `Parsed ${this.regions.length} regions successfully`);
        
        // Emit regions updated event
        this.emitEvent('regionsUpdated', this.regions);
        
        logger.collect(logContext, `Emitted ${this.regions.length} regions to listeners`);
      } else {
        logger.collect(logContext, 'Region list is empty or invalid');
        
        // Clear regions and emit empty array
        this.regions = [];
        this.emitEvent('regionsUpdated', []);
        
        // Emit error status
        this.emitEvent('error', {
          type: 'warning',
          message: 'No regions found in Reaper. Please check if Reaper is running and has regions defined.',
          details: 'Make sure Reaper is running, the web interface is enabled on port 8080, and regions are defined in your project.'
        });
      }
      
      // Flush all collected logs
      logger.flushLogs(logContext);
      
      return this.regions;
    } catch (error) {
      // Use collectError to ensure errors are always logged
      logger.collectError(logContext, 'Error fetching regions:', error);
      
      // Emit error status
      this.emitEvent('error', {
        type: 'error',
        message: 'Error communicating with Reaper',
        details: error.message
      });
      
      throw error;
    }
  }

  /**
   * Parse region list response from Reaper
   * @param {string} response - Raw region list response
   * @returns {Array} Array of Region objects
   */
  parseRegionList(response) {
    const logContext = logger.startCollection('parseRegionList');
    
    logger.collect(logContext, 'Parsing region list response...');
    logger.collect(logContext, 'Raw response length:', response ? response.length : 0);
    
    const parsedRegions = [];
    
    // Skip the first line (REGION_LIST) and last line (REGION_LIST_END)
    const lines = response.split('\n').filter(line => 
      line !== 'REGION_LIST' && line !== 'REGION_LIST_END' && line.trim() !== '');
    
    logger.collect(logContext, 'Filtered lines count:', lines.length);
    
    // Track statistics
    let validRegionCount = 0;
    let invalidLineCount = 0;
    let insufficientPartsCount = 0;
    
    for (const line of lines) {
      if (line.startsWith('REGION')) {
        const parts = line.split('\t');
        if (parts.length >= 5) {
          const regionData = {
            id: parseInt(parts[2]),
            name: parts[1],
            start: parseFloat(parts[3]),
            end: parseFloat(parts[4]),
            color: parts[5] ? parts[5] : null
          };
          
          // Create a Region object
          const region = new Region(regionData);
          

          logger.collect(logContext, `Region ${region.id}:`,
            `Name: ${region.name}, Start: ${region.start}, End: ${region.end}`);
          
          parsedRegions.push(region);
          validRegionCount++;
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
      `Total lines: ${lines.length}, Valid regions: ${validRegionCount}, ` +
      `Invalid lines: ${invalidLineCount}, Lines with insufficient parts: ${insufficientPartsCount}`);
    
    // Flush all collected logs
    logger.flushLogs(logContext);
    
    return parsedRegions;
  }

  /**
   * Start polling for transport state
   */
  startPolling() {
    // Clear any existing interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    // Set up new polling interval
    this.pollingInterval = setInterval(async () => {
      try {
        // Get transport state
        const transportState = await reaperService.getTransportState();
        if (transportState) {
          // Update playback state and emit event if changed
          const changed = this.playbackState.updateFromTransportResponse(transportState, this.regions);
          if (changed) {
            this.emitEvent('playbackStateUpdated', this.playbackState);
          }
        }
      } catch (error) {
        logger.error('Error polling transport state:', error);
      }
    }, 500); // Poll every 500ms
  }

  /**
   * Stop polling for transport state
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Get all regions
   * @returns {Array} Array of Region objects
   */
  getRegions() {
    return this.regions;
  }

  /**
   * Get current playback state
   * @returns {PlaybackState} Current playback state
   */
  getPlaybackState() {
    return this.playbackState;
  }

  /**
   * Find a region by ID
   * @param {number} id - Region ID
   * @returns {Region|null} Region object or null if not found
   */
  findRegionById(id) {
    return this.regions.find(region => region.id === id);
  }

  /**
   * Find the current region based on playback position
   * @returns {Region|null} Current region or null if not in a region
   */
  getCurrentRegion() {
    if (this.playbackState.currentRegionId) {
      return this.findRegionById(this.playbackState.currentRegionId);
    }
    return null;
  }

  /**
   * Get the next region after the current one
   * @returns {Region|null} Next region or null if there is no next region
   */
  getNextRegion() {
    if (this.playbackState.currentRegionId) {
      const currentIndex = this.regions.findIndex(
        region => region.id === this.playbackState.currentRegionId
      );
      
      if (currentIndex >= 0 && currentIndex < this.regions.length - 1) {
        return this.regions[currentIndex + 1];
      }
    }
    return null;
  }

  /**
   * Get the previous region before the current one
   * @returns {Region|null} Previous region or null if there is no previous region
   */
  getPreviousRegion() {
    if (this.playbackState.currentRegionId) {
      const currentIndex = this.regions.findIndex(
        region => region.id === this.playbackState.currentRegionId
      );
      
      if (currentIndex > 0) {
        return this.regions[currentIndex - 1];
      }
    }
    return null;
  }

  /**
   * Set the selected setlist ID and store it in Reaper extended data
   * @param {string|null} setlistId - Setlist ID or null for all regions
   * @returns {Promise<boolean>} True if successful
   */
  async setSelectedSetlist(setlistId) {
    try {
      // Update the playback state
      this.playbackState.selectedSetlistId = setlistId;
      
      // Store in Reaper extended data
      await reaperService.setProjectExtState(
        this.setlistSection, 
        this.selectedSetlistKey, 
        setlistId || ''
      );
      
      // Emit updated playback state
      this.emitEvent('playbackStateUpdated', this.playbackState);
      
      logger.log(`Selected setlist set to: ${setlistId || 'null (all regions)'}`);
      return true;
    } catch (error) {
      logger.error('Error setting selected setlist:', error);
      return false;
    }
  }

  /**
   * Load the selected setlist ID from Reaper extended data
   * @returns {Promise<string|null>} Setlist ID or null if not set
   */
  async loadSelectedSetlist() {
    try {
      // Get from Reaper extended data
      const setlistId = await reaperService.getProjectExtState(
        this.setlistSection, 
        this.selectedSetlistKey
      );
      
      // Update the playback state
      this.playbackState.selectedSetlistId = setlistId || null;
      
      // Emit updated playback state
      this.emitEvent('playbackStateUpdated', this.playbackState);
      
      logger.log(`Loaded selected setlist: ${setlistId || 'null (all regions)'}`);
      return setlistId || null;
    } catch (error) {
      logger.error('Error loading selected setlist:', error);
      return null;
    }
  }
}

// Create and export a singleton instance
const regionService = new RegionService();

module.exports = regionService;