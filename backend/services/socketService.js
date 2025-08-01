/**
 * Socket Service
 * Handles all Socket.IO events and communication logic
 */

const logger = require('../utils/logger');
const reaperService = require('./reaperService');
const regionService = require('./regionService');

class SocketService {
  constructor() {
    this.io = null;
    this.setupEventListeners();
  }

  /**
   * Initialize the service with the Socket.IO instance
   * @param {Object} io - Socket.IO server instance
   */
  initialize(io) {
    this.io = io;
    logger.log('Socket service initialized');
  }

  /**
   * Set up event listeners for region and playback state updates
   */
  setupEventListeners() {
    // Listen for region updates
    regionService.on('regionsUpdated', (regions) => {
      if (this.io) {
        this.io.emit('regions', regions);
      }
    });

    // Listen for playback state updates
    regionService.on('playbackStateUpdated', (playbackState) => {
      if (this.io) {
        this.io.emit('playbackState', playbackState);
      }
    });

    // Listen for errors
    regionService.on('error', (error) => {
      if (this.io) {
        this.io.emit('status', error);
      }
    });
  }

  /**
   * Handle a new socket connection
   * @param {Object} socket - Socket.IO socket
   */
  handleConnection(socket) {
    // Only create a connection-specific log context if SOCKET_CONNECTION_LOG is enabled
    let connectionContext = null;
    if (process.env.SOCKET_CONNECTION_LOG === 'true') {
      connectionContext = logger.startCollection(`socket-connection-${socket.id}`);
      
      logger.collect(connectionContext, 'Client connected:', socket.id);
      logger.collect(connectionContext, 'Current regions count at connection time:', regionService.getRegions().length);
      
      // Send initial data to the newly connected client
      logger.collect(connectionContext, 'Sending initial data to client:', socket.id);
    } else {
      // Always log basic connection info even without detailed logging
      logger.log('Client connected:', socket.id);
    }
    
    socket.emit('regions', regionService.getRegions());
    socket.emit('playbackState', regionService.getPlaybackState());
    
    // Flush the connection logs if they exist
    if (connectionContext) {
      logger.flushLogs(connectionContext);
    }
    
    // Create a context for ongoing socket events
    const socketEventsContext = `socket-events-${socket.id}`;
    
    // Set up event handlers
    this.setupSocketEventHandlers(socket, socketEventsContext);
    
    // Handle custom ping event for connection monitoring
    socket.on('ping', (callback) => {
      logger.log('Received ping from client:', socket.id);
      // If callback is provided, call it to send pong response
      if (typeof callback === 'function') {
        callback();
        logger.log('Sent pong response to client:', socket.id);
      }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
      logger.log('Client disconnected:', socket.id);
    });
  }

  /**
   * Set up event handlers for a socket
   * @param {Object} socket - Socket.IO socket
   * @param {string} socketEventsContext - Logging context for this socket
   */
  setupSocketEventHandlers(socket, socketEventsContext) {
    // Log all socket events for debugging, but bundle them by event type
    const originalOn = socket.on;
    socket.on = function(event, handler) {
      if (event !== 'disconnect') {
        const wrappedHandler = function(...args) {
          // Only log socket events if SOCKET_EVENT_LOG is enabled
          if (process.env.SOCKET_EVENT_LOG === 'true') {
            // Start a new collection for each event
            const eventContext = logger.startCollection(`${socketEventsContext}-${event}`);
            logger.collect(eventContext, `Socket ${socket.id} received event: ${event}`, args);
            
            // Execute the handler and flush logs afterward
            const result = handler.apply(this, args);
            setTimeout(() => logger.flushLogs(eventContext), 100); // Small delay to include any logs from the handler
            return result;
          } else {
            // If logging is disabled, just execute the handler without logging
            return handler.apply(this, args);
          }
        };
        return originalOn.call(this, event, wrappedHandler);
      } else {
        return originalOn.call(this, event, handler);
      }
    };

    // Handle play/pause toggle
    socket.on('togglePlay', async () => {
      try {
        const logContext = logger.startCollection('togglePlay-handler');
        logger.collect(logContext, 'Toggle play/pause requested');
        
        const playbackState = regionService.getPlaybackState();
        logger.collect(logContext, 'Current playback state:', 
          JSON.stringify(playbackState.toJSON()));
        
        // Send toggle command to Reaper
        logger.collect(logContext, 'Sending toggle command to Reaper, current isPlaying:', playbackState.isPlaying);
        await reaperService.togglePlay(playbackState.isPlaying);
        logger.collect(logContext, 'Toggle command sent successfully');
        
        // Add a delayed check for play/pause state after 1 second
        // Always check the state after toggling, regardless of whether we're playing or pausing
        logger.collect(logContext, 'Setting up 1-second delayed check for play/pause state');
        
        setTimeout(async () => {
          const delayedLogContext = logger.startCollection('delayed-playback-check');
          try {
            const actionType = !playbackState.isPlaying ? 'play' : 'pause';
            logger.collect(delayedLogContext, `Executing delayed ${actionType} state check after 1 second`);
            
            // Get transport state after delay
            logger.collect(delayedLogContext, 'Requesting transport state from Reaper');
            const transportState = await reaperService.getTransportState();
            
            if (transportState) {
              logger.collect(delayedLogContext, 'Received transport state:', transportState);
              
              // Update playback state
              logger.collect(delayedLogContext, 'Updating playback state from transport response');
              const currentPlaybackState = regionService.getPlaybackState();
              logger.collect(delayedLogContext, 'Current playback state before update:', 
                JSON.stringify(currentPlaybackState.toJSON()));
              
              const changed = currentPlaybackState.updateFromTransportResponse(
                transportState, 
                regionService.getRegions()
              );
              
              logger.collect(delayedLogContext, 'Playback state after update:', 
                JSON.stringify(currentPlaybackState.toJSON()));
              logger.collect(delayedLogContext, 'State changed:', changed);
              
              // Always emit the updated state to ensure UI is in sync with Reaper
              // This ensures the UI reflects Reaper's actual state even if Reaper didn't respond to the command
              logger.collect(delayedLogContext, 'Emitting updated playback state');
              regionService.emitEvent('playbackStateUpdated', regionService.getPlaybackState());
              logger.log(`Emitted delayed ${actionType} state update after 1 second`);
            } else {
              logger.collect(delayedLogContext, 'No transport state received from Reaper');
            }
            
            // Flush logs
            logger.flushLogs(delayedLogContext);
          } catch (error) {
            logger.collectError(delayedLogContext, 'Error in delayed playback state check:', error);
          }
        }, 1000); // 1 second delay
        
        // Flush logs
        logger.flushLogs(logContext);
      } catch (error) {
        logger.error('Error toggling play/pause:', error);
      }
    });
    
    // Handle seek to position
    socket.on('seekToPosition', async (position) => {
      try {
        const logContext = logger.startCollection('seekToPosition-handler');
        logger.collect(logContext, 'Seek to position requested:', position);
        
        // Get current playback state and autoplay setting
        const playbackState = regionService.getPlaybackState();
        const isPlaying = playbackState.isPlaying;
        const isAutoplayEnabled = playbackState.autoplayEnabled;
        
        logger.collect(logContext, 'Current state:', 
          `isPlaying=${isPlaying}, autoplayEnabled=${isAutoplayEnabled}`);
        
        // If currently playing, pause first
        if (isPlaying) {
          logger.collect(logContext, 'Pausing before seeking to position');
          await reaperService.togglePlay(true); // Pause
          
          // Wait a short time for pause to take effect
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Send the seek command
        logger.collect(logContext, 'Sending seek command for position:', position);
        await reaperService.seekToPosition(position);
        
        // If was playing and autoplay is enabled, resume playback
        if (isPlaying && isAutoplayEnabled) {
          logger.collect(logContext, 'Autoplay enabled, resuming playback');
          
          // Wait a short time for seek to take effect
          await new Promise(resolve => setTimeout(resolve, 100));
          
          await reaperService.togglePlay(false); // Resume
        }
        
        // Flush logs
        logger.flushLogs(logContext);
      } catch (error) {
        logger.error('Error seeking to position:', error);
      }
    });
    
    // Handle seek to region
    socket.on('seekToRegion', async (regionId) => {
      try {
        const logContext = logger.startCollection('seekToRegion-handler');
        logger.collect(logContext, 'Seek to region requested:', regionId);
        
        const region = regionService.findRegionById(regionId);
        if (region) {
          logger.collect(logContext, 'Found region:', 
            `ID=${region.id}, Name=${region.name}, Start=${region.start}, End=${region.end}`);
          
          // Get current playback state and autoplay setting
          const playbackState = regionService.getPlaybackState();
          const isPlaying = playbackState.isPlaying;
          const isAutoplayEnabled = playbackState.autoplayEnabled;
          
          logger.collect(logContext, 'Current state:', 
            `isPlaying=${isPlaying}, autoplayEnabled=${isAutoplayEnabled}`);
          
          // If currently playing, pause first
          if (isPlaying) {
            logger.collect(logContext, 'Pausing before seeking to region');
            await reaperService.togglePlay(true); // Pause
            
            // Wait a short time for pause to take effect
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // Add a small offset (1ms = 0.001s) to ensure position is clearly within the region
          // This prevents issues with selection when regions are adjacent
          const positionWithOffset = region.start + 0.001;
          
          // Send the seek command
          logger.collect(logContext, 'Sending seek command for position:', positionWithOffset);
          await reaperService.seekToPosition(positionWithOffset);
          
          // If was playing and autoplay is enabled, resume playback
          if (isPlaying && isAutoplayEnabled) {
            logger.collect(logContext, 'Autoplay enabled, resuming playback');
            
            // Wait a short time for seek to take effect
            await new Promise(resolve => setTimeout(resolve, 100));
            
            await reaperService.togglePlay(false); // Resume
          }
        } else {
          logger.collect(logContext, 'Region not found:', regionId);
        }
        
        // Flush logs
        logger.flushLogs(logContext);
      } catch (error) {
        logger.error('Error seeking to region:', error);
      }
    });
    
    // Handle seek to beginning of current region
    socket.on('seekToCurrentRegionStart', async () => {
      try {
        const logContext = logger.startCollection('seekToCurrentRegionStart-handler');
        logger.collect(logContext, 'Seek to current region start requested');
        
        const currentRegion = regionService.getCurrentRegion();
        if (currentRegion) {
          logger.collect(logContext, 'Found current region:', 
            `ID=${currentRegion.id}, Name=${currentRegion.name}, Start=${currentRegion.start}, End=${currentRegion.end}`);
          
          // Get current playback state and autoplay setting
          const playbackState = regionService.getPlaybackState();
          const isPlaying = playbackState.isPlaying;
          const isAutoplayEnabled = playbackState.autoplayEnabled;
          
          logger.collect(logContext, 'Current state:', 
            `isPlaying=${isPlaying}, autoplayEnabled=${isAutoplayEnabled}`);
          
          // If currently playing, pause first
          if (isPlaying) {
            logger.collect(logContext, 'Pausing before seeking to current region start');
            await reaperService.togglePlay(true); // Pause
            
            // Wait a short time for pause to take effect
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // Add a small offset (1ms = 0.001s) to ensure position is clearly within the region
          const positionWithOffset = currentRegion.start + 0.001;
          
          // Send the seek command
          logger.collect(logContext, 'Sending seek command for position:', positionWithOffset);
          await reaperService.seekToPosition(positionWithOffset);
          
          // If was playing and autoplay is enabled, resume playback
          if (isPlaying && isAutoplayEnabled) {
            logger.collect(logContext, 'Autoplay enabled, resuming playback');
            
            // Wait a short time for seek to take effect
            await new Promise(resolve => setTimeout(resolve, 100));
            
            await reaperService.togglePlay(false); // Resume
          }
        } else {
          logger.collect(logContext, 'No current region found');
        }
        
        // Flush logs
        logger.flushLogs(logContext);
      } catch (error) {
        logger.error('Error seeking to current region start:', error);
      }
    });
    
    // Handle next region
    socket.on('nextRegion', async () => {
      try {
        const logContext = logger.startCollection('nextRegion-handler');
        logger.collect(logContext, 'Next region requested');
        
        const nextRegion = regionService.getNextRegion();
        if (nextRegion) {
          logger.collect(logContext, 'Found next region:', 
            `ID=${nextRegion.id}, Name=${nextRegion.name}, Start=${nextRegion.start}, End=${nextRegion.end}`);
          
          // Get current playback state and autoplay setting
          const playbackState = regionService.getPlaybackState();
          const isPlaying = playbackState.isPlaying;
          const isAutoplayEnabled = playbackState.autoplayEnabled;
          
          logger.collect(logContext, 'Current state:', 
            `isPlaying=${isPlaying}, autoplayEnabled=${isAutoplayEnabled}`);
          
          // If currently playing, pause first
          if (isPlaying) {
            logger.collect(logContext, 'Pausing before going to next region');
            await reaperService.togglePlay(true); // Pause
            
            // Wait a short time for pause to take effect
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // Add a small offset (1ms = 0.001s) to ensure position is clearly within the region
          const positionWithOffset = nextRegion.start + 0.001;
          
          // Send the seek command
          logger.collect(logContext, 'Sending seek command for position:', positionWithOffset);
          await reaperService.seekToPosition(positionWithOffset);
          
          // If was playing and autoplay is enabled, resume playback
          if (isPlaying && isAutoplayEnabled) {
            logger.collect(logContext, 'Autoplay enabled, resuming playback');
            
            // Wait a short time for seek to take effect
            await new Promise(resolve => setTimeout(resolve, 100));
            
            await reaperService.togglePlay(false); // Resume
          }
        } else {
          logger.collect(logContext, 'No next region found');
        }
        
        // Flush logs
        logger.flushLogs(logContext);
      } catch (error) {
        logger.error('Error going to next region:', error);
      }
    });
    
    // Handle previous region
    socket.on('previousRegion', async () => {
      try {
        const logContext = logger.startCollection('previousRegion-handler');
        logger.collect(logContext, 'Previous region requested');
        
        const prevRegion = regionService.getPreviousRegion();
        if (prevRegion) {
          logger.collect(logContext, 'Found previous region:', 
            `ID=${prevRegion.id}, Name=${prevRegion.name}, Start=${prevRegion.start}, End=${prevRegion.end}`);
          
          // Get current playback state and autoplay setting
          const playbackState = regionService.getPlaybackState();
          const isPlaying = playbackState.isPlaying;
          const isAutoplayEnabled = playbackState.autoplayEnabled;
          
          logger.collect(logContext, 'Current state:', 
            `isPlaying=${isPlaying}, autoplayEnabled=${isAutoplayEnabled}`);
          
          // If currently playing, pause first
          if (isPlaying) {
            logger.collect(logContext, 'Pausing before going to previous region');
            await reaperService.togglePlay(true); // Pause
            
            // Wait a short time for pause to take effect
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // Add a small offset (1ms = 0.001s) to ensure position is clearly within the region
          const positionWithOffset = prevRegion.start + 0.001;
          
          // Send the seek command
          logger.collect(logContext, 'Sending seek command for position:', positionWithOffset);
          await reaperService.seekToPosition(positionWithOffset);
          
          // If was playing and autoplay is enabled, resume playback
          if (isPlaying && isAutoplayEnabled) {
            logger.collect(logContext, 'Autoplay enabled, resuming playback');
            
            // Wait a short time for seek to take effect
            await new Promise(resolve => setTimeout(resolve, 100));
            
            await reaperService.togglePlay(false); // Resume
          }
        } else {
          logger.collect(logContext, 'No previous region found');
        }
        
        // Flush logs
        logger.flushLogs(logContext);
      } catch (error) {
        logger.error('Error going to previous region:', error);
      }
    });
    
    // Handle refresh regions
    socket.on('refreshRegions', async () => {
      try {
        await regionService.fetchRegions();
      } catch (error) {
        logger.error('Error refreshing regions:', error);
      }
    });
    
    // Handle toggle autoplay
    socket.on('toggleAutoplay', (enabled) => {
      try {
        const playbackState = regionService.getPlaybackState();
        playbackState.autoplayEnabled = enabled;
        
        // Emit updated playback state
        regionService.emitEvent('playbackStateUpdated', playbackState);
        
        logger.log(`Autoplay ${enabled ? 'enabled' : 'disabled'}`);
      } catch (error) {
        logger.error('Error toggling autoplay:', error);
      }
    });
  }
}

// Create and export a singleton instance
const socketService = new SocketService();
module.exports = socketService;