/**
 * IPC Service
 * Manages the Electron IPC communication and event handling
 */

import { IPC_CHANNELS, PING_CONFIG } from '../lib/config/ipcConfig';
import { isElectron } from '../lib/config/ipcConfig';
// We'll need to create a logger utility
import logger from '../lib/utils/logger';

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
  updateMarkers,
  setMidiActive
} from '../stores';

// Ping/pong mechanism variables
let pingInterval: NodeJS.Timeout | null = null;
let pingTimeout: NodeJS.Timeout | null = null;

// Project ID polling mechanism variables
let projectIdPollingInterval: NodeJS.Timeout | null = null;
let currentProjectId: string | null = null;

// Define interfaces for the data types
interface Region {
  id: string;
  name: string;
  start: number;
  end: number;
  color?: string;
}

interface Marker {
  id: string;
  name: string;
  position: number;
  color?: string;
}

interface PlaybackState {
  isPlaying: boolean;
  position: number;
  currentRegionId?: string;
  selectedSetlistId?: string | null;
  bpm?: number;
  timeSignature?: {
    numerator: number;
    denominator: number;
  };
  autoplayEnabled?: boolean;
  countInEnabled?: boolean;
}

interface StatusMessage {
  type: 'info' | 'error' | 'warning';
  message: string;
  timestamp: number;
  details?: string;
}

interface ReaperConfig {
  host: string;
  port: number;
  protocol: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  connectionTimeout: number;
  pollingInterval: number;
}

interface IpcControl {
  refreshRegions: () => Promise<Region[]>;
  seekToPosition: (position: number, useCountIn?: boolean) => Promise<void>;
  togglePlay: () => Promise<void>;
  playWithCountIn: () => Promise<void>;
  seekToRegion: (regionId: string) => Promise<void>;
  nextRegion: () => Promise<boolean>;
  previousRegion: () => Promise<boolean>;
  seekToCurrentRegionStart: () => Promise<void>;
  refreshProjectId: () => Promise<string>;
  getProjectId: () => Promise<string>;
  refreshMarkers: () => Promise<Marker[]>;
  setAutoplayEnabled: (enabled: boolean) => Promise<void>;
  setCountInEnabled: (enabled: boolean) => Promise<void>;
  setRecordingArmed: (enabled: boolean) => Promise<void>;
  setSelectedSetlist: (setlistId: string | null) => Promise<void>;
  getReaperConfig: () => Promise<ReaperConfig>;
  updateReaperConfig: (config: Partial<ReaperConfig>) => Promise<boolean>;
  getMidiConfig: () => Promise<any>;
  updateMidiConfig: (config: any) => Promise<void>;
  getMidiDevices: () => Promise<any[]>;
  connectToMidiDevice: (deviceName: string) => Promise<boolean>;
  simulateMidiNote: (note: number, velocity?: number, channel?: number) => Promise<void>;
  disconnect: () => void;
}

/**
 * Initializes the IPC communication
 * @returns IPC control interface
 */
function initialize(): IpcControl {
  // Check if we're in an Electron environment
  if (!isElectron()) {
    return createDefaultIpcControl();
  }

  // Report initial connection attempt to Electron main process
  window.electronAPI.reportConnectionStatus({
    connected: false,
    reason: 'initializing',
    status: 'Initializing connection to backend'
  });

  // Set up event listeners
  setupEventListeners();

  // Start ping interval
  startPingInterval();

  // Start project ID polling to regularly check for changes
  startProjectIdPolling();

  // Return the IPC control interface
  return createIpcControl();
}

/**
 * Sets up event listeners for IPC events
 */
function setupEventListeners(): void {
  // Register event listeners using the exposed electronAPI
  setupRegionAndPlaybackListeners();

  window.electronAPI.onStatusMessage(handleStatusMessage);
  window.electronAPI.onProjectIdUpdate(handleProjectIdUpdate);
  window.electronAPI.onProjectChanged(handleProjectChanged);
  window.electronAPI.onMidiActivity(handleMidiActivity);
  window.electronAPI.onConnectionChange(handleConnectionChange);

  // Refresh regions immediately
  setTimeout(() => {
    window.electronAPI.refreshRegions();
  }, 500);
}

/**
 * Sets up event listeners specifically for regions and playback state
 * This function can be called after cleanup to reinitialize these listeners
 */
export function setupRegionAndPlaybackListeners(): void {
  if (window.electronAPI) {
    window.electronAPI.onRegionsUpdate(handleRegionsUpdate);
    window.electronAPI.onMarkersUpdate(handleMarkersUpdate);
    window.electronAPI.onPlaybackStateUpdate(handlePlaybackStateUpdate);
  }
}

/**
 * Starts the ping interval for connection monitoring
 */
function startPingInterval(): void {
  // Clear any existing interval
  if (pingInterval) clearInterval(pingInterval);

  // Start new ping interval
  pingInterval = setInterval(() => {
    const startTime = Date.now();

    // Set a timeout for ping response
    if (pingTimeout) clearTimeout(pingTimeout);
    pingTimeout = setTimeout(() => {
      logger.warn('Ping timeout - no response from main process');
      setConnectionError('Ping timeout');
    }, PING_CONFIG.timeout);

    // Send ping and wait for pong
    window.electronAPI.ping().then(() => {
      if (pingTimeout) clearTimeout(pingTimeout);
      const latency = Date.now() - startTime;
      updatePingInfo(latency);
    });
  }, PING_CONFIG.interval);
}

/**
 * Starts polling for project ID changes
 * This regularly checks if the project ID has changed without waiting for events
 */
function startProjectIdPolling(): void {
  // Store the current project ID initially
  window.electronAPI.getProjectId().then((projectId) => {
    currentProjectId = projectId;
    logger.debug('Initial project ID stored for polling:', { projectId });
  });

  // Clear any existing interval
  if (projectIdPollingInterval) clearInterval(projectIdPollingInterval);

  // Start new polling interval (check every 3 seconds)
  projectIdPollingInterval = setInterval(async () => {
    try {
      // Fetch the current project ID from Reaper
      const latestProjectId = await window.electronAPI.refreshProjectId();

      // If we have no stored ID yet, just store it
      if (currentProjectId === null) {
        currentProjectId = latestProjectId;
        return;
      }

      // If project ID has changed, handle it
      if (latestProjectId !== currentProjectId) {
        logger.info('Project ID change detected through polling', {
          previous: currentProjectId,
          current: latestProjectId
        });

        // Update the stored project ID
        currentProjectId = latestProjectId;

        // Create an info message to notify the user
        createInfoMessage('Reaper project changed');
      }
    } catch (error) {
      logger.error('Error during project ID polling:', error);
    }
  }, 3000); // Poll every 3 seconds
}

/**
 * Stops the ping interval
 */
function stopPingInterval(): void {
  if (pingInterval) clearInterval(pingInterval);
  if (pingTimeout) clearTimeout(pingTimeout);
}

/**
 * Stops the project ID polling interval
 */
function stopProjectIdPolling(): void {
  if (projectIdPollingInterval) {
    clearInterval(projectIdPollingInterval);
    projectIdPollingInterval = null;
  }
}

/**
 * Handles connection status changes
 */
function handleConnectionChange(status: { connected: boolean; reason?: string; status?: string; pingLatency?: number }): void {
  if (status.connected) {
    setConnected();
  } else {
    setDisconnected();
  }

  // Update ping info if available
  if (status.pingLatency) {
    updatePingInfo(status.pingLatency);
  }
}

/**
 * Handles the regions update event
 */
function handleRegionsUpdate(data: Region[]): void {
  updateRegions(data);
}

/**
 * Handles the markers update event
 */
function handleMarkersUpdate(data: Marker[]): void {
  updateMarkers(data);
}

/**
 * Handles the playback state update event
 */
function handlePlaybackStateUpdate(data: PlaybackState): void {
  // Check for missing required fields
  if (data === undefined || data === null) {
    logger.error('Received playback state is null or undefined');
    return;
  }

  // Validate required fields and log any missing ones
  const missingFields = [];
  if (data.isPlaying === undefined) missingFields.push('isPlaying');
  if (data.position === undefined) missingFields.push('position');

  if (missingFields.length > 0) {
    logger.error(`Received playback state is missing required fields: ${missingFields.join(', ')}`, data);
  }

  // Map the fields to match what the frontend expects with robust defaults
  const mappedData = {
    // For boolean values, explicitly convert to boolean with !! to handle undefined
    isPlaying: data.isPlaying !== undefined ? Boolean(data.isPlaying) : false,

    // For numeric values, use Number() with || to handle NaN, undefined, etc.
    currentPosition: data.position !== undefined ? Number(data.position) : 0,

    // For currentRegionId, first check if it exists, then convert to number or null
    currentRegionId: data.currentRegionId !== undefined ?
      (data.currentRegionId === null ? null : Number(data.currentRegionId)) : null,

    // For selectedSetlistId, explicitly check for undefined to preserve null values
    selectedSetlistId: data.selectedSetlistId !== undefined ? data.selectedSetlistId : null,

    // For bpm, ensure we don't convert 0 to the default value
    bpm: data.bpm !== undefined ? Number(data.bpm) : 120,

    // For timeSignature, check if it exists and has required properties
    timeSignature: (data.timeSignature &&
      typeof data.timeSignature.numerator === 'number' &&
      typeof data.timeSignature.denominator === 'number') ?
      data.timeSignature : { numerator: 4, denominator: 4 },

    // For autoplayEnabled and countInEnabled, explicitly convert to boolean with default values
    autoplayEnabled: data.autoplayEnabled !== undefined ? Boolean(data.autoplayEnabled) : true,
    countInEnabled: data.countInEnabled !== undefined ? Boolean(data.countInEnabled) : false,
    isRecordingArmed: data.isRecordingArmed !== undefined ? Boolean(data.isRecordingArmed) : false,
  };

  // Update the playback state with the mapped data
  const result = updatePlaybackState(mappedData);

  // Log the result of the update
  if (!result) {
    logger.error('Failed to update playback state with mapped data:', mappedData);
  }
}

/**
 * Handles the status message event
 */
function handleStatusMessage(data: StatusMessage): void {
  setStatusMessage(data);
}

/**
 * Handles the project ID update event
 */
function handleProjectIdUpdate(data: string): void {
  updateProjectId(data);
}

/**
 * Handles the project changed event
 */
function handleProjectChanged(projectId: string): void {
  updateProjectId(projectId);

  // Refresh regions for the new project
  setTimeout(() => {
    window.electronAPI.refreshRegions();
  }, 500);
}

/**
 * Handles the MIDI activity event
 */
function handleMidiActivity(): void {
  setMidiActive();
}

/**
 * Cleanup function for region and playback event listeners
 * Removes listeners for regions, markers, and playback state updates
 */
export function cleanupRegionAndPlaybackListeners(): void {
  if (window.electronAPI) {
    window.electronAPI.removeAllListeners(IPC_CHANNELS.REGIONS_UPDATE);
    window.electronAPI.removeAllListeners(IPC_CHANNELS.MARKERS_UPDATE);
    window.electronAPI.removeAllListeners(IPC_CHANNELS.PLAYBACK_STATE_UPDATE);
  }
}

/**
 * Safely execute an IPC call with error handling
 * @param operation - Description of the operation for logging
 * @param ipcCall - The IPC function to call
 * @param fallbackValue - Value to return if the call fails
 * @returns Promise resolving to the result of the IPC call or fallback value
 */
async function safeIpcCall<T>(
  operation: string,
  ipcCall: () => Promise<T>,
  fallbackValue: T
): Promise<T> {
  try {
    return await ipcCall();
  } catch (error) {
    logger.error(`Error during ${operation}:`, error);
    createErrorMessage(`Failed to ${operation.toLowerCase()}`);
    return fallbackValue;
  }
}

/**
 * Creates the IPC control interface with improved error handling
 */
function createIpcControl(): IpcControl {
  return {
    refreshRegions: () =>
      safeIpcCall('refresh regions', () => window.electronAPI.refreshRegions(), []),

    seekToPosition: (position: number, useCountIn: boolean = false) =>
      safeIpcCall('seek to position',
        () => window.electronAPI.seekToPosition(position.toString(), useCountIn),
        void 0),

    togglePlay: () =>
      safeIpcCall('toggle playback', () => window.electronAPI.togglePlay(), void 0),

    playWithCountIn: () =>
      safeIpcCall('play with count-in', () => window.electronAPI.playWithCountIn(), void 0),

    seekToRegion: (regionId: string, autoplay: boolean = true, countIn: null|boolean = null) =>
      safeIpcCall('seek to region', () => window.electronAPI.seekToRegion(regionId, autoplay, countIn), void 0),

    nextRegion: async () => {
      const result = await safeIpcCall('go to next region',
        () => window.electronAPI.nextRegion(),
        { success: false });
      return result.success;
    },

    previousRegion: async () => {
      const result = await safeIpcCall('go to previous region',
        () => window.electronAPI.previousRegion(),
        { success: false });
      return result.success;
    },

    seekToCurrentRegionStart: () =>
      safeIpcCall('seek to current region start',
        () => window.electronAPI.seekToCurrentRegionStart(),
        void 0),

    refreshProjectId: () =>
      safeIpcCall('refresh project ID', () => window.electronAPI.refreshProjectId(), ''),

    getProjectId: () =>
      safeIpcCall('get project ID', () => window.electronAPI.getProjectId(), ''),

    refreshMarkers: () =>
      safeIpcCall('refresh markers', () => window.electronAPI.refreshMarkers(), []),

    setAutoplayEnabled: (enabled: boolean) =>
      safeIpcCall('set autoplay mode',
        () => window.electronAPI.setAutoplayEnabled(enabled),
        void 0),

    setCountInEnabled: (enabled: boolean) =>
      safeIpcCall('set count-in mode',
        () => window.electronAPI.setCountInEnabled(enabled),
        void 0),

    setRecordingArmed: (enabled: boolean) =>
      safeIpcCall('set recording armed mode',
        () => window.electronAPI.setRecordingArmed(enabled),
        void 0),

    setSelectedSetlist: (setlistId: string | null) =>
      safeIpcCall('set selected setlist',
        () => window.electronAPI.setSelectedSetlist(setlistId),
        void 0),

    getReaperConfig: () =>
      safeIpcCall('get Reaper configuration',
        () => window.electronAPI.getReaperConfig(),
        {
          host: 'localhost',
          port: 8080,
          protocol: 'http',
          reconnectInterval: 5000,
          maxReconnectAttempts: 10,
          connectionTimeout: 3000,
          pollingInterval: 1000
        }),

    updateReaperConfig: (config: Partial<ReaperConfig>) =>
      safeIpcCall('update Reaper configuration',
        () => window.electronAPI.updateReaperConfig(config),
        false),

    getMidiConfig: async () => {
      const config = await safeIpcCall('get MIDI configuration',
        () => window.electronAPI.getMidiConfig(),
        {
          enabled: true,
          channel: null,
          noteMappings: []
        });

      // Ensure noteMappings is always an array
      if (!config.noteMappings) {
        config.noteMappings = [];
      }

      // If we have a noteMapping object but empty noteMappings array, convert it
      if (config.noteMapping && typeof config.noteMapping === 'object' && config.noteMappings.length === 0) {
        config.noteMappings = Object.entries(config.noteMapping).map(([noteStr, action]) => {
          const noteNumber = parseInt(noteStr, 10);
          return {
            noteNumber,
            action: action as string
          };
        });
      }

      return config;
    },

    updateMidiConfig: (config: any) =>
      safeIpcCall('update MIDI configuration',
        () => window.electronAPI.updateMidiConfig(config),
        void 0),

    getMidiDevices: () =>
      safeIpcCall('get MIDI devices',
        () => window.electronAPI.getMidiDevices(),
        []),

    connectToMidiDevice: (deviceName: string) =>
      safeIpcCall('connect to MIDI device',
        () => window.electronAPI.connectToMidiDevice(deviceName),
        false),

    simulateMidiNote: (note: number, velocity: number = 127, channel: number = 0) =>
      safeIpcCall('simulate MIDI note',
        () => window.electronAPI.simulateMidiNote({ note, velocity, channel }),
        void 0),

    disconnect: () => {
      try {
        // Clean up resources
        stopPingInterval();

        // Stop project ID polling
        stopProjectIdPolling();

        // First clean up region and playback listeners using the existing function
        cleanupRegionAndPlaybackListeners();

        // Remove additional event listeners not covered by the cleanup function
        if (window.electronAPI) {
          window.electronAPI.removeAllListeners(IPC_CHANNELS.STATUS_MESSAGE);
          window.electronAPI.removeAllListeners(IPC_CHANNELS.PROJECT_ID_UPDATE);
          window.electronAPI.removeAllListeners(IPC_CHANNELS.PROJECT_CHANGED);
          window.electronAPI.removeAllListeners(IPC_CHANNELS.MIDI_ACTIVITY);
          window.electronAPI.removeAllListeners(IPC_CHANNELS.CONNECTION_CHANGE);
        }
      } catch (error) {
        logger.error('Error during disconnect:', error);
      }
    }
  };
}

/**
 * Creates a default IPC control interface for non-Electron environments
 */
function createDefaultIpcControl(): IpcControl {
  return {
    refreshRegions: () => Promise.resolve([]),
    seekToPosition: (position: number, useCountIn: boolean = false) => Promise.resolve(),
    togglePlay: () => Promise.resolve(),
    playWithCountIn: () => Promise.resolve(),
    seekToRegion: () => Promise.resolve(),
    nextRegion: () => Promise.resolve(false),
    previousRegion: () => Promise.resolve(false),
    seekToCurrentRegionStart: () => Promise.resolve(),
    refreshProjectId: () => Promise.resolve(''),
    getProjectId: () => Promise.resolve(''),
    refreshMarkers: () => Promise.resolve([]),
    setAutoplayEnabled: (enabled: boolean) => Promise.resolve(),
    setCountInEnabled: (enabled: boolean) => Promise.resolve(),
    setRecordingArmed: (enabled: boolean) => Promise.resolve(),
    setSelectedSetlist: (setlistId: string | null) => Promise.resolve(),
    getReaperConfig: () => Promise.resolve({
      host: 'localhost',
      port: 8080,
      protocol: 'http',
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      connectionTimeout: 3000,
      pollingInterval: 1000
    }),
    updateReaperConfig: (config: Partial<ReaperConfig>) => Promise.resolve(true),
    getMidiConfig: () => Promise.resolve({
      enabled: true,
      channel: null,
      noteMappings: []
    }),
    updateMidiConfig: (config: any) => Promise.resolve(),
    getMidiDevices: () => Promise.resolve([]),
    connectToMidiDevice: (deviceName: string) => Promise.resolve(false),
    simulateMidiNote: (note: number, velocity?: number, channel?: number) => Promise.resolve(),
    disconnect: () => {}
  };
}

// Initialize the IPC service
const ipcService = initialize();

// Export the IPC service
export default ipcService;
