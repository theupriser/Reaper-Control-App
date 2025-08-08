/**
 * Shared types between main and renderer processes
 */

/**
 * Connection status
 */
export interface ConnectionStatus {
  connected: boolean;
  reason?: string;
  status?: string;
  pingLatency?: number;
}

/**
 * Region
 */
export interface Region {
  id: string;
  name: string;
  start: number;
  end: number;
  color?: string;
}

/**
 * Marker
 */
export interface Marker {
  id: string;
  name: string;
  position: number;
  color?: string;
}

/**
 * Playback state
 */
export interface PlaybackState {
  isPlaying: boolean;
  position: number;
  currentRegionId?: string;
  selectedSetlistId?: string | null;
  bpm: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
  autoplayEnabled?: boolean;
  countInEnabled?: boolean;
}

/**
 * Setlist item
 */
export interface SetlistItem {
  id: string;
  regionId: string;
  name: string;
  position: number;
}

/**
 * Setlist
 */
export interface Setlist {
  id: string;
  name: string;
  projectId: string;
  items: SetlistItem[];
}

/**
 * Status message
 */
export interface StatusMessage {
  type: 'info' | 'error' | 'warning';
  message: string;
  timestamp: number;
  details?: string;
}

/**
 * MIDI device
 */
export interface MidiDevice {
  id: string;
  name: string;
  manufacturer?: string;
  isConnected: boolean;
}

/**
 * MIDI note mapping
 */
export interface MidiNoteMapping {
  noteNumber: number;
  action: string;
  params?: any;
}

/**
 * MIDI configuration
 */
export interface MidiConfig {
  enabled: boolean;
  deviceId?: string;
  deviceName?: string;
  channel?: number;  // MIDI channel to listen to (undefined or null means listen to all channels)
  noteMappings: MidiNoteMapping[];
}

/**
 * System stats
 */
export interface SystemStats {
  cpu: {
    usage: number;
    model: string;
    cores: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
  };
  os: {
    platform: string;
    release: string;
    arch: string;
  };
  app: {
    version: string;
    electron: string;
    chrome: string;
    node: string;
  };
  network: {
    connected: boolean;
    latency?: number;
  };
}
