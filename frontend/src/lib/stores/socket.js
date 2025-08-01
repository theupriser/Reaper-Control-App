import { io } from 'socket.io-client';
import { writable, derived } from 'svelte/store';

// Backend server URL - Check if window is defined to handle SSR
// When running in Docker, we need to use the service name 'backend' instead of window.location.hostname
const SOCKET_URL = typeof window !== 'undefined' 
  ? window.location.hostname === 'localhost' 
    ? `http://localhost:3000` 
    : `http://backend:3000` // Use Docker service name when not on localhost
  : 'http://localhost:3000'; // Fallback for server-side rendering

// Create stores for regions and playback state
export const regions = writable([]);
export const playbackState = writable({
  isPlaying: false,
  currentPosition: 0,
  currentRegionId: null
});

// Create a store for status messages
export const statusMessage = writable(null);

// Create a store for connection status
export const connectionStatus = writable({
  connected: false,
  lastPing: null,
  pingLatency: null,
  reconnecting: false,
  reconnectAttempt: 0,
  lastError: null
});

// Create a derived store for the current region
export const currentRegion = derived(
  [regions, playbackState],
  ([$regions, $playbackState]) => {
    if (!$playbackState.currentRegionId) return null;
    return $regions.find(region => region.id === $playbackState.currentRegionId);
  }
);

// Initialize Socket.IO connection
let socket;
let defaultSocketControl = {
  togglePlay: () => console.warn('Socket not initialized'),
  seekToRegion: () => console.warn('Socket not initialized'),
  nextRegion: () => console.warn('Socket not initialized'),
  previousRegion: () => console.warn('Socket not initialized'),
  seekToCurrentRegionStart: () => console.warn('Socket not initialized'),
  refreshRegions: () => console.warn('Socket not initialized'),
  disconnect: () => console.warn('Socket not initialized')
};

// Only initialize socket in browser environment
function createSocketConnection() {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    console.log('Running in SSR environment, skipping socket initialization');
    return defaultSocketControl;
  }
  
  console.log('Initializing socket connection to:', SOCKET_URL);
  
  // Create the socket connection with additional options for better reliability
  socket = io(SOCKET_URL, {
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
    transports: ['websocket', 'polling']
  });
  
  // Set up ping/pong mechanism for connection monitoring
  let pingInterval;
  let pingTimeout;
  const PING_INTERVAL = 10000; // 10 seconds
  const PING_TIMEOUT = 5000;   // 5 seconds
  
  function startPingInterval() {
    // Clear any existing interval
    if (pingInterval) clearInterval(pingInterval);
    
    // Start new ping interval
    pingInterval = setInterval(() => {
      if (socket.connected) {
        const startTime = Date.now();
        
        // Set a timeout for ping response
        if (pingTimeout) clearTimeout(pingTimeout);
        pingTimeout = setTimeout(() => {
          console.warn('Ping timeout - no response from server');
          connectionStatus.update(status => ({
            ...status,
            pingLatency: null,
            lastError: 'Ping timeout'
          }));
        }, PING_TIMEOUT);
        
        // Send ping and wait for pong
        socket.emit('ping', () => {
          if (pingTimeout) clearTimeout(pingTimeout);
          const latency = Date.now() - startTime;
          console.log(`Received pong from server (latency: ${latency}ms)`);
          
          connectionStatus.update(status => ({
            ...status,
            lastPing: new Date(),
            pingLatency: latency
          }));
        });
      }
    }, PING_INTERVAL);
  }
  
  function stopPingInterval() {
    if (pingInterval) clearInterval(pingInterval);
    if (pingTimeout) clearTimeout(pingTimeout);
  }

  // Set up event listeners with enhanced logging
  socket.on('connect', () => {
    console.log('Connected to backend server:', SOCKET_URL);
    console.log('Socket ID:', socket.id);
    
    // Update connection status
    connectionStatus.set({
      connected: true,
      lastPing: null,
      pingLatency: null,
      reconnecting: false,
      reconnectAttempt: 0,
      lastError: null
    });
    
    // Start ping interval
    startPingInterval();
    
    // Refresh regions immediately after connection
    setTimeout(() => {
      console.log('Refreshing regions after connection...');
      socket.emit('refreshRegions');
    }, 500);
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from backend server');
    
    // Update connection status
    connectionStatus.update(status => ({
      ...status,
      connected: false
    }));
    
    // Stop ping interval
    stopPingInterval();
  });
  
  socket.on('reconnect', (attemptNumber) => {
    console.log(`Reconnected to backend server after ${attemptNumber} attempts`);
    
    // Update connection status
    connectionStatus.update(status => ({
      ...status,
      connected: true,
      reconnecting: false,
      reconnectAttempt: 0
    }));
    
    // Restart ping interval
    startPingInterval();
    
    // Refresh regions after reconnection
    setTimeout(() => {
      console.log('Refreshing regions after reconnection...');
      socket.emit('refreshRegions');
    }, 500);
  });
  
  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log(`Attempting to reconnect to backend server (attempt ${attemptNumber})`);
    
    // Update connection status
    connectionStatus.update(status => ({
      ...status,
      reconnecting: true,
      reconnectAttempt: attemptNumber
    }));
  });
  
  socket.on('reconnect_error', (error) => {
    console.error('Error while reconnecting:', error);
    
    // Update connection status
    connectionStatus.update(status => ({
      ...status,
      lastError: error.message || 'Reconnection error'
    }));
  });
  
  socket.on('reconnect_failed', () => {
    console.error('Failed to reconnect to backend server after multiple attempts');
    
    // Update connection status
    connectionStatus.update(status => ({
      ...status,
      reconnecting: false,
      lastError: 'Failed to reconnect after multiple attempts'
    }));
    
    statusMessage.set({
      type: 'error',
      message: 'Connection to server lost',
      details: 'Unable to reconnect to the backend server. Please check if the server is running and refresh the page.'
    });
  });
  
  // Listen for regions updates with enhanced error handling
  socket.on('regions', (data) => {
    console.log('Received regions from server:', data);
    console.log('Regions count:', data ? data.length : 0);
    
    try {
      // Validate the data
      if (!data) {
        console.warn('No regions data received from server');
        regions.set([]);
        return;
      }
      
      // Ensure data is an array
      if (!Array.isArray(data)) {
        console.error('Received regions data is not an array:', data);
        regions.set([]);
        return;
      }
      
      // Log the first region for debugging
      if (data.length > 0) {
        console.log('First region:', data[0]);
        
        // Validate region structure
        const firstRegion = data[0];
        if (!firstRegion.id || !firstRegion.name || firstRegion.start === undefined || firstRegion.end === undefined) {
          console.warn('Region data may be malformed:', firstRegion);
        }
      } else {
        console.warn('No regions received from server (empty array)');
      }
      
      // Update the regions store
      regions.set(data);
      
      // Automatically select the first region if there are regions and none is currently selected
      if (data.length > 0) {
        // Get current playback state to check if a region is already selected
        let currentPlaybackState;
        const unsubscribe = playbackState.subscribe(state => {
          currentPlaybackState = state;
        });
        unsubscribe(); // Immediately unsubscribe after getting the value
        
        if (!currentPlaybackState.currentRegionId) {
          console.log('Automatically selecting first region:', data[0].id);
          // Update playback state to select the first region
          playbackState.update(state => ({
            ...state,
            currentRegionId: data[0].id
          }));
          
          // Emit event to server to seek to this region
          socket.emit('seekToRegion', data[0].id);
        }
      }
      
      // Log success
      console.log('Successfully updated regions store with', data.length, 'regions');
    } catch (error) {
      console.error('Error processing regions data:', error);
      regions.set([]);
    }
  });
  
  // Listen for playback state updates with enhanced error handling
  socket.on('playbackState', (data) => {
    console.log('Received playback state from server:', data);
    
    try {
      // Validate the data
      if (!data) {
        console.warn('No playback state received from server');
        return;
      }
      
      // Ensure required fields are present
      if (data.isPlaying === undefined || data.currentPosition === undefined) {
        console.error('Received playback state is missing required fields:', data);
        return;
      }
      
      // Update the playback state store
      playbackState.set({
        isPlaying: Boolean(data.isPlaying),
        currentPosition: Number(data.currentPosition) || 0,
        currentRegionId: data.currentRegionId !== undefined ? Number(data.currentRegionId) : null
      });
      
      // Log success
      console.log('Successfully updated playback state store:', {
        isPlaying: Boolean(data.isPlaying),
        currentPosition: Number(data.currentPosition) || 0,
        currentRegionId: data.currentRegionId !== undefined ? Number(data.currentRegionId) : null
      });
    } catch (error) {
      console.error('Error processing playback state data:', error);
    }
  });
  
  // Listen for status messages
  socket.on('status', (data) => {
    console.log('Received status message from server:', data);
    statusMessage.set(data);
    
    // Clear status message after 10 seconds if it's a warning
    if (data && data.type === 'warning') {
      setTimeout(() => {
        statusMessage.update(current => {
          // Only clear if it's the same message (to avoid clearing newer messages)
          if (current && current.message === data.message) {
            return null;
          }
          return current;
        });
      }, 10000);
    }
  });
  
  // Add error event listener
  socket.on('connect_error', (error) => {
    console.error('Socket.IO connection error:', error);
    statusMessage.set({
      type: 'error',
      message: 'Failed to connect to server',
      details: error.message
    });
  });
  
  socket.on('error', (error) => {
    console.error('Socket.IO error:', error);
    statusMessage.set({
      type: 'error',
      message: 'Socket.IO error',
      details: error.toString()
    });
  });
  
  return {
    // Transport controls with enhanced feedback and error handling
    togglePlay: () => {
      console.log('Sending togglePlay command');
      try {
        socket.emit('togglePlay');
        // Provide immediate feedback by updating the playback state
        // This will be overridden by the next server update
        playbackState.update(state => ({
          ...state,
          isPlaying: !state.isPlaying
        }));
      } catch (error) {
        console.error('Error sending togglePlay command:', error);
        statusMessage.set({
          type: 'error',
          message: 'Failed to toggle playback',
          details: 'There was an error communicating with the server. Please try again.'
        });
      }
    },
    
    // Region navigation with enhanced feedback and error handling
    seekToRegion: (regionId) => {
      console.log('Sending seekToRegion command for region ID:', regionId);
      try {
        if (regionId === undefined || regionId === null) {
          console.error('Invalid region ID:', regionId);
          return;
        }
        
        socket.emit('seekToRegion', regionId);
        
        // Provide immediate feedback by updating the playback state
        // This will be overridden by the next server update
        playbackState.update(state => ({
          ...state,
          currentRegionId: regionId
        }));
      } catch (error) {
        console.error('Error sending seekToRegion command:', error);
        statusMessage.set({
          type: 'error',
          message: 'Failed to seek to region',
          details: 'There was an error communicating with the server. Please try again.'
        });
      }
    },
    
    nextRegion: () => {
      console.log('Sending nextRegion command');
      try {
        socket.emit('nextRegion');
      } catch (error) {
        console.error('Error sending nextRegion command:', error);
        statusMessage.set({
          type: 'error',
          message: 'Failed to go to next region',
          details: 'There was an error communicating with the server. Please try again.'
        });
      }
    },
    
    previousRegion: () => {
      console.log('Sending previousRegion command');
      try {
        socket.emit('previousRegion');
      } catch (error) {
        console.error('Error sending previousRegion command:', error);
        statusMessage.set({
          type: 'error',
          message: 'Failed to go to previous region',
          details: 'There was an error communicating with the server. Please try again.'
        });
      }
    },
    
    seekToCurrentRegionStart: () => {
      console.log('Sending seekToCurrentRegionStart command');
      try {
        socket.emit('seekToCurrentRegionStart');
      } catch (error) {
        console.error('Error sending seekToCurrentRegionStart command:', error);
        statusMessage.set({
          type: 'error',
          message: 'Failed to restart current region',
          details: 'There was an error communicating with the server. Please try again.'
        });
      }
    },
    
    // Refresh regions with enhanced feedback and error handling
    refreshRegions: () => {
      console.log('Sending refreshRegions command');
      try {
        socket.emit('refreshRegions');
        
        // Show a temporary status message
        statusMessage.set({
          type: 'info',
          message: 'Refreshing regions...',
          details: 'Fetching the latest regions from Reaper.'
        });
        
        // Clear the status message after 2 seconds
        setTimeout(() => {
          statusMessage.update(current => {
            if (current && current.message === 'Refreshing regions...') {
              return null;
            }
            return current;
          });
        }, 2000);
      } catch (error) {
        console.error('Error sending refreshRegions command:', error);
        statusMessage.set({
          type: 'error',
          message: 'Failed to refresh regions',
          details: 'There was an error communicating with the server. Please try again.'
        });
      }
    },
    
    // Cleanup function
    disconnect: () => {
      if (socket) socket.disconnect();
    }
  };
}

// Export the socket connection and control functions
// Only initialize socket in browser environment to prevent SSR errors
export const socketControl = typeof window !== 'undefined' 
  ? createSocketConnection()
  : {
      togglePlay: () => console.warn('Socket not initialized - SSR mode'),
      seekToRegion: () => console.warn('Socket not initialized - SSR mode'),
      nextRegion: () => console.warn('Socket not initialized - SSR mode'),
      previousRegion: () => console.warn('Socket not initialized - SSR mode'),
      seekToCurrentRegionStart: () => console.warn('Socket not initialized - SSR mode'),
      refreshRegions: () => console.warn('Socket not initialized - SSR mode'),
      disconnect: () => console.warn('Socket not initialized - SSR mode')
    };