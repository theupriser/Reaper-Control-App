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
}

interface StatusMessage {
  type: 'info' | 'error' | 'warning';
  message: string;
  timestamp: number;
  details?: string;
}

interface IpcControl {
  refreshRegions: () => Promise<Region[]>;
  seekToPosition: (position: number) => Promise<void>;
  togglePlay: () => Promise<void>;
  seekToRegion: (regionId: string) => Promise<void>;
  nextRegion: () => Promise<void>;
  previousRegion: () => Promise<void>;
  seekToCurrentRegionStart: () => Promise<void>;
  refreshProjectId: () => Promise<string>;
  refreshMarkers: () => Promise<Marker[]>;
  disconnect: () => void;
}

/**
 * Initializes the IPC communication
 * @returns IPC control interface
 */
function initialize(): IpcControl {
  // Check if we're in an Electron environment
  if (!isElectron()) {
    logger.log('Not running in Electron environment, skipping IPC initialization');
    return createDefaultIpcControl();
  }

  logger.log('Initializing IPC communication with Electron main process');

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

  // Return the IPC control interface
  return createIpcControl();
}

/**
 * Sets up event listeners for IPC events
 */
function setupEventListeners(): void {
  // Register event listeners using the exposed electronAPI
  window.electronAPI.onRegionsUpdate(handleRegionsUpdate);
  window.electronAPI.onMarkersUpdate(handleMarkersUpdate);
  window.electronAPI.onPlaybackStateUpdate(handlePlaybackStateUpdate);
  window.electronAPI.onStatusMessage(handleStatusMessage);
  window.electronAPI.onProjectIdUpdate(handleProjectIdUpdate);
  window.electronAPI.onProjectChanged(handleProjectChanged);
  window.electronAPI.onMidiActivity(handleMidiActivity);
  window.electronAPI.onConnectionChange(handleConnectionChange);

  // Refresh regions immediately
  setTimeout(() => {
    logger.log('Initial regions refresh...');
    window.electronAPI.refreshRegions();
  }, 500);
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
      logger.log(`Received pong from main process (latency: ${latency}ms)`);

      updatePingInfo(latency);
    });
  }, PING_CONFIG.interval);
}

/**
 * Stops the ping interval
 */
function stopPingInterval(): void {
  if (pingInterval) clearInterval(pingInterval);
  if (pingTimeout) clearTimeout(pingTimeout);
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
  logger.log('Received regions update:', data);
  updateRegions(data);
}

/**
 * Handles the markers update event
 */
function handleMarkersUpdate(data: Marker[]): void {
  logger.log('Received markers update:', data);
  updateMarkers(data);
}

/**
 * Handles the playback state update event
 */
function handlePlaybackStateUpdate(data: PlaybackState): void {
  // Log the received data for debugging
  logger.log('Received playback state update:', data);

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
      data.timeSignature : { numerator: 4, denominator: 4 }
  };

  // Log the mapped data for debugging
  logger.log('Mapped playback state data:', mappedData);

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
  logger.log('Received status message:', data);
  setStatusMessage(data);
}

/**
 * Handles the project ID update event
 */
function handleProjectIdUpdate(data: string): void {
  logger.log('Received project ID update:', data);
  updateProjectId(data);
}

/**
 * Handles the project changed event
 */
function handleProjectChanged(projectId: string): void {
  logger.log('Project changed detected, new project ID:', projectId);
  updateProjectId(projectId);

  // Refresh regions for the new project
  setTimeout(() => {
    logger.log('Refreshing regions after project change...');
    window.electronAPI.refreshRegions();
  }, 500);
}

/**
 * Handles the MIDI activity event
 */
function handleMidiActivity(): void {
  logger.log('MIDI activity detected');
  setMidiActive();
}

/**
 * Creates the IPC control interface
 */
function createIpcControl(): IpcControl {
  return {
    refreshRegions: () => window.electronAPI.refreshRegions(),
    seekToPosition: (position: number) => window.electronAPI.seekToPosition(position),
    togglePlay: () => window.electronAPI.togglePlay(),
    seekToRegion: (regionId: string) => window.electronAPI.seekToRegion(regionId),
    nextRegion: () => window.electronAPI.nextRegion(),
    previousRegion: () => window.electronAPI.previousRegion(),
    seekToCurrentRegionStart: () => window.electronAPI.seekToCurrentRegionStart(),
    refreshProjectId: () => window.electronAPI.refreshProjectId(),
    refreshMarkers: () => window.electronAPI.refreshMarkers(),
    disconnect: () => {
      // Clean up resources
      stopPingInterval();

      // Remove all event listeners
      window.electronAPI.removeAllListeners(IPC_CHANNELS.REGIONS_UPDATE);
      window.electronAPI.removeAllListeners(IPC_CHANNELS.MARKERS_UPDATE);
      window.electronAPI.removeAllListeners(IPC_CHANNELS.PLAYBACK_STATE_UPDATE);
      window.electronAPI.removeAllListeners(IPC_CHANNELS.STATUS_MESSAGE);
      window.electronAPI.removeAllListeners(IPC_CHANNELS.PROJECT_ID_UPDATE);
      window.electronAPI.removeAllListeners(IPC_CHANNELS.PROJECT_CHANGED);
      window.electronAPI.removeAllListeners(IPC_CHANNELS.MIDI_ACTIVITY);
      window.electronAPI.removeAllListeners(IPC_CHANNELS.CONNECTION_CHANGE);
    }
  };
}

/**
 * Creates a default IPC control interface for non-Electron environments
 */
function createDefaultIpcControl(): IpcControl {
  return {
    refreshRegions: () => Promise.resolve([]),
    seekToPosition: () => Promise.resolve(),
    togglePlay: () => Promise.resolve(),
    seekToRegion: () => Promise.resolve(),
    nextRegion: () => Promise.resolve(),
    previousRegion: () => Promise.resolve(),
    seekToCurrentRegionStart: () => Promise.resolve(),
    refreshProjectId: () => Promise.resolve(''),
    refreshMarkers: () => Promise.resolve([]),
    disconnect: () => {}
  };
}

// Initialize the IPC service
const ipcService = initialize();

// Export the IPC service
export default ipcService;
