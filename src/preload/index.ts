import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Define types for status and data
interface ConnectionStatus {
  connected: boolean;
  reason?: string;
  status?: string;
  pingLatency?: number;
}

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
  bpm: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
  autoplayEnabled?: boolean;
  countInEnabled?: boolean;
  isRecordingArmed?: boolean;
}

interface StatusMessage {
  type: 'info' | 'error' | 'warning';
  message: string;
  timestamp: number;
  details?: string;
}

// Custom APIs for renderer
const api = {
  // Connection status
  reportConnectionStatus: (status: ConnectionStatus) => ipcRenderer.send('report-connection-status', status),

  // Regions management
  refreshRegions: () => ipcRenderer.invoke('refresh-regions'),
  getRegions: () => ipcRenderer.invoke('get-regions'),

  // Markers management
  refreshMarkers: () => ipcRenderer.invoke('refresh-markers'),

  // Playback control
  togglePlay: () => ipcRenderer.invoke('toggle-play'),
  playWithCountIn: () => ipcRenderer.invoke('play-with-count-in'),
  seekToPosition: (position: string, useCountIn: boolean = false) => ipcRenderer.invoke('seek-to-position', { position, useCountIn }),
  seekToRegion: (regionId: string, autoplay: boolean = true, countIn: null|boolean = null) => ipcRenderer.invoke('seek-to-region', { regionId, autoplay, countIn }),
  nextRegion: () => ipcRenderer.invoke('next-region'),
  previousRegion: () => ipcRenderer.invoke('previous-region'),
  seekToCurrentRegionStart: () => ipcRenderer.invoke('seek-to-current-region-start'),
  setAutoplayEnabled: (enabled: boolean) => ipcRenderer.invoke('set-autoplay-enabled', enabled),
  setCountInEnabled: (enabled: boolean) => ipcRenderer.invoke('set-count-in-enabled', enabled),
  setRecordingArmed: (enabled: boolean) => ipcRenderer.invoke('set-recording-armed', enabled),

  // Project management
  refreshProjectId: () => ipcRenderer.invoke('refresh-project-id'),
  getProjectId: () => ipcRenderer.invoke('get-project-id'),

  // Setlist management
  setSelectedSetlist: (setlistId: string | null) => ipcRenderer.invoke('set-selected-setlist', setlistId),
  getSetlists: () => ipcRenderer.invoke('get-setlists'),
  getSetlist: (setlistId: string) => ipcRenderer.invoke('get-setlist', setlistId),
  createSetlist: (name: string) => ipcRenderer.invoke('create-setlist', name),
  updateSetlist: (setlistId: string, name: string) => ipcRenderer.invoke('update-setlist', { setlistId, name }),
  deleteSetlist: (setlistId: string) => ipcRenderer.invoke('delete-setlist', setlistId),
  addSetlistItem: (setlistId: string, regionId: string, regionName?: string, position?: number) =>
    ipcRenderer.invoke('add-setlist-item', { setlistId, regionId, regionName, position }),
  removeSetlistItem: (setlistId: string, itemId: string) =>
    ipcRenderer.invoke('remove-setlist-item', { setlistId, itemId }),
  moveSetlistItem: (setlistId: string, itemId: string, newPosition: number) =>
    ipcRenderer.invoke('move-setlist-item', { setlistId, itemId, newPosition }),

  // Configuration management
  getReaperConfig: () => ipcRenderer.invoke('get-reaper-config'),
  updateReaperConfig: (config: any) => ipcRenderer.invoke('update-reaper-config', config),

  // MIDI management
  getMidiConfig: () => ipcRenderer.invoke('get-midi-config'),
  updateMidiConfig: (config: any) => ipcRenderer.invoke('update-midi-config', config),
  getMidiDevices: () => ipcRenderer.invoke('get-midi-devices'),
  connectToMidiDevice: (deviceId: string) => ipcRenderer.invoke('connect-to-midi-device', deviceId),
  simulateMidiNote: (params: { note: number, velocity?: number, channel?: number }) =>
    ipcRenderer.invoke('simulate-midi-note', params),

  // Ping for latency measurement
  ping: () => ipcRenderer.invoke('ping'),

  // Request reconnection
  requestReconnect: () => ipcRenderer.send('request-reconnect'),

  // Event listeners
  onRegionsUpdate: (callback: (data: Region[]) => void) =>
    ipcRenderer.on('regions-update', (_, data: Region[]) => callback(data)),
  onMarkersUpdate: (callback: (data: Marker[]) => void) =>
    ipcRenderer.on('markers-update', (_, data: Marker[]) => callback(data)),
  onPlaybackStateUpdate: (callback: (data: PlaybackState) => void) =>
    ipcRenderer.on('playback-state-update', (_, data: PlaybackState) => callback(data)),
  onStatusMessage: (callback: (data: StatusMessage) => void) =>
    ipcRenderer.on('status-message', (_, data: StatusMessage) => callback(data)),
  onProjectIdUpdate: (callback: (data: string) => void) =>
    ipcRenderer.on('project-id-update', (_, data: string) => callback(data)),
  onProjectChanged: (callback: (projectId: string) => void) =>
    ipcRenderer.on('project-changed', (_, projectId: string) => callback(projectId)),
  onMidiActivity: (callback: () => void) =>
    ipcRenderer.on('midi-activity', () => callback()),
  onConnectionChange: (callback: (status: ConnectionStatus) => void) =>
    ipcRenderer.on('connection-change', (_, status: ConnectionStatus) => callback(status)),
  onSystemStats: (callback: (data: any) => void) =>
    ipcRenderer.on('system-stats', (_, data: any) => callback(data)),
  // Log messages (only sent when DevTools are open)
  onLogMessage: (callback: (logData: any) => void) =>
    ipcRenderer.on('log-message', (_, logData: any) => callback(logData)),
  // Setlist event listeners
  onSetlistsUpdate: (callback: (data: any[]) => void) =>
    ipcRenderer.on('setlists-update', (_, data: any[]) => callback(data)),
  onSetlistUpdate: (callback: (data: any) => void) =>
    ipcRenderer.on('setlist-update', (_, data: any) => callback(data)),

  // Remove event listeners
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('electronAPI', api) // For compatibility with our code
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.electronAPI = api // For compatibility with our code
}
