/**
 * IPC Channels
 * Defines the channels used for IPC communication between the renderer and main processes
 */

// From renderer to main
export const IPC_CHANNELS = {
  // Connection
  PING: 'ping',
  REPORT_CONNECTION_STATUS: 'report-connection-status',
  REQUEST_RECONNECT: 'request-reconnect',

  // Regions
  REFRESH_REGIONS: 'refresh-regions',
  GET_REGIONS: 'get-regions',

  // Markers
  REFRESH_MARKERS: 'refresh-markers',
  GET_MARKERS: 'get-markers',

  // Playback control
  TOGGLE_PLAY: 'toggle-play',
  PLAY_WITH_COUNT_IN: 'play-with-count-in',
  SEEK_TO_POSITION: 'seek-to-position',
  SEEK_TO_REGION: 'seek-to-region',
  NEXT_REGION: 'next-region',
  PREVIOUS_REGION: 'previous-region',
  SEEK_TO_CURRENT_REGION_START: 'seek-to-current-region-start',

  // Project
  REFRESH_PROJECT_ID: 'refresh-project-id',
  GET_PROJECT_ID: 'get-project-id',

  // Setlists
  GET_SETLISTS: 'get-setlists',
  GET_SETLIST: 'get-setlist',
  CREATE_SETLIST: 'create-setlist',
  UPDATE_SETLIST: 'update-setlist',
  DELETE_SETLIST: 'delete-setlist',
  ADD_SETLIST_ITEM: 'add-setlist-item',
  REMOVE_SETLIST_ITEM: 'remove-setlist-item',
  MOVE_SETLIST_ITEM: 'move-setlist-item',
  SET_SELECTED_SETLIST: 'set-selected-setlist',

  // MIDI
  GET_MIDI_DEVICES: 'get-midi-devices',
  GET_MIDI_CONFIG: 'get-midi-config',
  UPDATE_MIDI_CONFIG: 'update-midi-config',
  CONNECT_TO_MIDI_DEVICE: 'connect-to-midi-device',
  SIMULATE_MIDI_NOTE: 'simulate-midi-note'
};

// From main to renderer
export const IPC_EVENTS = {
  // Connection
  CONNECTION_CHANGE: 'connection-change',

  // Regions and markers
  REGIONS_UPDATE: 'regions-update',
  MARKERS_UPDATE: 'markers-update',

  // Playback
  PLAYBACK_STATE_UPDATE: 'playback-state-update',

  // Project
  PROJECT_ID_UPDATE: 'project-id-update',
  PROJECT_CHANGED: 'project-changed',

  // Setlists
  SETLISTS_UPDATE: 'setlists-update',
  SETLIST_UPDATE: 'setlist-update',

  // MIDI
  MIDI_ACTIVITY: 'midi-activity',

  // Status
  STATUS_MESSAGE: 'status-message',

  // System
  SYSTEM_STATS: 'system-stats'
};
