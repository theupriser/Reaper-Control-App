/**
 * Socket Service
 * Manages the Socket.IO connection and event handling
 */

import { io } from 'socket.io-client';
import { 
  SOCKET_URL, 
  SOCKET_OPTIONS, 
  PING_CONFIG, 
  isBrowser 
} from '../config/socketConfig';
import logger from '../utils/logger';

import {
  updateRegions,
  updatePlaybackState,
  setStatusMessage,
  createErrorMessage,
  createInfoMessage,
  setConnected,
  setDisconnected,
  setReconnecting,
  setReconnected,
  setConnectionError,
  updatePingInfo,
  updateProjectId,
  updateMarkers
} from '../stores';

// Socket instance
let socket = null;

// Ping/pong mechanism variables
let pingInterval = null;
let pingTimeout = null;

/**
 * Initializes the socket connection
 * @returns {Object} - Socket control interface
 */
function initialize() {
  // Check if we're in a browser environment
  if (!isBrowser()) {
    logger.log('Running in SSR environment, skipping socket initialization');
    return createDefaultSocketControl();
  }
  
  logger.log('Initializing socket connection to:', SOCKET_URL);
  
  // Create the socket connection
  socket = io(SOCKET_URL, SOCKET_OPTIONS);
  
  // Set up event listeners
  setupEventListeners();
  
  // Set up browser focus event handling for auto-reconnection
  setupBrowserFocusHandling();
  
  // Return the socket control interface
  return createSocketControl();
}

/**
 * Sets up event listeners for the socket
 */
function setupEventListeners() {
  // Connection events
  socket.on('connect', handleConnect);
  socket.on('disconnect', handleDisconnect);
  socket.on('reconnect', handleReconnect);
  socket.on('reconnect_attempt', handleReconnectAttempt);
  socket.on('reconnect_error', handleReconnectError);
  socket.on('reconnect_failed', handleReconnectFailed);
  socket.on('connect_error', handleConnectError);
  socket.on('error', handleError);
  
  // Data events
  socket.on('regions', handleRegionsUpdate);
  socket.on('markers', handleMarkersUpdate);
  socket.on('playbackState', handlePlaybackStateUpdate);
  socket.on('status', handleStatusMessage);
  socket.on('projectId', handleProjectIdUpdate);
  socket.on('projectChanged', handleProjectChanged);
}

/**
 * Sets up browser focus event handling for auto-reconnection
 */
function setupBrowserFocusHandling() {
  if (!isBrowser()) return;
  
  // Function to check connection and reconnect if needed
  const checkConnectionOnFocus = () => {
    const timestamp = new Date().toISOString();
    logger.log(`[${timestamp}] Browser window focused - checking socket connection`);
    
    if (socket && !socket.connected) {
      logger.log(`[${timestamp}] Socket is disconnected - attempting to reconnect`);
      
      // Update connection status
      setReconnecting(1);
      
      // Attempt to reconnect
      try {
        socket.connect();
        logger.log(`[${timestamp}] Reconnect attempt initiated`);
      } catch (error) {
        logger.error(`[${timestamp}] Error during reconnection attempt:`, error);
        setConnectionError(error.message || 'Error during reconnection');
      }
      
      // Show status message
      setStatusMessage({
        type: 'info',
        message: 'Reconnecting to server...',
        details: 'Attempting to reconnect after browser focus'
      });
    } else {
      logger.log(`[${timestamp}] Socket is already connected or not initialized`);
    }
  };
  
  // Add event listeners for window focus and visibility change
  window.addEventListener('focus', checkConnectionOnFocus);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const timestamp = new Date().toISOString();
      logger.log(`[${timestamp}] Document visibility changed to visible`);
      checkConnectionOnFocus();
    }
  });
  
  logger.log('Browser focus event handlers registered for auto-reconnection');
}

/**
 * Starts the ping interval for connection monitoring
 */
function startPingInterval() {
  // Clear any existing interval
  if (pingInterval) clearInterval(pingInterval);
  
  // Start new ping interval
  pingInterval = setInterval(() => {
    if (socket && socket.connected) {
      const startTime = Date.now();
      
      // Set a timeout for ping response
      if (pingTimeout) clearTimeout(pingTimeout);
      pingTimeout = setTimeout(() => {
        logger.warn('Ping timeout - no response from server');
        setConnectionError('Ping timeout');
      }, PING_CONFIG.timeout);
      
      // Send ping and wait for pong
      socket.emit('ping', () => {
        if (pingTimeout) clearTimeout(pingTimeout);
        const latency = Date.now() - startTime;
        logger.log(`Received pong from server (latency: ${latency}ms)`);
        
        updatePingInfo(latency);
      });
    }
  }, PING_CONFIG.interval);
}

/**
 * Stops the ping interval
 */
function stopPingInterval() {
  if (pingInterval) clearInterval(pingInterval);
  if (pingTimeout) clearTimeout(pingTimeout);
}

/**
 * Handles the connect event
 */
function handleConnect() {
  logger.log('Connected to backend server:', SOCKET_URL);
  logger.log('Socket ID:', socket.id);
  
  // Update connection status
  setConnected();
  
  // Start ping interval
  startPingInterval();
  
  // Refresh regions immediately after connection
  setTimeout(() => {
    logger.log('Refreshing regions after connection...');
    socket.emit('refreshRegions');
  }, 500);
}

/**
 * Handles the disconnect event
 */
function handleDisconnect() {
  logger.log('Disconnected from backend server');
  
  // Update connection status
  setDisconnected();
  
  // Stop ping interval
  stopPingInterval();
}

/**
 * Handles the reconnect event
 * @param {number} attemptNumber - The reconnection attempt number
 */
function handleReconnect(attemptNumber) {
  logger.log(`Reconnected to backend server after ${attemptNumber} attempts`);
  
  // Update connection status
  setReconnected();
  
  // Restart ping interval
  startPingInterval();
  
  // Refresh regions after reconnection
  setTimeout(() => {
    logger.log('Refreshing regions after reconnection...');
    socket.emit('refreshRegions');
  }, 500);
}

/**
 * Handles the reconnect_attempt event
 * @param {number} attemptNumber - The reconnection attempt number
 */
function handleReconnectAttempt(attemptNumber) {
  logger.log(`Attempting to reconnect to backend server (attempt ${attemptNumber})`);
  
  // Update connection status
  setReconnecting(attemptNumber);
}

/**
 * Handles the reconnect_error event
 * @param {Error} error - The reconnection error
 */
function handleReconnectError(error) {
  logger.error('Error while reconnecting:', error);
  
  // Update connection status
  setConnectionError(error.message || 'Reconnection error');
}

/**
 * Handles the reconnect_failed event
 */
function handleReconnectFailed() {
  logger.error('Failed to reconnect to backend server after multiple attempts');
  
  // Update connection status
  setConnectionError('Failed to reconnect after multiple attempts');
  
  // Show status message
  setStatusMessage({
    type: 'error',
    message: 'Connection to server lost',
    details: 'Unable to reconnect to the backend server. Please check if the server is running and refresh the page.'
  });
}

/**
 * Handles the connect_error event
 * @param {Error} error - The connection error
 */
function handleConnectError(error) {
  console.error('Socket.IO connection error:', error);
  
  // Show status message
  setStatusMessage({
    type: 'error',
    message: 'Failed to connect to server',
    details: error.message
  });
}

/**
 * Handles the error event
 * @param {Error} error - The socket error
 */
function handleError(error) {
  logger.error('Socket.IO error:', error);
  
  // Show status message
  setStatusMessage({
    type: 'error',
    message: 'Socket.IO error',
    details: error.toString()
  });
}

/**
 * Handles the regions update event
 * @param {Array} data - The regions data
 */
function handleRegionsUpdate(data) {
  logger.log('Received regions from server:', data);
  logger.log('Regions count:', data ? data.length : 0);
  
  // Update the regions store
  updateRegions(data);
}

/**
 * Handles the markers update event
 * @param {Array} data - The markers data
 */
function handleMarkersUpdate(data) {
  logger.log('Received markers from server:', data);
  logger.log('Markers count:', data ? data.length : 0);
  
  // Update the markers store
  updateMarkers(data);
}

/**
 * Handles the playback state update event
 * @param {Object} data - The playback state data
 */
function handlePlaybackStateUpdate(data) {
  logger.log('Received playback state from server:', data);
  
  // Update the playback state store
  updatePlaybackState(data);
}

/**
 * Handles the status message event
 * @param {Object} data - The status message data
 */
function handleStatusMessage(data) {
  logger.log('Received status message from server:', data);
  
  // Set the status message
  setStatusMessage(data);
}

/**
 * Handles the project ID update event
 * @param {string} data - The project ID
 */
function handleProjectIdUpdate(data) {
  logger.log('Received project ID from server:', data);
  
  // Update the project ID store
  updateProjectId(data);
  
  // Show status message
  setStatusMessage(createInfoMessage(
    'Project identified',
    `Connected to project with ID: ${data.substring(0, 8)}...`
  ));
}

/**
 * Handles the project changed event (when switching tabs in Reaper)
 * @param {string} projectId - The new project ID
 */
function handleProjectChanged(projectId) {
  logger.log('Project changed detected, new project ID:', projectId);
  
  // Update the project ID store
  updateProjectId(projectId);
  
  // Show status message
  setStatusMessage(createInfoMessage(
    'Project changed',
    `Switched to project with ID: ${projectId.substring(0, 8)}...`
  ));
  
  // Refresh regions for the new project
  setTimeout(() => {
    logger.log('Refreshing regions after project change...');
    socket.emit('refreshRegions');
  }, 500);
}

/**
 * Creates the default socket control interface for SSR
 * @returns {Object} - The default socket control interface
 */
function createDefaultSocketControl() {
  return {
    testReconnection: () => logger.warn('Socket not initialized - SSR mode'),
    seekToPosition: () => logger.warn('Socket not initialized - SSR mode'),
    togglePlay: () => logger.warn('Socket not initialized - SSR mode'),
    seekToRegion: () => logger.warn('Socket not initialized - SSR mode'),
    nextRegion: () => logger.warn('Socket not initialized - SSR mode'),
    previousRegion: () => logger.warn('Socket not initialized - SSR mode'),
    seekToCurrentRegionStart: () => logger.warn('Socket not initialized - SSR mode'),
    refreshRegions: () => logger.warn('Socket not initialized - SSR mode'),
    disconnect: () => logger.warn('Socket not initialized - SSR mode'),
    emit: () => logger.warn('Socket not initialized - SSR mode'),
    isConnected: () => false
  };
}

/**
 * Creates the socket control interface
 * @returns {Object} - The socket control interface
 */
function createSocketControl() {
  return {
    /**
     * Tests the reconnection logic (for development only)
     */
    testReconnection: () => {
      logger.log('Testing reconnection logic');
      
      // Simulate a disconnection
      if (socket && socket.connected) {
        logger.log('Disconnecting socket for testing');
        socket.disconnect();
        
        // Update connection status
        setDisconnected();
        
        // Show status message
        setStatusMessage({
          type: 'warning',
          message: 'Disconnected for testing',
          details: 'Socket was disconnected for testing reconnection logic'
        });
        
        logger.log('Socket disconnected for testing. Focus the window to trigger reconnection.');
      } else {
        logger.log('Socket is already disconnected or not initialized');
      }
    },
    
    /**
     * Refresh the project ID
     */
    refreshProjectId: () => {
      if (socket) {
        logger.log('Requesting project ID refresh');
        socket.emit('refreshProjectId');
      }
    },
    
    /**
     * Emits an event to the server
     * @param {string} event - The event name
     * @param {*} data - The event data
     * @param {Function} [callback] - Optional callback function
     */
    emit: (event, data, callback) => {
      if (socket) {
        socket.emit(event, data, callback);
      }
    },
    
    /**
     * Checks if the socket is connected
     * @returns {boolean} - True if connected
     */
    isConnected: () => {
      return socket ? socket.connected : false;
    },
    
    /**
     * Disconnects the socket
     */
    disconnect: () => {
      if (socket) {
        socket.disconnect();
      }
    }
  };
}

// Initialize the socket service
const socketService = initialize();

// Export the socket service
export default socketService;