/**
 * Project Service
 * Manages project identification and metadata
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const reaperService = require('./reaperService');
const EventEmitter = require('events');

class ProjectService extends EventEmitter {
  constructor() {
    super();
    this.projectId = null;
    this.projectSection = 'ReaperControl';
    this.projectIdKey = 'ProjectId';
    this.pollingInterval = null;
    this.pollingFrequency = 2000; // Check every 2 seconds
  }

  /**
   * Initialize the service
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Get or generate the project ID
      await this.getOrGenerateProjectId();
      
      // Start polling for project changes
      this.startPolling();
      
      logger.log('Project service initialized');
    } catch (error) {
      logger.error('Failed to initialize project service:', error);
      throw error;
    }
  }
  
  /**
   * Start polling for project changes
   */
  startPolling() {
    // Clear any existing interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    // Set up new polling interval
    this.pollingInterval = setInterval(async () => {
      try {
        // Get the current project ID from Reaper
        const currentProjectId = await reaperService.getProjectExtState(this.projectSection, this.projectIdKey);
        
        // If the project ID has changed, update it
        if (currentProjectId !== this.projectId) {
          logger.log(`Project changed detected. Old ID: ${this.projectId}, New ID: ${currentProjectId}`);
          
          // If the new project doesn't have an ID, generate one
          if (!currentProjectId) {
            logger.log('Project ID is missing, generating a new one');
            await this.getOrGenerateProjectId();
          } else {
            // Update the stored project ID
            this.projectId = currentProjectId;
            
            // Emit an event with the project ID
            this.emit('projectIdUpdated', currentProjectId);
            
            // Emit a project changed event
            this.emit('projectChanged', currentProjectId);
          }
        } else if (!this.projectId) {
          // If current project ID is null or empty, generate a new one
          logger.log('Current project ID is null or empty, generating a new one');
          await this.getOrGenerateProjectId();
        }
      } catch (error) {
        logger.error('Error polling for project changes:', error);
      }
    }, this.pollingFrequency);
    
    logger.log(`Started polling for project changes every ${this.pollingFrequency}ms`);
  }
  
  /**
   * Stop polling for project changes
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      logger.log('Stopped polling for project changes');
    }
  }

  /**
   * Get or generate a project ID
   * @returns {Promise<string>} The project ID
   */
  async getOrGenerateProjectId() {
    try {
      // Try to get the existing project ID
      let projectId = await reaperService.getProjectExtState(this.projectSection, this.projectIdKey);
      
      // If no project ID exists, generate one and save it
      if (!projectId) {
        projectId = this.generateProjectId();
        logger.log(`Generated new project ID: ${projectId}`);
        
        try {
          // Save the project ID
          await reaperService.setProjectExtState(this.projectSection, this.projectIdKey, projectId);
          logger.log('Saved project ID to Reaper project');
        } catch (saveError) {
          logger.error('Error saving project ID to Reaper project:', saveError);
          // Continue with the new ID even if saving fails
          logger.log('Continuing with new project ID despite save error');
        }
      } else {
        logger.log(`Retrieved existing project ID: ${projectId}`);
      }
      
      // Store the project ID
      this.projectId = projectId;
      
      // Emit an event with the project ID
      this.emit('projectIdUpdated', projectId);
      
      return projectId;
    } catch (error) {
      logger.error('Error getting or generating project ID:', error);
      
      // If there's an error, generate a new ID as a fallback
      try {
        const fallbackId = this.generateProjectId();
        logger.log(`Generated fallback project ID due to error: ${fallbackId}`);
        
        // Store the fallback ID
        this.projectId = fallbackId;
        
        // Emit an event with the fallback ID
        this.emit('projectIdUpdated', fallbackId);
        
        return fallbackId;
      } catch (fallbackError) {
        logger.error('Error generating fallback project ID:', fallbackError);
        throw error; // Throw the original error
      }
    }
  }

  /**
   * Generate a new project ID
   * @returns {string} A new UUID
   */
  generateProjectId() {
    return uuidv4();
  }

  /**
   * Get the current project ID
   * @returns {string|null} The project ID or null if not set
   */
  getProjectId() {
    return this.projectId;
  }

  /**
   * Refresh the project ID (useful when a new project is loaded)
   * @returns {Promise<string>} The project ID
   */
  async refreshProjectId() {
    return this.getOrGenerateProjectId();
  }
}

// Create and export a singleton instance
const projectService = new ProjectService();

module.exports = projectService;