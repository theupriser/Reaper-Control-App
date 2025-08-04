/**
 * Socket Service
 * Handles all Socket.IO events and communication logic
 */

const logger = require('../utils/logger');
const reaperService = require('./reaperService');
const regionService = require('./regionService');
const markerService = require('./markerService');
const projectService = require('./projectService');
const setlistNavigationService = require('./setlistNavigationService');

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
   * Set up event listeners for region, marker, and playback state updates
   */
  setupEventListeners() {
    // Listen for region updates
    regionService.on('regionsUpdated', (regions) => {
      if (this.io) {
        this.io.emit('regions', regions);
      }
    });

    // Listen for marker updates
    markerService.on('markersUpdated', (markers) => {
      if (this.io) {
        this.io.emit('markers', markers);
      }
    });

    // Listen for playback state updates
    regionService.on('playbackStateUpdated', (playbackState) => {
      if (this.io) {
        this.io.emit('playbackState', playbackState);
      }
    });

    // Listen for project ID updates
    projectService.on('projectIdUpdated', (projectId) => {
      if (this.io) {
        logger.log('Emitting project ID to all clients:', projectId);
        this.io.emit('projectId', projectId);
      }
    });
    
    // Listen for project changes (when switching tabs in Reaper)
    projectService.on('projectChanged', (projectId) => {
      if (this.io) {
        logger.log('Project changed detected, notifying all clients');
        
        // Emit project changed event with the new project ID
        this.io.emit('projectChanged', projectId);
        
        // Refresh regions for the new project
        regionService.fetchRegions().then(() => {
          logger.log('Regions refreshed after project change');
          
          // Load the selected setlist for the new project
          regionService.loadSelectedSetlist().then((setlistId) => {
            logger.log(`Loaded selected setlist after project change: ${setlistId || 'null (all regions)'}`);
          }).catch(error => {
            logger.error('Error loading selected setlist after project change:', error);
          });
        }).catch(error => {
          logger.error('Error refreshing regions after project change:', error);
        });
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
    socket.emit('markers', markerService.getMarkers());
    socket.emit('playbackState', regionService.getPlaybackState());
  
    // Send project ID if available
    const projectId = projectService.getProjectId();
    if (projectId) {
      logger.log('Sending project ID to client:', socket.id, projectId);
      socket.emit('projectId', projectId);
    }
    
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
        
        // Use the shared setlist navigation service for toggle play
        logger.collect(logContext, 'Using setlist navigation service for toggle play');
        await setlistNavigationService.handleTogglePlay();
        logger.collect(logContext, 'Toggle play handled successfully');
        
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
          
          // Get the current playback state to check if a setlist is selected
          const playbackState = regionService.getPlaybackState();
          
          // Update the current region ID in the playback state
          // This ensures the region is tracked correctly even when "all regions" is selected
          playbackState.currentRegionId = region.id;
          regionService.emitEvent('playbackStateUpdated', playbackState);
          logger.collect(logContext, 'Updated current region ID in playback state');
          
          // Use the shared setlist navigation service for seeking to region
          logger.collect(logContext, 'Using setlist navigation service for seeking to region');
          const success = await setlistNavigationService.seekToRegionAndPlay(region);
          
          if (success) {
            logger.collect(logContext, 'Successfully navigated to region');
          } else {
            logger.collect(logContext, 'Failed to navigate to region');
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
          
          // Get the current playback state
          const playbackState = regionService.getPlaybackState();
          
          // Ensure the current region ID is set correctly
          // This is redundant since getCurrentRegion already uses this ID, but it's good for consistency
          if (playbackState.currentRegionId !== currentRegion.id) {
            playbackState.currentRegionId = currentRegion.id;
            regionService.emitEvent('playbackStateUpdated', playbackState);
            logger.collect(logContext, 'Updated current region ID in playback state');
          }
          
          // Use the shared setlist navigation service for seeking to region
          logger.collect(logContext, 'Using setlist navigation service for seeking to current region start');
          const success = await setlistNavigationService.seekToRegionAndPlay(currentRegion);
          
          if (success) {
            logger.collect(logContext, 'Successfully navigated to current region start');
          } else {
            logger.collect(logContext, 'Failed to navigate to current region start');
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
        
        // Use the shared setlist navigation service for next region
        logger.collect(logContext, 'Using setlist navigation service for next region');
        const success = await setlistNavigationService.navigateToNext();
        
        if (success) {
          logger.collect(logContext, 'Successfully navigated to next region/setlist item');
        } else {
          logger.collect(logContext, 'No next region/setlist item found or navigation failed');
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
        
        // Use the shared setlist navigation service for previous region
        logger.collect(logContext, 'Using setlist navigation service for previous region');
        const success = await setlistNavigationService.navigateToPrevious();
        
        if (success) {
          logger.collect(logContext, 'Successfully navigated to previous region/setlist item');
        } else {
          logger.collect(logContext, 'No previous region/setlist item found or navigation failed');
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
    
    // Handle refresh markers
    socket.on('refreshMarkers', async () => {
      try {
        await markerService.fetchMarkers();
      } catch (error) {
        logger.error('Error refreshing markers:', error);
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
    
    // Handle refresh project ID
    socket.on('refreshProjectId', async () => {
      try {
        const logContext = logger.startCollection('refreshProjectId-handler');
        logger.collect(logContext, 'Refresh project ID requested');
        
        // Refresh the project ID
        const projectId = await projectService.refreshProjectId();
        logger.collect(logContext, 'Project ID refreshed:', projectId);
        
        // Send the project ID to the client
        socket.emit('projectId', projectId);
        logger.collect(logContext, 'Sent project ID to client');
        
        // Flush logs
        logger.flushLogs(logContext);
      } catch (error) {
        logger.error('Error refreshing project ID:', error);
      }
    });
    
    // Handle set selected setlist
    socket.on('setSelectedSetlist', async (setlistId) => {
      try {
        const logContext = logger.startCollection('setSelectedSetlist-handler');
        logger.collect(logContext, `Set selected setlist requested: ${setlistId || 'null (all regions)'}`);
        
        // Set the selected setlist
        await regionService.setSelectedSetlist(setlistId);
        logger.collect(logContext, 'Selected setlist set successfully');
        
        // Flush logs
        logger.flushLogs(logContext);
      } catch (error) {
        logger.error('Error setting selected setlist:', error);
      }
    });
  }
}

// Create and export a singleton instance
const socketService = new SocketService();
module.exports = socketService;