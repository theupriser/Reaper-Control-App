/**
 * MIDI Service
 * Handles MIDI input events and triggers corresponding socket events
 */

const easymidi = require('easymidi');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const reaperService = require('./reaperService');
const regionService = require('./regionService');
const setlistNavigationService = require('./setlistNavigationService');
const EventEmitter = require('events');

class MidiService extends EventEmitter {
  constructor() {
    super();
    this.config = null;
    this.inputs = [];
    this.noteToEventMap = {};
    this.deviceCheckInterval = null;
    this.connectedInputs = new Map(); // Track connected inputs by name
  }

  /**
   * Initialize the MIDI service
   */
  initialize() {
    try {
      // Load configuration
      this.loadConfig();
      
      // Get available MIDI inputs
      this.inputs = easymidi.getInputs();
      logger.log('Available MIDI inputs:', this.inputs);
      
      // Set up MIDI input listeners for all available inputs
      this.setupMidiListeners();
      
      // Start polling for new MIDI devices every 5 seconds
      this.startDevicePolling();
      
      logger.log('MIDI service initialized');
    } catch (error) {
      logger.error('Error initializing MIDI service:', error);
    }
  }
  
  /**
   * Start polling for new MIDI devices
   */
  startDevicePolling() {
    // Clear any existing interval
    if (this.deviceCheckInterval) {
      clearInterval(this.deviceCheckInterval);
    }
    
    // Check for new devices immediately
    this.checkForNewDevices();
    
    // Set up interval to check for new devices every 5 seconds
    this.deviceCheckInterval = setInterval(() => {
      this.checkForNewDevices();
    }, 5000); // 5 seconds
    
    logger.log('Started polling for new MIDI devices every 5 seconds');
  }
  
  /**
   * Stop polling for new MIDI devices
   */
  stopDevicePolling() {
    if (this.deviceCheckInterval) {
      clearInterval(this.deviceCheckInterval);
      this.deviceCheckInterval = null;
      logger.log('Stopped polling for new MIDI devices');
    }
  }
  
  /**
   * Shutdown the MIDI service and clean up all resources
   */
  shutdown() {
    try {
      logger.log('Shutting down MIDI service...');
      
      // Stop the device polling
      this.stopDevicePolling();
      
      // Clean up all connected inputs
      const connectedInputNames = Array.from(this.connectedInputs.keys());
      
      if (connectedInputNames.length > 0) {
        logger.log(`Cleaning up ${connectedInputNames.length} MIDI inputs...`);
        
        connectedInputNames.forEach(inputName => {
          this.cleanupMidiInput(inputName);
        });
      }
      
      // Reset state
      this.inputs = [];
      this.connectedInputs.clear();
      
      logger.log('MIDI service shutdown complete');
    } catch (error) {
      logger.error('Error shutting down MIDI service:', error);
    }
  }
  
  /**
   * Check for new MIDI devices and connect them
   * Also check for disconnected devices and clean them up
   */
  checkForNewDevices() {
    try {
      // Get current available MIDI inputs
      const currentInputs = easymidi.getInputs();
      
      // Find new inputs that weren't available before
      const newInputs = currentInputs.filter(input => 
        !this.connectedInputs.has(input)
      );
      
      // Find disconnected inputs that are no longer available
      const disconnectedInputs = Array.from(this.connectedInputs.keys())
        .filter(input => !currentInputs.includes(input));
      
      // Handle new inputs
      if (newInputs.length > 0) {
        logger.log('New MIDI devices detected:', newInputs);
        
        // Set up listeners for new inputs
        newInputs.forEach(inputName => {
          this.setupMidiListenerForInput(inputName);
        });
      }
      
      // Handle disconnected inputs
      if (disconnectedInputs.length > 0) {
        logger.log('MIDI devices disconnected:', disconnectedInputs);
        
        // Clean up disconnected inputs
        disconnectedInputs.forEach(inputName => {
          this.cleanupMidiInput(inputName);
        });
      }
      
      // Update the inputs list
      this.inputs = currentInputs;
    } catch (error) {
      logger.error('Error checking for new MIDI devices:', error);
    }
  }
  
  /**
   * Clean up resources for a disconnected MIDI input
   * @param {string} inputName - Name of the MIDI input to clean up
   */
  cleanupMidiInput(inputName) {
    try {
      // Get the input data from the map
      const inputData = this.connectedInputs.get(inputName);
      
      if (!inputData) {
        return;
      }
      
      // Close the input
      if (inputData.input) {
        try {
          inputData.input.close();
        } catch (closeError) {
          logger.error(`Error closing MIDI input ${inputName}:`, closeError);
        }
      }
      
      // Remove from the connected inputs map
      this.connectedInputs.delete(inputName);
      
      logger.log(`Cleaned up disconnected MIDI input: ${inputName}`);
    } catch (error) {
      logger.error(`Error cleaning up MIDI input ${inputName}:`, error);
    }
  }

  /**
   * Load MIDI configuration from JSON file
   */
  loadConfig() {
    try {
      const configPath = path.join(__dirname, '../config/midiConfig.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      this.config = JSON.parse(configData);
      
      // Create a reverse mapping from note numbers to event names
      this.noteToEventMap = {};
      for (const [eventName, noteNumber] of Object.entries(this.config.noteMapping)) {
        this.noteToEventMap[noteNumber] = eventName;
      }
      
      logger.log('MIDI configuration loaded:', this.config);
    } catch (error) {
      logger.error('Error loading MIDI configuration:', error);
      throw error;
    }
  }

  /**
   * Set up MIDI input listeners for all available inputs
   */
  setupMidiListeners() {
    this.inputs.forEach(inputName => {
      this.setupMidiListenerForInput(inputName);
    });
  }
  
  /**
   * Set up MIDI input listener for a single input
   * @param {string} inputName - Name of the MIDI input
   * @returns {boolean} - Whether the listener was set up successfully
   */
  setupMidiListenerForInput(inputName) {
    try {
      // Skip if already connected
      if (this.connectedInputs.has(inputName)) {
        logger.log(`MIDI input ${inputName} is already connected`);
        return false;
      }
      
      const input = new easymidi.Input(inputName);
      
      // Create a context for logging all MIDI messages from this input
      const midiLogContext = logger.startCollection(`midi-input-${inputName}`);
      
      // Listen for all MIDI message types
      const messageTypes = ['noteon', 'noteoff', 'cc', 'program', 'channel aftertouch', 'pitch', 'position', 'mtc', 'select', 'clock', 'start', 'continue', 'stop', 'reset'];
      
      messageTypes.forEach(type => {
        input.on(type, msg => {
          // Log all MIDI messages if MIDI_LOG_ALL is enabled
          if (process.env.MIDI_LOG_ALL === 'true') {
            logger.collect(midiLogContext, `MIDI ${type} received on input ${inputName}:`, JSON.stringify(msg));
            // Flush logs immediately for MIDI messages
            logger.flushLogs(midiLogContext);
          }
          
          // Emit midiActivity event for any MIDI message
          this.emit('midiActivity');
          
          // Only process noteOn events for actions
          if (type === 'noteon') {
            this.handleNoteOn(inputName, msg);
          }
        });
      });
      
      // Store the input instance in the connectedInputs map
      this.connectedInputs.set(inputName, {
        input,
        logContext: midiLogContext
      });
      
      logger.log(`MIDI listener set up for input: ${inputName}`);
      return true;
    } catch (error) {
      logger.error(`Error setting up MIDI listener for input ${inputName}:`, error);
      return false;
    }
  }

  /**
   * Handle MIDI noteOn events
   * @param {string} inputName - Name of the MIDI input
   * @param {Object} msg - MIDI message object
   */
  async handleNoteOn(inputName, msg) {
    try {
      // Check if the message is on the configured channel
      if (msg.channel !== this.config.channel) {
        return;
      }
      
      const noteNumber = msg.note;
      const eventName = this.noteToEventMap[noteNumber];
      
      if (!eventName) {
        return;
      }
      
      logger.log(`MIDI note ${noteNumber} received on input ${inputName}, triggering event: ${eventName}`);
      
      // Handle the event based on the event name
      switch (eventName) {
        case 'togglePlay':
          await this.handleTogglePlay();
          break;
        case 'pause':
          await this.handlePause();
          break;
        case 'seekToPosition':
          // For simplicity, we'll seek to position 0 when this note is received
          // In a real implementation, you might want to use the velocity to determine the position
          await this.handleSeekToPosition(0);
          break;
        case 'seekToRegion':
          // For simplicity, we'll use the first region when this note is received
          // In a real implementation, you might want to use the velocity to determine the region
          await this.handleSeekToRegion();
          break;
        case 'seekToCurrentRegionStart':
          await this.handleSeekToCurrentRegionStart();
          break;
        case 'nextRegion':
          await this.handleNextRegion();
          break;
        case 'previousRegion':
          await this.handlePreviousRegion();
          break;
        case 'refreshRegions':
          await this.handleRefreshRegions();
          break;
        case 'toggleAutoplay':
          this.handleToggleAutoplay();
          break;
        default:
          logger.log(`Unknown event name: ${eventName}`);
      }
    } catch (error) {
      logger.error('Error handling MIDI noteOn event:', error);
    }
  }

  /**
   * Handle togglePlay event
   */
  async handleTogglePlay() {
    try {
      // Use the shared setlist navigation service for toggle play
      await setlistNavigationService.handleTogglePlay();
    } catch (error) {
      logger.error('Error handling MIDI togglePlay event:', error);
    }
  }

  /**
   * Handle pause event - always pauses reaper
   */
  async handlePause() {
    try {
      const playbackState = regionService.getPlaybackState();
      // Only pause if currently playing
      if (playbackState.isPlaying) {
        await reaperService.togglePlay(true); // true = pause
        logger.log('MIDI pause event: Paused playback');
      } else {
        logger.log('MIDI pause event: Already paused, no action taken');
      }
    } catch (error) {
      logger.error('Error handling MIDI pause event:', error);
    }
  }

  /**
   * Handle seekToPosition event
   * @param {number} position - Position to seek to
   */
  async handleSeekToPosition(position) {
    try {
      const playbackState = regionService.getPlaybackState();
      const isPlaying = playbackState.isPlaying;
      const isAutoplayEnabled = playbackState.autoplayEnabled;
      
      // If currently playing, pause first
      if (isPlaying) {
        await reaperService.togglePlay(true); // Pause
        
        // Wait a short time for pause to take effect
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Send the seek command
      await reaperService.seekToPosition(position);
      
      // If was playing and autoplay is enabled, resume playback
      if (isPlaying && isAutoplayEnabled) {
        // Wait a short time for seek to take effect
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await reaperService.togglePlay(false); // Resume
      }
    } catch (error) {
      logger.error('Error handling MIDI seekToPosition event:', error);
    }
  }

  /**
   * Handle seekToRegion event
   */
  async handleSeekToRegion() {
    try {
      const regions = regionService.getRegions();
      if (regions.length === 0) {
        return;
      }
      
      const region = regions[0]; // Use the first region for simplicity
      
      const playbackState = regionService.getPlaybackState();
      const isPlaying = playbackState.isPlaying;
      const isAutoplayEnabled = playbackState.autoplayEnabled;
      
      // If currently playing, pause first
      if (isPlaying) {
        await reaperService.togglePlay(true); // Pause
        
        // Wait a short time for pause to take effect
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Add a small offset to ensure position is clearly within the region
      const positionWithOffset = region.start + 0.001;
      
      // Send the seek command
      await reaperService.seekToPosition(positionWithOffset);
      
      // If was playing and autoplay is enabled, resume playback
      if (isPlaying && isAutoplayEnabled) {
        // Wait a short time for seek to take effect
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await reaperService.togglePlay(false); // Resume
      }
    } catch (error) {
      logger.error('Error handling MIDI seekToRegion event:', error);
    }
  }

  /**
   * Handle seekToCurrentRegionStart event
   */
  async handleSeekToCurrentRegionStart() {
    try {
      const currentRegion = regionService.getCurrentRegion();
      if (!currentRegion) {
        return;
      }
      
      const playbackState = regionService.getPlaybackState();
      const isPlaying = playbackState.isPlaying;
      const isAutoplayEnabled = playbackState.autoplayEnabled;
      
      // If currently playing, pause first
      if (isPlaying) {
        await reaperService.togglePlay(true); // Pause
        
        // Wait a short time for pause to take effect
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Add a small offset to ensure position is clearly within the region
      const positionWithOffset = currentRegion.start + 0.001;
      
      // Send the seek command
      await reaperService.seekToPosition(positionWithOffset);
      
      // If was playing and autoplay is enabled, resume playback
      if (isPlaying && isAutoplayEnabled) {
        // Wait a short time for seek to take effect
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await reaperService.togglePlay(false); // Resume
      }
    } catch (error) {
      logger.error('Error handling MIDI seekToCurrentRegionStart event:', error);
    }
  }

  /**
   * Handle nextRegion event
   */
  async handleNextRegion() {
    try {
      // Use the shared setlist navigation service for next region
      await setlistNavigationService.navigateToNext();
    } catch (error) {
      logger.error('Error handling MIDI nextRegion event:', error);
    }
  }

  /**
   * Handle previousRegion event
   */
  async handlePreviousRegion() {
    try {
      // Use the shared setlist navigation service for previous region
      await setlistNavigationService.navigateToPrevious();
    } catch (error) {
      logger.error('Error handling MIDI previousRegion event:', error);
    }
  }

  /**
   * Handle refreshRegions event
   */
  async handleRefreshRegions() {
    try {
      await regionService.fetchRegions();
    } catch (error) {
      logger.error('Error handling MIDI refreshRegions event:', error);
    }
  }

  /**
   * Handle toggleAutoplay event
   * @param {boolean} [enabled] - Whether autoplay should be enabled. If not provided, toggles the current value.
   */
  handleToggleAutoplay(enabled) {
    try {
      const playbackState = regionService.getPlaybackState();
      
      // If enabled parameter is not provided, toggle the current value
      if (enabled === undefined) {
        playbackState.autoplayEnabled = !playbackState.autoplayEnabled;
        logger.log(`MIDI toggleAutoplay event: Toggled autoplay to ${playbackState.autoplayEnabled}`);
      } else {
        playbackState.autoplayEnabled = enabled;
        logger.log(`MIDI toggleAutoplay event: Set autoplay to ${enabled}`);
      }
      
      // Emit updated playback state
      regionService.emitEvent('playbackStateUpdated', playbackState);
    } catch (error) {
      logger.error('Error handling MIDI toggleAutoplay event:', error);
    }
  }
}

// Create and export a singleton instance
const midiService = new MidiService();
module.exports = midiService;