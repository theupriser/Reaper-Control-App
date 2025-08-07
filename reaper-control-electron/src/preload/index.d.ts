import { ElectronAPI } from '@electron-toolkit/preload'

// Define interfaces for our IPC API
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
}

interface StatusMessage {
  type: 'info' | 'error' | 'warning';
  message: string;
  timestamp: number;
  details?: string;
}

interface ElectronReaperAPI {
  // Connection status
  reportConnectionStatus: (status: ConnectionStatus) => void;

  // Regions management
  refreshRegions: () => Promise<Region[]>;
  getRegions: () => Promise<Region[]>;

  // Markers management
  refreshMarkers: () => Promise<Marker[]>;

  // Playback control
  togglePlay: () => Promise<void>;
  seekToPosition: (position: string) => Promise<void>;
  seekToRegion: (regionId: string) => Promise<void>;
  nextRegion: () => Promise<void>;
  previousRegion: () => Promise<void>;
  seekToCurrentRegionStart: () => Promise<void>;

  // Project management
  refreshProjectId: () => Promise<string>;
  getProjectId: () => Promise<string>;

  // Setlist management
  setSelectedSetlist: (setlistId: string | null) => Promise<void>;

  // Ping for latency measurement
  ping: () => Promise<void>;

  // Request reconnection
  requestReconnect: () => void;

  // Event listeners
  onRegionsUpdate: (callback: (data: Region[]) => void) => void;
  onMarkersUpdate: (callback: (data: Marker[]) => void) => void;
  onPlaybackStateUpdate: (callback: (data: PlaybackState) => void) => void;
  onStatusMessage: (callback: (data: StatusMessage) => void) => void;
  onProjectIdUpdate: (callback: (data: string) => void) => void;
  onProjectChanged: (callback: (projectId: string) => void) => void;
  onMidiActivity: (callback: () => void) => void;
  onConnectionChange: (callback: (status: ConnectionStatus) => void) => void;
  onSystemStats: (callback: (data: any) => void) => void;

  // Remove event listeners
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: unknown;
    electronAPI: ElectronReaperAPI;
  }
}
