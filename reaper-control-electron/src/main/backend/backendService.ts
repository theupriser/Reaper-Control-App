/**
 * Backend Service
 * Handles communication with REAPER and provides data to the renderer process
 */
import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';

// Define interfaces for the data types
export interface ConnectionStatus {
  connected: boolean;
  reason?: string;
  status?: string;
  pingLatency?: number;
}

export interface Region {
  id: string;
  name: string;
  start: number;
  end: number;
  color?: string;
}

export interface Marker {
  id: string;
  name: string;
  position: number;
  color?: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  position: number;
  currentRegionId?: string;
  bpm: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
}

export interface StatusMessage {
  type: 'info' | 'error' | 'warning';
  message: string;
  timestamp: number;
  details?: string;
}

// Mock data for testing
const mockRegions: Region[] = [
  { id: '1', name: 'Intro', start: 0, end: 10 },
  { id: '2', name: 'Verse 1', start: 10, end: 30 },
  { id: '3', name: 'Chorus', start: 30, end: 50 },
  { id: '4', name: 'Verse 2', start: 50, end: 70 },
  { id: '5', name: 'Outro', start: 70, end: 90 }
];

const mockMarkers: Marker[] = [
  { id: '1', name: 'Start', position: 0 },
  { id: '2', name: 'Verse 1', position: 10 },
  { id: '3', name: 'Chorus', position: 30 },
  { id: '4', name: 'Verse 2', position: 50 },
  { id: '5', name: 'Outro', position: 70 }
];

// Backend service class
export class BackendService extends EventEmitter {
  private mainWindow: BrowserWindow | null = null;
  private connected: boolean = false;
  private projectId: string = 'mock-project-id';
  private playbackState: PlaybackState = {
    isPlaying: false,
    position: 0,
    currentRegionId: '1',
    bpm: 120,
    timeSignature: {
      numerator: 4,
      denominator: 4
    }
  };
  private playbackTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  /**
   * Initialize the backend service
   * @param window - The main window
   */
  public initialize(window: BrowserWindow): void {
    this.mainWindow = window;
    this.connected = true;

    // Emit connection status
    this.emitConnectionStatus({
      connected: true,
      status: 'Connected to REAPER'
    });

    // Start a timer to simulate playback position updates
    this.startPlaybackTimer();
  }

  /**
   * Start a timer to simulate playback position updates
   */
  private startPlaybackTimer(): void {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
    }

    this.playbackTimer = setInterval(() => {
      if (this.playbackState.isPlaying) {
        // Update position
        this.playbackState.position += 0.1;

        // Check if we've reached the end of the current region
        const currentRegion = mockRegions.find(r => r.id === this.playbackState.currentRegionId);
        if (currentRegion && this.playbackState.position >= currentRegion.end) {
          // Move to the next region
          const currentIndex = mockRegions.findIndex(r => r.id === this.playbackState.currentRegionId);
          if (currentIndex < mockRegions.length - 1) {
            this.playbackState.currentRegionId = mockRegions[currentIndex + 1].id;
            this.playbackState.position = mockRegions[currentIndex + 1].start;
          } else {
            // Stop playback at the end of the last region
            this.playbackState.isPlaying = false;
          }
        }

        // Emit playback state update
        this.emitPlaybackState();
      }
    }, 100);
  }

  /**
   * Emit connection status to the renderer process
   * @param status - The connection status
   */
  private emitConnectionStatus(status: ConnectionStatus): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('connection-change', status);
    }
  }

  /**
   * Emit playback state to the renderer process
   */
  private emitPlaybackState(): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('playback-state-update', this.playbackState);
    }
  }

  /**
   * Emit status message to the renderer process
   * @param message - The status message
   */
  private emitStatusMessage(message: StatusMessage): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('status-message', message);
    }
  }

  /**
   * Check if connected to REAPER
   * @returns True if connected
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Refresh regions from REAPER
   * @returns Promise that resolves with the regions
   */
  public async refreshRegions(): Promise<Region[]> {
    // Simulate a delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Emit regions update
    if (this.mainWindow) {
      this.mainWindow.webContents.send('regions-update', mockRegions);
    }

    return mockRegions;
  }

  /**
   * Get regions from REAPER
   * @returns Promise that resolves with the regions
   */
  public async getRegions(): Promise<Region[]> {
    return mockRegions;
  }

  /**
   * Refresh markers from REAPER
   * @returns Promise that resolves with the markers
   */
  public async refreshMarkers(): Promise<Marker[]> {
    // Simulate a delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Emit markers update
    if (this.mainWindow) {
      this.mainWindow.webContents.send('markers-update', mockMarkers);
    }

    return mockMarkers;
  }

  /**
   * Get markers from REAPER
   * @returns Promise that resolves with the markers
   */
  public async getMarkers(): Promise<Marker[]> {
    return mockMarkers;
  }

  /**
   * Toggle play/pause in REAPER
   * @returns Promise that resolves when the operation is complete
   */
  public async togglePlay(): Promise<void> {
    // Toggle playback state
    this.playbackState.isPlaying = !this.playbackState.isPlaying;

    // Emit playback state update
    this.emitPlaybackState();

    // Emit status message
    this.emitStatusMessage({
      type: 'info',
      message: this.playbackState.isPlaying ? 'Playback started' : 'Playback stopped',
      timestamp: Date.now()
    });
  }

  /**
   * Seek to a position in REAPER
   * @param position - The position to seek to
   * @returns Promise that resolves when the operation is complete
   */
  public async seekToPosition(position: string): Promise<void> {
    // Parse position
    const pos = parseFloat(position);
    if (isNaN(pos)) {
      throw new Error('Invalid position');
    }

    // Update playback state
    this.playbackState.position = pos;

    // Find the region that contains this position
    const region = mockRegions.find(r => pos >= r.start && pos <= r.end);
    if (region) {
      this.playbackState.currentRegionId = region.id;
    }

    // Emit playback state update
    this.emitPlaybackState();

    // Emit status message
    this.emitStatusMessage({
      type: 'info',
      message: `Seeked to position ${pos.toFixed(2)}`,
      timestamp: Date.now()
    });
  }

  /**
   * Seek to a region in REAPER
   * @param regionId - The ID of the region to seek to
   * @returns Promise that resolves when the operation is complete
   */
  public async seekToRegion(regionId: string): Promise<void> {
    // Find the region
    const region = mockRegions.find(r => r.id === regionId);
    if (!region) {
      throw new Error('Region not found');
    }

    // Update playback state
    this.playbackState.currentRegionId = regionId;
    this.playbackState.position = region.start;

    // Emit playback state update
    this.emitPlaybackState();

    // Emit status message
    this.emitStatusMessage({
      type: 'info',
      message: `Seeked to region ${region.name}`,
      timestamp: Date.now()
    });
  }

  /**
   * Go to the next region in REAPER
   * @returns Promise that resolves when the operation is complete
   */
  public async nextRegion(): Promise<void> {
    // Find the current region index
    const currentIndex = mockRegions.findIndex(r => r.id === this.playbackState.currentRegionId);
    if (currentIndex === -1 || currentIndex >= mockRegions.length - 1) {
      throw new Error('No next region');
    }

    // Update playback state
    this.playbackState.currentRegionId = mockRegions[currentIndex + 1].id;
    this.playbackState.position = mockRegions[currentIndex + 1].start;

    // Emit playback state update
    this.emitPlaybackState();

    // Emit status message
    this.emitStatusMessage({
      type: 'info',
      message: `Moved to next region: ${mockRegions[currentIndex + 1].name}`,
      timestamp: Date.now()
    });
  }

  /**
   * Go to the previous region in REAPER
   * @returns Promise that resolves when the operation is complete
   */
  public async previousRegion(): Promise<void> {
    // Find the current region index
    const currentIndex = mockRegions.findIndex(r => r.id === this.playbackState.currentRegionId);
    if (currentIndex <= 0) {
      throw new Error('No previous region');
    }

    // Update playback state
    this.playbackState.currentRegionId = mockRegions[currentIndex - 1].id;
    this.playbackState.position = mockRegions[currentIndex - 1].start;

    // Emit playback state update
    this.emitPlaybackState();

    // Emit status message
    this.emitStatusMessage({
      type: 'info',
      message: `Moved to previous region: ${mockRegions[currentIndex - 1].name}`,
      timestamp: Date.now()
    });
  }

  /**
   * Seek to the start of the current region in REAPER
   * @returns Promise that resolves when the operation is complete
   */
  public async seekToCurrentRegionStart(): Promise<void> {
    // Find the current region
    const region = mockRegions.find(r => r.id === this.playbackState.currentRegionId);
    if (!region) {
      throw new Error('Current region not found');
    }

    // Update playback state
    this.playbackState.position = region.start;

    // Emit playback state update
    this.emitPlaybackState();

    // Emit status message
    this.emitStatusMessage({
      type: 'info',
      message: `Seeked to start of region ${region.name}`,
      timestamp: Date.now()
    });
  }

  /**
   * Refresh project ID from REAPER
   * @returns Promise that resolves with the project ID
   */
  public async refreshProjectId(): Promise<string> {
    // Simulate a delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Emit project ID update
    if (this.mainWindow) {
      this.mainWindow.webContents.send('project-id-update', this.projectId);
    }

    return this.projectId;
  }

  /**
   * Get project ID from REAPER
   * @returns Promise that resolves with the project ID
   */
  public async getProjectId(): Promise<string> {
    return this.projectId;
  }

  /**
   * Set selected setlist
   * @param setlistId - The ID of the setlist to select
   * @returns Promise that resolves when the operation is complete
   */
  public async setSelectedSetlist(setlistId: string | null): Promise<void> {
    // This is a mock implementation
    console.log(`Selected setlist: ${setlistId}`);
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
  }
}

// Create and export a singleton instance
export const backendService = new BackendService();
