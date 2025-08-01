/**
 * Socket Controller
 * Handles all Socket.IO events and communication
 */

const logger = require('../utils/logger');
const reaperService = require('../services/reaperService');
const regionService = require('../services/regionService');

class SocketController {
  constructor(io) {
    this.io = io;
    this.setupEventListeners();
  }

  /**
   * Set up event listeners for region and playback state updates
   */
  setupEventListeners() {
    // Listen for region updates
    regionService.on('regionsUpdated', (regions) => {
      this.io.emit('regions', regions);
    });

    // Listen for playback state updates
    regionService.on('playbackStateUpdated', (playbackState) => {
      this.io.emit('playbackState', playbackState);
    });

    // Listen for errors
    regionService.on('error', (error) => {
      this.io.emit('status', error);
    });
  }

  /**
   * Initialize Socket.IO connection handling
   */
  initialize() {
    this.io.on('connection', (socket) => this.handleConnection(socket));
    logger.log('Socket controller initialized');
  }

  /**
   * Handle a new socket connection
   * @param {Object} socket - Socket.IO socket
   */
  handleConnection(socket) {
    // Create a connection-specific log context
    const connectionContext = logger.startCollection(`socket-connection-${socket.id}`);
    
    logger.collect(connectionContext, 'Client connected:', socket.id);
    logger.collect(connectionContext, 'Current regions count at connection time:', regionService.getRegions().length);
    
    // Send initial data to the newly connected client
    logger.collect(connectionContext, 'Sending initial data to client:', socket.id);
    socket.emit('regions', regionService.getRegions());
    socket.emit('playbackState', regionService.getPlaybackState());
    
    // Flush the connection logs
    logger.flushLogs(connectionContext);
    
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
          // Start a new collection for each event
          const eventContext = logger.startCollection(`${socketEventsContext}-${event}`);
          logger.collect(eventContext, `Socket ${socket.id} received event: ${event}`, args);
          
          // Execute the handler and flush logs afterward
          const result = handler.apply(this, args);
          setTimeout(() => logger.flushLogs(eventContext), 100); // Small delay to include any logs from the handler
          return result;
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
        await reaperService.seekToPosition(position);
      } catch (error) {
        logger.error('Error seeking to position:', error);
      }
    });
    
    // Handle seek to region
    socket.on('seekToRegion', async (regionId) => {
      try {
        const region = regionService.findRegionById(regionId);
        if (region) {
          // Add a small offset (1ms = 0.001s) to ensure position is clearly within the region
          // This prevents issues with selection when regions are adjacent
          const positionWithOffset = region.start + 0.001;
          await reaperService.seekToPosition(positionWithOffset);
        }
      } catch (error) {
        logger.error('Error seeking to region:', error);
      }
    });
    
    // Handle seek to beginning of current region
    socket.on('seekToCurrentRegionStart', async () => {
      try {
        const currentRegion = regionService.getCurrentRegion();
        if (currentRegion) {
          // Add a small offset (1ms = 0.001s) to ensure position is clearly within the region
          const positionWithOffset = currentRegion.start + 0.001;
          await reaperService.seekToPosition(positionWithOffset);
        }
      } catch (error) {
        logger.error('Error seeking to current region start:', error);
      }
    });
    
    // Handle next region
    socket.on('nextRegion', async () => {
      try {
        const nextRegion = regionService.getNextRegion();
        if (nextRegion) {
          // Add a small offset (1ms = 0.001s) to ensure position is clearly within the region
          const positionWithOffset = nextRegion.start + 0.001;
          await reaperService.seekToPosition(positionWithOffset);
        }
      } catch (error) {
        logger.error('Error going to next region:', error);
      }
    });
    
    // Handle previous region
    socket.on('previousRegion', async () => {
      try {
        const prevRegion = regionService.getPreviousRegion();
        if (prevRegion) {
          // Add a small offset (1ms = 0.001s) to ensure position is clearly within the region
          const positionWithOffset = prevRegion.start + 0.001;
          await reaperService.seekToPosition(positionWithOffset);
        }
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
  }
}

module.exports = SocketController;