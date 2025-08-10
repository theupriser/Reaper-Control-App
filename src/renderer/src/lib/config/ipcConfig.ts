/**
 * IPC Configuration
 * Contains all configuration related to the Electron IPC communication
 */

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
 * IPC Channel names for communication between renderer and main process
 */
export const IPC_CHANNELS = {
  // Connection status
  CONNECTION_STATUS: 'connection-status',
  CONNECTION_CHANGE: 'connection-change',

  // Regions
  REGIONS_UPDATE: 'regions-update',
  REFRESH_REGIONS: 'refresh-regions',
  GET_REGIONS: 'get-regions',

  // Markers
  MARKERS_UPDATE: 'markers-update',

  // Playback
  PLAYBACK_STATE_UPDATE: 'playback-state-update',
  TOGGLE_PLAY: 'toggle-play',
  SEEK_TO_POSITION: 'seek-to-position',
  SEEK_TO_REGION: 'seek-to-region',
  NEXT_REGION: 'next-region',
  PREVIOUS_REGION: 'previous-region',
  SEEK_TO_CURRENT_REGION_START: 'seek-to-current-region-start',
  SET_AUTOPLAY_ENABLED: 'set-autoplay-enabled',
  SET_COUNT_IN_ENABLED: 'set-count-in-enabled',

  // Project
  PROJECT_ID_UPDATE: 'project-id-update',
  PROJECT_CHANGED: 'project-changed',
  REFRESH_PROJECT_ID: 'refresh-project-id',
  GET_PROJECT_ID: 'get-project-id',

  // MIDI
  MIDI_ACTIVITY: 'midi-activity',

  // System
  SYSTEM_STATS: 'system-stats',

  // Configuration
  GET_REAPER_CONFIG: 'get-reaper-config',
  UPDATE_REAPER_CONFIG: 'update-reaper-config',

  // Ping/Pong
  PING: 'ping'
};

/**
 * Check if code is running in Electron environment
 * @returns {boolean} True if running in Electron
 */
export const isElectron = (): boolean => {
  return window && window.electronAPI !== undefined;
};
