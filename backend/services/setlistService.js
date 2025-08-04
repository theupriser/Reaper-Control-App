/**
 * Setlist Service
 * Manages setlists for Reaper projects
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const Setlist = require('../models/Setlist');
const projectService = require('./projectService');
const regionService = require('./regionService');

class SetlistService {
  constructor() {
    this.setlists = new Map(); // Map of projectId -> Map of setlistId -> Setlist
    this.storagePath = path.join(__dirname, '../storage');
    this.eventListeners = {
      setlistCreated: [],
      setlistUpdated: [],
      setlistDeleted: [],
      error: []
    };
  }

  /**
   * Initialize the service
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Ensure storage directory exists
      await this.ensureStorageDirectory();
      
      // Load setlists for current project
      const projectId = projectService.getProjectId();
      if (projectId) {
        await this.loadSetlistsForProject(projectId);
      }
      
      // Listen for project changes
      projectService.on('projectChanged', async (newProjectId) => {
        if (newProjectId) {
          await this.loadSetlistsForProject(newProjectId);
        }
      });
      
      logger.log('Setlist service initialized');
    } catch (error) {
      logger.error('Failed to initialize setlist service:', error);
      this.emitEvent('error', {
        type: 'error',
        message: 'Error initializing setlist service',
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
   * Ensure the storage directory exists
   * @returns {Promise<void>}
   */
  async ensureStorageDirectory() {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      logger.log('Storage directory ensured:', this.storagePath);
    } catch (error) {
      logger.error('Error ensuring storage directory:', error);
      throw error;
    }
  }

  /**
   * Get the file path for a project's setlists
   * @param {string} projectId - Project ID
   * @returns {string} File path
   */
  getSetlistFilePath(projectId) {
    return path.join(this.storagePath, `${projectId}-setlist.json`);
  }

  /**
   * Load setlists for a project
   * @param {string} projectId - Project ID
   * @returns {Promise<Map>} Map of setlistId -> Setlist
   */
  async loadSetlistsForProject(projectId) {
    const logContext = logger.startCollection('loadSetlistsForProject');
    
    try {
      logger.collect(logContext, `Loading setlists for project: ${projectId}`);
      
      const filePath = this.getSetlistFilePath(projectId);
      let setlistsMap = new Map();
      let fileExists = true;
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        // File doesn't exist
        fileExists = false;
        logger.collect(logContext, `No setlist file found for project: ${projectId}`);
      }
      
      if (fileExists) {
        // Read and parse the file
        const data = await fs.readFile(filePath, 'utf8');
        const setlistsArray = JSON.parse(data);
        
        logger.collect(logContext, `Loaded ${setlistsArray.length} setlists from file`);
        
        // Create a map of setlists
        for (const setlistData of setlistsArray) {
          const setlist = new Setlist(setlistData);
          setlistsMap.set(setlist.id, setlist);
        }
      }
      
      // Store the map
      this.setlists.set(projectId, setlistsMap);
      
      // No longer creating a default setlist when none exist
      if (setlistsMap.size === 0) {
        logger.collect(logContext, `No setlists found for project: ${projectId}`);
      }
      
      logger.flushLogs(logContext);
      return setlistsMap;
    } catch (error) {
      logger.collectError(logContext, `Error loading setlists for project ${projectId}:`, error);
      
      // Create an empty map in case of error
      this.setlists.set(projectId, new Map());
      
      this.emitEvent('error', {
        type: 'error',
        message: 'Error loading setlists',
        details: error.message
      });
      
      throw error;
    }
  }

  /**
   * Save setlists for a project
   * @param {string} projectId - Project ID
   * @returns {Promise<void>}
   */
  async saveSetlistsForProject(projectId) {
    const logContext = logger.startCollection('saveSetlistsForProject');
    
    // Disable project polling to prevent unnecessary project reloads
    projectService.disablePolling();
    
    try {
      logger.collect(logContext, `Saving setlists for project: ${projectId}`);
      
      const projectSetlists = this.setlists.get(projectId);
      if (!projectSetlists) {
        logger.collect(logContext, `No setlists found for project: ${projectId}`);
        logger.flushLogs(logContext);
        // Re-enable project polling before returning
        projectService.enablePolling();
        return;
      }
      
      // Convert map to array
      const setlistsArray = Array.from(projectSetlists.values()).map(setlist => setlist.toJSON());
      
      logger.collect(logContext, `Saving ${setlistsArray.length} setlists to file`);
      
      // Write to file
      const filePath = this.getSetlistFilePath(projectId);
      await fs.writeFile(filePath, JSON.stringify(setlistsArray, null, 2), 'utf8');
      
      logger.collect(logContext, `Setlists saved to: ${filePath}`);
      logger.flushLogs(logContext);
    } catch (error) {
      logger.collectError(logContext, `Error saving setlists for project ${projectId}:`, error);
      
      this.emitEvent('error', {
        type: 'error',
        message: 'Error saving setlists',
        details: error.message
      });
      
      throw error;
    } finally {
      // Always re-enable project polling, even if there was an error
      projectService.enablePolling();
    }
  }

  /**
   * Get all setlists for a project
   * @param {string} projectId - Project ID (optional, uses current project if not provided)
   * @returns {Array} Array of Setlist objects
   */
  getSetlists(projectId = null) {
    // Use current project ID if not provided
    const currentProjectId = projectId || projectService.getProjectId();
    if (!currentProjectId) {
      logger.warn('No project ID available for getSetlists');
      return [];
    }
    
    // Get setlists for the project
    const projectSetlists = this.setlists.get(currentProjectId);
    if (!projectSetlists) {
      return [];
    }
    
    // Convert map to array
    return Array.from(projectSetlists.values());
  }

  /**
   * Get a setlist by ID
   * @param {string} setlistId - Setlist ID
   * @param {string} projectId - Project ID (optional, uses current project if not provided)
   * @returns {Setlist|null} Setlist object or null if not found
   */
  getSetlist(setlistId, projectId = null) {
    // Use current project ID if not provided
    const currentProjectId = projectId || projectService.getProjectId();
    if (!currentProjectId) {
      logger.warn('No project ID available for getSetlist');
      return null;
    }
    
    // Get setlists for the project
    const projectSetlists = this.setlists.get(currentProjectId);
    if (!projectSetlists) {
      return null;
    }
    
    // Get the setlist
    return projectSetlists.get(setlistId) || null;
  }

  /**
   * Create a new setlist
   * @param {Object} data - Setlist data
   * @param {string} data.name - Setlist name
   * @param {string} projectId - Project ID (optional, uses current project if not provided)
   * @returns {Promise<Setlist>} The created setlist
   */
  async createSetlist(data, projectId = null) {
    // Use current project ID if not provided
    const currentProjectId = projectId || projectService.getProjectId();
    if (!currentProjectId) {
      throw new Error('No project ID available for createSetlist');
    }
    
    // Get or create setlists map for the project
    let projectSetlists = this.setlists.get(currentProjectId);
    if (!projectSetlists) {
      projectSetlists = new Map();
      this.setlists.set(currentProjectId, projectSetlists);
    }
    
    // Create the setlist
    const setlist = new Setlist({
      name: data.name,
      projectId: currentProjectId,
      items: []
    });
    
    // Add to map
    projectSetlists.set(setlist.id, setlist);
    
    // Save to file
    await this.saveSetlistsForProject(currentProjectId);
    
    // Emit event
    this.emitEvent('setlistCreated', setlist);
    
    return setlist;
  }

  /**
   * Update a setlist
   * @param {string} setlistId - Setlist ID
   * @param {Object} data - New setlist data
   * @param {string} data.name - New setlist name
   * @param {string} projectId - Project ID (optional, uses current project if not provided)
   * @returns {Promise<Setlist|null>} The updated setlist or null if not found
   */
  async updateSetlist(setlistId, data, projectId = null) {
    // Use current project ID if not provided
    const currentProjectId = projectId || projectService.getProjectId();
    if (!currentProjectId) {
      throw new Error('No project ID available for updateSetlist');
    }
    
    // Get setlists for the project
    const projectSetlists = this.setlists.get(currentProjectId);
    if (!projectSetlists) {
      return null;
    }
    
    // Get the setlist
    const setlist = projectSetlists.get(setlistId);
    if (!setlist) {
      return null;
    }
    
    // Update the setlist
    setlist.update(data);
    
    // Save to file
    await this.saveSetlistsForProject(currentProjectId);
    
    // Emit event
    this.emitEvent('setlistUpdated', setlist);
    
    return setlist;
  }

  /**
   * Delete a setlist
   * @param {string} setlistId - Setlist ID
   * @param {string} projectId - Project ID (optional, uses current project if not provided)
   * @returns {Promise<boolean>} True if the setlist was deleted, false otherwise
   */
  async deleteSetlist(setlistId, projectId = null) {
    // Use current project ID if not provided
    const currentProjectId = projectId || projectService.getProjectId();
    if (!currentProjectId) {
      throw new Error('No project ID available for deleteSetlist');
    }
    
    // Get setlists for the project
    const projectSetlists = this.setlists.get(currentProjectId);
    if (!projectSetlists) {
      return false;
    }
    
    // Check if the setlist exists
    if (!projectSetlists.has(setlistId)) {
      return false;
    }
    
    // Delete the setlist
    projectSetlists.delete(setlistId);
    
    // Save to file
    await this.saveSetlistsForProject(currentProjectId);
    
    // Emit event
    this.emitEvent('setlistDeleted', { id: setlistId, projectId: currentProjectId });
    
    return true;
  }

  /**
   * Add an item to a setlist
   * @param {string} setlistId - Setlist ID
   * @param {Object} item - Item to add
   * @param {number} item.regionId - Region ID
   * @param {number} item.position - Position in the setlist (optional)
   * @param {string} projectId - Project ID (optional, uses current project if not provided)
   * @returns {Promise<Object|null>} The added item or null if the setlist was not found
   */
  async addSetlistItem(setlistId, item, projectId = null) {
    // Use current project ID if not provided
    const currentProjectId = projectId || projectService.getProjectId();
    if (!currentProjectId) {
      throw new Error('No project ID available for addSetlistItem');
    }
    
    // Get setlists for the project
    const projectSetlists = this.setlists.get(currentProjectId);
    if (!projectSetlists) {
      return null;
    }
    
    // Get the setlist
    const setlist = projectSetlists.get(setlistId);
    if (!setlist) {
      return null;
    }
    
    // Get the region
    const region = regionService.findRegionById(item.regionId);
    if (!region) {
      throw new Error(`Region with ID ${item.regionId} not found`);
    }
    
    // Add the item
    const newItem = setlist.addItem({
      regionId: region.id,
      name: region.name,
      position: item.position
    });
    
    // Save to file
    await this.saveSetlistsForProject(currentProjectId);
    
    // Emit event
    this.emitEvent('setlistUpdated', setlist);
    
    return newItem;
  }

  /**
   * Remove an item from a setlist
   * @param {string} setlistId - Setlist ID
   * @param {string} itemId - Item ID
   * @param {string} projectId - Project ID (optional, uses current project if not provided)
   * @returns {Promise<boolean>} True if the item was removed, false otherwise
   */
  async removeSetlistItem(setlistId, itemId, projectId = null) {
    // Use current project ID if not provided
    const currentProjectId = projectId || projectService.getProjectId();
    if (!currentProjectId) {
      throw new Error('No project ID available for removeSetlistItem');
    }
    
    // Get setlists for the project
    const projectSetlists = this.setlists.get(currentProjectId);
    if (!projectSetlists) {
      return false;
    }
    
    // Get the setlist
    const setlist = projectSetlists.get(setlistId);
    if (!setlist) {
      return false;
    }
    
    // Remove the item
    const removed = setlist.removeItem(itemId);
    if (!removed) {
      return false;
    }
    
    // Save to file
    await this.saveSetlistsForProject(currentProjectId);
    
    // Emit event
    this.emitEvent('setlistUpdated', setlist);
    
    return true;
  }

  /**
   * Move an item in a setlist
   * @param {string} setlistId - Setlist ID
   * @param {string} itemId - Item ID
   * @param {number} newPosition - New position for the item
   * @param {string} projectId - Project ID (optional, uses current project if not provided)
   * @returns {Promise<boolean>} True if the item was moved, false otherwise
   */
  async moveSetlistItem(setlistId, itemId, newPosition, projectId = null) {
    // Use current project ID if not provided
    const currentProjectId = projectId || projectService.getProjectId();
    if (!currentProjectId) {
      throw new Error('No project ID available for moveSetlistItem');
    }
    
    // Get setlists for the project
    const projectSetlists = this.setlists.get(currentProjectId);
    if (!projectSetlists) {
      return false;
    }
    
    // Get the setlist
    const setlist = projectSetlists.get(setlistId);
    if (!setlist) {
      return false;
    }
    
    // Move the item
    const moved = setlist.moveItem(itemId, newPosition);
    if (!moved) {
      return false;
    }
    
    // Save to file
    await this.saveSetlistsForProject(currentProjectId);
    
    // Emit event
    this.emitEvent('setlistUpdated', setlist);
    
    return true;
  }
}

// Create and export a singleton instance
const setlistService = new SetlistService();

module.exports = setlistService;