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

class MidiService {
  constructor() {
    this.config = null;
    this.inputs = [];
    this.noteToEventMap = {};
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
      
      if (this.inputs.length === 0) {
        logger.log('No MIDI inputs available');
        return;
      }
      
      // Set up MIDI input listeners for all available inputs
      this.setupMidiListeners();
      
      logger.log('MIDI service initialized');
    } catch (error) {
      logger.error('Error initializing MIDI service:', error);
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
      try {
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
            
            // Only process noteOn events for actions
            if (type === 'noteon') {
              this.handleNoteOn(inputName, msg);
            }
          });
        });
        
        logger.log(`MIDI listener set up for input: ${inputName}`);
      } catch (error) {
        logger.error(`Error setting up MIDI listener for input ${inputName}:`, error);
      }
    });
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
          // For simplicity, we'll toggle autoplay on when this note is received
          // In a real implementation, you might want to use the velocity to determine the state
          this.handleToggleAutoplay(true);
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
   * @param {boolean} enabled - Whether autoplay should be enabled
   */
  handleToggleAutoplay(enabled) {
    try {
      const playbackState = regionService.getPlaybackState();
      playbackState.autoplayEnabled = enabled;
      
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