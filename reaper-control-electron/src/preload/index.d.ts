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
  selectedSetlistId?: string | null;
  bpm: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
}

interface SetlistItem {
  id: string;
  regionId: string;
  name: string;
  position: number;
}

interface Setlist {
  id: string;
  name: string;
  projectId: string;
  items: SetlistItem[];
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
  playWithCountIn: () => Promise<void>;
  seekToPosition: (position: string, useCountIn?: boolean) => Promise<void>;
  seekToRegion: (regionId: string, autoplay?: boolean) => Promise<void>;
  nextRegion: () => Promise<void>;
  previousRegion: () => Promise<void>;
  seekToCurrentRegionStart: () => Promise<void>;

  // Project management
  refreshProjectId: () => Promise<string>;
  getProjectId: () => Promise<string>;

  // Setlist management
  setSelectedSetlist: (setlistId: string | null) => Promise<void>;
  getSetlists: () => Promise<Setlist[]>;
  getSetlist: (setlistId: string) => Promise<Setlist | null>;
  createSetlist: (name: string) => Promise<Setlist>;
  updateSetlist: (setlistId: string, name: string) => Promise<Setlist | null>;
  deleteSetlist: (setlistId: string) => Promise<boolean>;
  addSetlistItem: (setlistId: string, regionId: string, position?: number) => Promise<SetlistItem | null>;
  removeSetlistItem: (setlistId: string, itemId: string) => Promise<boolean>;
  moveSetlistItem: (setlistId: string, itemId: string, newPosition: number) => Promise<Setlist | null>;

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
  onSetlistsUpdate: (callback: (data: Setlist[]) => void) => void;
  onSetlistUpdate: (callback: (data: Setlist) => void) => void;

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
