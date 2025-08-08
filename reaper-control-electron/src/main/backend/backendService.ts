/**
 * Backend Service
 * Handles communication with REAPER and provides data to the renderer process
 */
import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { ReaperConnector } from '../services/reaperConnector';
import logger from '../utils/logger';

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
  selectedSetlistId?: string | null;
  bpm: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
}

export interface SetlistItem {
  id: string;
  regionId: string;
  name: string;
  position: number;
}

export interface Setlist {
  id: string;
  name: string;
  projectId: string;
  items: SetlistItem[];
}

export interface StatusMessage {
  type: 'info' | 'error' | 'warning';
  message: string;
  timestamp: number;
  details?: string;
}

// Real setlists data
const setlists: Map<string, Setlist> = new Map();

// Backend service class
export class BackendService extends EventEmitter {
  private mainWindow: BrowserWindow | null = null;
  private reaperConnector: ReaperConnector;
  private connected: boolean = false;
  private projectId: string = '';
  private playbackState: PlaybackState = {
    isPlaying: false,
    position: 0,
    bpm: 120,
    timeSignature: {
      numerator: 4,
      denominator: 4
    }
  };

  constructor() {
    super();
    this.reaperConnector = new ReaperConnector();

    // Set up event listeners for the REAPER connector
    this.reaperConnector.on('connection-change', (status: ConnectionStatus) => {
      this.connected = status.connected;
      this.emitConnectionStatus(status);
    });

    this.reaperConnector.on('playback-state-update', (state: PlaybackState) => {
      this.playbackState = state;
      this.emitPlaybackState();
    });

    this.reaperConnector.on('project-id-update', (projectId: string) => {
      this.projectId = projectId;
      if (this.mainWindow) {
        this.mainWindow.webContents.send('project-id-update', projectId);
      }
    });

    this.reaperConnector.on('project-changed', (projectId: string) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('project-changed', projectId);
      }
    });
  }

  /**
   * Initialize the backend service
   * @param window - The main window
   */
  public async initialize(window: BrowserWindow): Promise<void> {
    this.mainWindow = window;

    logger.info('Initializing backend service');

    try {
      // Connect to REAPER
      await this.reaperConnector.connect();

      // Refresh initial data
      await this.refreshRegions();
      await this.refreshMarkers();
      await this.refreshProjectId();

      logger.info('Backend service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize backend service', { error });

      this.emitStatusMessage({
        type: 'error',
        message: 'Failed to connect to REAPER',
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });
    }
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
    try {
      const regions = await this.reaperConnector.refreshRegions();

      // Emit regions update
      if (this.mainWindow) {
        this.mainWindow.webContents.send('regions-update', regions);
      }

      return regions;
    } catch (error) {
      logger.error('Failed to refresh regions', { error });

      this.emitStatusMessage({
        type: 'error',
        message: 'Failed to refresh regions',
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });

      return [];
    }
  }

  /**
   * Get regions from REAPER
   * @returns Promise that resolves with the regions
   */
  public async getRegions(): Promise<Region[]> {
    try {
      return await this.reaperConnector.getRegions();
    } catch (error) {
      logger.error('Failed to get regions', { error });
      return [];
    }
  }

  /**
   * Refresh markers from REAPER
   * @returns Promise that resolves with the markers
   */
  public async refreshMarkers(): Promise<Marker[]> {
    try {
      const markers = await this.reaperConnector.refreshMarkers();

      // Emit markers update
      if (this.mainWindow) {
        this.mainWindow.webContents.send('markers-update', markers);
      }

      return markers;
    } catch (error) {
      logger.error('Failed to refresh markers', { error });

      this.emitStatusMessage({
        type: 'error',
        message: 'Failed to refresh markers',
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });

      return [];
    }
  }

  /**
   * Get markers from REAPER
   * @returns Promise that resolves with the markers
   */
  public async getMarkers(): Promise<Marker[]> {
    try {
      return await this.reaperConnector.getMarkers();
    } catch (error) {
      logger.error('Failed to get markers', { error });
      return [];
    }
  }

  /**
   * Toggle play/pause in REAPER
   * @returns Promise that resolves when the operation is complete
   */
  public async togglePlay(): Promise<void> {
    try {
      await this.reaperConnector.togglePlay();

      // Playback state update will be emitted by the reaperConnector
    } catch (error) {
      logger.error('Failed to toggle play/pause', { error });

      this.emitStatusMessage({
        type: 'error',
        message: 'Failed to toggle play/pause',
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Seek to a position in REAPER
   * @param position - The position to seek to
   * @returns Promise that resolves when the operation is complete
   */
  public async seekToPosition(position: string): Promise<void> {
    try {
      // Parse position
      const pos = parseFloat(position);
      if (isNaN(pos)) {
        throw new Error('Invalid position');
      }

      await this.reaperConnector.seekToPosition(pos);

      // Playback state update will be emitted by the reaperConnector

      this.emitStatusMessage({
        type: 'info',
        message: `Seeked to position ${pos.toFixed(2)}`,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Failed to seek to position', { error, position });

      this.emitStatusMessage({
        type: 'error',
        message: `Failed to seek to position ${position}`,
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Seek to a region in REAPER
   * @param regionId - The ID of the region to seek to
   * @returns Promise that resolves when the operation is complete
   */
  public async seekToRegion(regionId: string): Promise<void> {
    try {
      await this.reaperConnector.seekToRegion(regionId);

      // Get the region name for the status message
      const regions = await this.getRegions();
      const region = regions.find(r => r.id === regionId);
      const regionName = region ? region.name : regionId;

      // Playback state update will be emitted by the reaperConnector

      this.emitStatusMessage({
        type: 'info',
        message: `Seeked to region ${regionName}`,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Failed to seek to region', { error, regionId });

      this.emitStatusMessage({
        type: 'error',
        message: 'Failed to seek to region',
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Go to the next region in REAPER
   * @returns Promise that resolves with a boolean indicating success or failure
   */
  public async nextRegion(): Promise<boolean> {
    try {
      await this.reaperConnector.nextRegion();

      // Playback state update will be emitted by the reaperConnector

      this.emitStatusMessage({
        type: 'info',
        message: 'Moved to next region',
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      logger.error('Failed to move to next region', { error });

      this.emitStatusMessage({
        type: 'error',
        message: 'Failed to move to next region',
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });

      return false;
    }
  }

  /**
   * Go to the previous region in REAPER
   * @returns Promise that resolves with a boolean indicating success or failure
   */
  public async previousRegion(): Promise<boolean> {
    try {
      await this.reaperConnector.previousRegion();

      // Playback state update will be emitted by the reaperConnector

      this.emitStatusMessage({
        type: 'info',
        message: 'Moved to previous region',
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      logger.error('Failed to move to previous region', { error });

      this.emitStatusMessage({
        type: 'error',
        message: 'Failed to move to previous region',
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });

      return false;
    }
  }

  /**
   * Seek to the start of the current region in REAPER
   * @returns Promise that resolves when the operation is complete
   */
  public async seekToCurrentRegionStart(): Promise<void> {
    try {
      await this.reaperConnector.seekToCurrentRegionStart();

      // Playback state update will be emitted by the reaperConnector

      this.emitStatusMessage({
        type: 'info',
        message: 'Seeked to start of current region',
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Failed to seek to start of current region', { error });

      this.emitStatusMessage({
        type: 'error',
        message: 'Failed to seek to start of current region',
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Refresh project ID from REAPER
   * @returns Promise that resolves with the project ID
   */
  public async refreshProjectId(): Promise<string> {
    try {
      const projectId = await this.reaperConnector.refreshProjectId();

      // Project ID update will be emitted by the reaperConnector event handler

      return projectId;
    } catch (error) {
      logger.error('Failed to refresh project ID', { error });

      this.emitStatusMessage({
        type: 'error',
        message: 'Failed to refresh project ID',
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });

      return this.projectId;
    }
  }

  /**
   * Get project ID from REAPER
   * @returns Promise that resolves with the project ID
   */
  public async getProjectId(): Promise<string> {
    try {
      return await this.reaperConnector.getProjectId();
    } catch (error) {
      logger.error('Failed to get project ID', { error });
      return this.projectId;
    }
  }

  /**
   * Load setlists from REAPER project state
   * @private
   */
  private async loadSetlists(): Promise<void> {
    try {
      const projectId = await this.getProjectId();
      const setlistsJson = await this.reaperConnector.getProjectExtState('reaper-control', 'setlists');

      if (setlistsJson) {
        const loadedSetlists = JSON.parse(setlistsJson) as Setlist[];

        // Clear existing setlists for this project
        Array.from(setlists.keys())
          .filter(key => setlists.get(key)?.projectId === projectId)
          .forEach(key => setlists.delete(key));

        // Add loaded setlists
        loadedSetlists.forEach(setlist => {
          setlists.set(setlist.id, setlist);
        });

        logger.debug(`Loaded ${loadedSetlists.length} setlists for project ${projectId}`);
      }
    } catch (error) {
      logger.error('Failed to load setlists from project state', { error });
    }
  }

  /**
   * Save setlists to REAPER project state
   * @private
   */
  private async saveSetlists(): Promise<void> {
    try {
      const projectId = await this.getProjectId();

      // Get setlists for current project
      const projectSetlists = Array.from(setlists.values())
        .filter(setlist => setlist.projectId === projectId);

      // Save to project state
      const setlistsJson = JSON.stringify(projectSetlists);
      await this.reaperConnector.setProjectExtState('reaper-control', 'setlists', setlistsJson);

      logger.debug(`Saved ${projectSetlists.length} setlists for project ${projectId}`);
    } catch (error) {
      logger.error('Failed to save setlists to project state', { error });

      this.emitStatusMessage({
        type: 'error',
        message: 'Failed to save setlists',
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get all setlists for the current project
   * @returns Promise that resolves with the setlists
   */
  public async getSetlists(): Promise<Setlist[]> {
    try {
      // Load setlists from project state
      await this.loadSetlists();

      // Filter setlists by current project ID
      const projectSetlists = Array.from(setlists.values())
        .filter(setlist => setlist.projectId === this.projectId);

      // Emit setlists update
      if (this.mainWindow) {
        this.mainWindow.webContents.send('setlists-update', projectSetlists);
      }

      return projectSetlists;
    } catch (error) {
      logger.error('Failed to get setlists', { error });
      return [];
    }
  }

  /**
   * Get a setlist by ID
   * @param setlistId - The ID of the setlist to get
   * @returns Promise that resolves with the setlist or null if not found
   */
  public async getSetlist(setlistId: string): Promise<Setlist | null> {
    try {
      // Ensure setlists are loaded
      await this.loadSetlists();

      const setlist = setlists.get(setlistId);

      if (!setlist) {
        this.emitStatusMessage({
          type: 'error',
          message: `Setlist with ID ${setlistId} not found`,
          timestamp: Date.now()
        });
        return null;
      }

      return setlist;
    } catch (error) {
      logger.error('Failed to get setlist', { error, setlistId });

      this.emitStatusMessage({
        type: 'error',
        message: `Failed to get setlist with ID ${setlistId}`,
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });

      return null;
    }
  }

  /**
   * Create a new setlist
   * @param name - The name of the setlist
   * @returns Promise that resolves with the created setlist
   */
  public async createSetlist(name: string): Promise<Setlist> {
    try {
      // Generate a unique ID
      const id = `setlist-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Create the setlist
      const setlist: Setlist = {
        id,
        name,
        projectId: this.projectId,
        items: []
      };

      // Add to setlists
      setlists.set(id, setlist);

      // Save setlists to project state
      await this.saveSetlists();

      // Emit status message
      this.emitStatusMessage({
        type: 'info',
        message: `Created setlist "${name}"`,
        timestamp: Date.now()
      });

      // Emit setlists update
      await this.getSetlists();

      return setlist;
    } catch (error) {
      logger.error('Failed to create setlist', { error, name });

      this.emitStatusMessage({
        type: 'error',
        message: `Failed to create setlist "${name}"`,
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Update a setlist
   * @param setlistId - The ID of the setlist to update
   * @param name - The new name for the setlist
   * @returns Promise that resolves with the updated setlist or null if not found
   */
  public async updateSetlist(setlistId: string, name: string): Promise<Setlist | null> {
    try {
      const setlist = await this.getSetlist(setlistId);

      if (!setlist) {
        return null;
      }

      // Update the setlist
      setlist.name = name;

      // Update in setlists
      setlists.set(setlistId, setlist);

      // Save setlists to project state
      await this.saveSetlists();

      // Emit status message
      this.emitStatusMessage({
        type: 'info',
        message: `Updated setlist "${name}"`,
        timestamp: Date.now()
      });

      // Emit setlists update
      await this.getSetlists();

      return setlist;
    } catch (error) {
      logger.error('Failed to update setlist', { error, setlistId, name });

      this.emitStatusMessage({
        type: 'error',
        message: `Failed to update setlist "${name}"`,
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });

      return null;
    }
  }

  /**
   * Delete a setlist
   * @param setlistId - The ID of the setlist to delete
   * @returns Promise that resolves with true if deleted, false if not found
   */
  public async deleteSetlist(setlistId: string): Promise<boolean> {
    try {
      const setlist = await this.getSetlist(setlistId);

      if (!setlist) {
        return false;
      }

      // Delete from setlists
      setlists.delete(setlistId);

      // Save setlists to project state
      await this.saveSetlists();

      // Emit status message
      this.emitStatusMessage({
        type: 'info',
        message: `Deleted setlist "${setlist.name}"`,
        timestamp: Date.now()
      });

      // Emit setlists update
      await this.getSetlists();

      return true;
    } catch (error) {
      logger.error('Failed to delete setlist', { error, setlistId });

      this.emitStatusMessage({
        type: 'error',
        message: `Failed to delete setlist`,
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });

      return false;
    }
  }

  /**
   * Add an item to a setlist
   * @param setlistId - The ID of the setlist
   * @param regionId - The ID of the region to add
   * @param position - The position to add the item at (optional)
   * @returns Promise that resolves with the added item or null if setlist not found
   */
  public async addSetlistItem(setlistId: string, regionId: string, position?: number): Promise<SetlistItem | null> {
    try {
      // Get the setlist
      const setlist = await this.getSetlist(setlistId);

      if (!setlist) {
        return null;
      }

      // Find the region
      const regions = await this.getRegions();
      const region = regions.find(r => r.id === regionId);

      if (!region) {
        this.emitStatusMessage({
          type: 'error',
          message: `Region with ID ${regionId} not found`,
          timestamp: Date.now()
        });
        return null;
      }

      // Generate a unique ID
      const id = `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Determine position
      const itemPosition = position !== undefined ? position : setlist.items.length;

      // Create the item
      const item: SetlistItem = {
        id,
        regionId,
        name: region.name,
        position: itemPosition
      };

      // Add to setlist
      if (position !== undefined) {
        // Insert at specific position
        setlist.items.splice(position, 0, item);

        // Update positions of subsequent items
        for (let i = position + 1; i < setlist.items.length; i++) {
          setlist.items[i].position = i;
        }
      } else {
        // Add to end
        setlist.items.push(item);
      }

      // Update in setlists
      setlists.set(setlistId, setlist);

      // Save setlists to project state
      await this.saveSetlists();

      // Emit status message
      this.emitStatusMessage({
        type: 'info',
        message: `Added "${region.name}" to setlist "${setlist.name}"`,
        timestamp: Date.now()
      });

      // Emit setlist update
      if (this.mainWindow) {
        this.mainWindow.webContents.send('setlist-update', setlist);
      }

      return item;
    } catch (error) {
      logger.error('Failed to add item to setlist', { error, setlistId, regionId });

      this.emitStatusMessage({
        type: 'error',
        message: 'Failed to add item to setlist',
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });

      return null;
    }
  }

  /**
   * Remove an item from a setlist
   * @param setlistId - The ID of the setlist
   * @param itemId - The ID of the item to remove
   * @returns Promise that resolves with true if removed, false if not found
   */
  public async removeSetlistItem(setlistId: string, itemId: string): Promise<boolean> {
    try {
      // Get the setlist
      const setlist = await this.getSetlist(setlistId);

      if (!setlist) {
        return false;
      }

      // Find the item
      const itemIndex = setlist.items.findIndex(item => item.id === itemId);

      if (itemIndex === -1) {
        this.emitStatusMessage({
          type: 'error',
          message: `Item with ID ${itemId} not found in setlist`,
          timestamp: Date.now()
        });
        return false;
      }

      // Get the item name for the status message
      const itemName = setlist.items[itemIndex].name;

      // Remove the item
      setlist.items.splice(itemIndex, 1);

      // Update positions of subsequent items
      for (let i = itemIndex; i < setlist.items.length; i++) {
        setlist.items[i].position = i;
      }

      // Update in setlists
      setlists.set(setlistId, setlist);

      // Save setlists to project state
      await this.saveSetlists();

      // Emit status message
      this.emitStatusMessage({
        type: 'info',
        message: `Removed "${itemName}" from setlist "${setlist.name}"`,
        timestamp: Date.now()
      });

      // Emit setlist update
      if (this.mainWindow) {
        this.mainWindow.webContents.send('setlist-update', setlist);
      }

      return true;
    } catch (error) {
      logger.error('Failed to remove item from setlist', { error, setlistId, itemId });

      this.emitStatusMessage({
        type: 'error',
        message: 'Failed to remove item from setlist',
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });

      return false;
    }
  }

  /**
   * Move an item within a setlist
   * @param setlistId - The ID of the setlist
   * @param itemId - The ID of the item to move
   * @param newPosition - The new position for the item
   * @returns Promise that resolves with the updated setlist or null if not found
   */
  public async moveSetlistItem(setlistId: string, itemId: string, newPosition: number): Promise<Setlist | null> {
    try {
      // Get the setlist
      const setlist = await this.getSetlist(setlistId);

      if (!setlist) {
        return null;
      }

      // Find the item
      const itemIndex = setlist.items.findIndex(item => item.id === itemId);

      if (itemIndex === -1) {
        this.emitStatusMessage({
          type: 'error',
          message: `Item with ID ${itemId} not found in setlist`,
          timestamp: Date.now()
        });
        return null;
      }

      // Validate new position
      if (newPosition < 0 || newPosition >= setlist.items.length) {
        this.emitStatusMessage({
          type: 'error',
          message: `Invalid position ${newPosition}`,
          timestamp: Date.now()
        });
        return null;
      }

      // Move the item
      const item = setlist.items[itemIndex];
      setlist.items.splice(itemIndex, 1);
      setlist.items.splice(newPosition, 0, item);

      // Update positions
      for (let i = 0; i < setlist.items.length; i++) {
        setlist.items[i].position = i;
      }

      // Update in setlists
      setlists.set(setlistId, setlist);

      // Save setlists to project state
      await this.saveSetlists();

      // Emit status message
      this.emitStatusMessage({
        type: 'info',
        message: `Moved "${item.name}" to position ${newPosition + 1} in setlist "${setlist.name}"`,
        timestamp: Date.now()
      });

      // Emit setlist update
      if (this.mainWindow) {
        this.mainWindow.webContents.send('setlist-update', setlist);
      }

      return setlist;
    } catch (error) {
      logger.error('Failed to move item in setlist', { error, setlistId, itemId, newPosition });

      this.emitStatusMessage({
        type: 'error',
        message: 'Failed to move item in setlist',
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });

      return null;
    }
  }

  /**
   * Set selected setlist
   * @param setlistId - The ID of the setlist to select
   * @returns Promise that resolves when the operation is complete
   */
  public async setSelectedSetlist(setlistId: string | null): Promise<void> {
    try {
      // Update playback state
      this.playbackState.selectedSetlistId = setlistId;

      // Emit playback state update
      this.emitPlaybackState();

      // Emit status message
      if (setlistId) {
        const setlist = await this.getSetlist(setlistId);
        if (setlist) {
          this.emitStatusMessage({
            type: 'info',
            message: `Selected setlist "${setlist.name}"`,
            timestamp: Date.now()
          });
        }
      } else {
        this.emitStatusMessage({
          type: 'info',
          message: 'Cleared setlist selection',
          timestamp: Date.now()
        });
      }

      logger.debug(`Selected setlist: ${setlistId}`);
    } catch (error) {
      logger.error('Failed to set selected setlist', { error, setlistId });

      this.emitStatusMessage({
        type: 'error',
        message: 'Failed to set selected setlist',
        timestamp: Date.now(),
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    logger.info('Cleaning up backend service');

    // Clean up REAPER connector
    this.reaperConnector.cleanup();

    // Clear main window reference
    this.mainWindow = null;
  }
}

// Create and export a singleton instance
export const backendService = new BackendService();
