/**
 * Socket Configuration
 * Contains all configuration related to the Socket.IO connection
 */

/**
 * Backend server URL - Check if window is defined to handle SSR
 * When running in Docker, we need to use the service name 'backend' instead of window.location.hostname
 * When running in Electron, we always use localhost
 */
export const SOCKET_URL = typeof window !== 'undefined' 
  ? window.isElectronApp // Check if running in Electron
    ? `http://localhost:3000` // Always use localhost in Electron
    : window.location.hostname === 'localhost' 
      ? `http://localhost:3000` 
      : `http://backend:3000` // Use Docker service name when not on localhost
  : 'http://localhost:3000'; // Fallback for server-side rendering

/**
 * Socket.IO connection options
 */
export const SOCKET_OPTIONS = {
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 10000,
  transports: ['websocket', 'polling']
};

/**
 * Ping/Pong configuration
 */
export const PING_CONFIG = {
  interval: 10000, // 10 seconds
  timeout: 5000    // 5 seconds
};

/**
 * Default timeout values
 */
export const TIMEOUTS = {
  reconnect: 300,  // 300ms between actions during reconnect
  statusClear: 2000, // 2 seconds to clear status messages
  warningClear: 10000 // 10 seconds to clear warning messages
};

/**
 * Check if code is running in browser environment
 * @returns {boolean} True if running in browser
 */
export const isBrowser = () => typeof window !== 'undefined';