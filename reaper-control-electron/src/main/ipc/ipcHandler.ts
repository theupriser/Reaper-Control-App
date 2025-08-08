/**
 * IPC Handler
 * Handles IPC messages between the renderer and main processes
 */
import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS } from './ipcChannels';
import { ReaperConnector } from '../services/reaperConnector';
import { RegionService } from '../services/regionService';
import { MarkerService } from '../services/markerService';
import { MidiService } from '../services/midiService';
import { ProjectService } from '../services/projectService';
import { StatusMessage } from '../types';
import logger from '../utils/logger';

export class IpcHandler {
  private mainWindow: BrowserWindow;
  private reaperConnector: ReaperConnector;
  private regionService: RegionService;
  private markerService: MarkerService;
  private midiService: MidiService;
  private projectService: ProjectService;

  /**
   * Constructor
   * @param mainWindow - Main window
   * @param reaperConnector - REAPER connector
   * @param regionService - Region service
   * @param markerService - Marker service
   * @param midiService - MIDI service
   * @param projectService - Project service
   */
  constructor(
    mainWindow: BrowserWindow,
    reaperConnector: ReaperConnector,
    regionService: RegionService,
    markerService: MarkerService,
    midiService: MidiService,
    projectService: ProjectService
  ) {
    this.mainWindow = mainWindow;
    this.reaperConnector = reaperConnector;
    this.regionService = regionService;
    this.markerService = markerService;
    this.midiService = midiService;
    this.projectService = projectService;

    // Set up IPC handlers
    this.setupIpcHandlers();

    // Set up event listeners
    this.setupEventListeners();

    logger.info('IPC handler initialized');
  }

  /**
   * Set up IPC handlers
   */
  private setupIpcHandlers(): void {
    // Connection
    ipcMain.handle(IPC_CHANNELS.PING, this.handlePing.bind(this));
    ipcMain.on(IPC_CHANNELS.REPORT_CONNECTION_STATUS, this.handleReportConnectionStatus.bind(this));
    ipcMain.on(IPC_CHANNELS.REQUEST_RECONNECT, this.handleRequestReconnect.bind(this));

    // Regions
    ipcMain.handle(IPC_CHANNELS.REFRESH_REGIONS, this.handleRefreshRegions.bind(this));
    ipcMain.handle(IPC_CHANNELS.GET_REGIONS, this.handleGetRegions.bind(this));

    // Markers
    ipcMain.handle(IPC_CHANNELS.REFRESH_MARKERS, this.handleRefreshMarkers.bind(this));
    ipcMain.handle(IPC_CHANNELS.GET_MARKERS, this.handleGetMarkers.bind(this));

    // Playback control
    ipcMain.handle(IPC_CHANNELS.TOGGLE_PLAY, this.handleTogglePlay.bind(this));
    ipcMain.handle(IPC_CHANNELS.PLAY_WITH_COUNT_IN, this.handlePlayWithCountIn.bind(this));
    ipcMain.handle(IPC_CHANNELS.SEEK_TO_POSITION, this.handleSeekToPosition.bind(this));
    ipcMain.handle(IPC_CHANNELS.SEEK_TO_REGION, this.handleSeekToRegion.bind(this));
    ipcMain.handle(IPC_CHANNELS.NEXT_REGION, this.handleNextRegion.bind(this));
    ipcMain.handle(IPC_CHANNELS.PREVIOUS_REGION, this.handlePreviousRegion.bind(this));
    ipcMain.handle(IPC_CHANNELS.SEEK_TO_CURRENT_REGION_START, this.handleSeekToCurrentRegionStart.bind(this));
    ipcMain.handle(IPC_CHANNELS.SET_AUTOPLAY_ENABLED, this.handleSetAutoplayEnabled.bind(this));
    ipcMain.handle(IPC_CHANNELS.SET_COUNT_IN_ENABLED, this.handleSetCountInEnabled.bind(this));

    // Project
    ipcMain.handle(IPC_CHANNELS.REFRESH_PROJECT_ID, this.handleRefreshProjectId.bind(this));
    ipcMain.handle(IPC_CHANNELS.GET_PROJECT_ID, this.handleGetProjectId.bind(this));

    // Setlists
    ipcMain.handle(IPC_CHANNELS.GET_SETLISTS, this.handleGetSetlists.bind(this));
    ipcMain.handle(IPC_CHANNELS.GET_SETLIST, this.handleGetSetlist.bind(this));
    ipcMain.handle(IPC_CHANNELS.CREATE_SETLIST, this.handleCreateSetlist.bind(this));
    ipcMain.handle(IPC_CHANNELS.UPDATE_SETLIST, this.handleUpdateSetlist.bind(this));
    ipcMain.handle(IPC_CHANNELS.DELETE_SETLIST, this.handleDeleteSetlist.bind(this));
    ipcMain.handle(IPC_CHANNELS.ADD_SETLIST_ITEM, this.handleAddSetlistItem.bind(this));
    ipcMain.handle(IPC_CHANNELS.REMOVE_SETLIST_ITEM, this.handleRemoveSetlistItem.bind(this));
    ipcMain.handle(IPC_CHANNELS.MOVE_SETLIST_ITEM, this.handleMoveSetlistItem.bind(this));
    ipcMain.handle(IPC_CHANNELS.SET_SELECTED_SETLIST, this.handleSetSelectedSetlist.bind(this));

    // MIDI
    ipcMain.handle(IPC_CHANNELS.GET_MIDI_DEVICES, this.handleGetMidiDevices.bind(this));
    ipcMain.handle(IPC_CHANNELS.GET_MIDI_CONFIG, this.handleGetMidiConfig.bind(this));
    ipcMain.handle(IPC_CHANNELS.UPDATE_MIDI_CONFIG, this.handleUpdateMidiConfig.bind(this));
    ipcMain.handle(IPC_CHANNELS.CONNECT_TO_MIDI_DEVICE, this.handleConnectToMidiDevice.bind(this));
    ipcMain.handle(IPC_CHANNELS.SIMULATE_MIDI_NOTE, this.handleSimulateMidiNote.bind(this));
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // REAPER connector events
    this.reaperConnector.on('connectionChange', (status) => {
      this.sendToRenderer(IPC_EVENTS.CONNECTION_CHANGE, status);
    });

    this.reaperConnector.on('playbackState', (state) => {
      this.sendToRenderer(IPC_EVENTS.PLAYBACK_STATE_UPDATE, state);
    });

    // Region service events
    this.regionService.on('regions', (regions) => {
      this.sendToRenderer(IPC_EVENTS.REGIONS_UPDATE, regions);
    });

    // Marker service events
    this.markerService.on('markers', (markers) => {
      this.sendToRenderer(IPC_EVENTS.MARKERS_UPDATE, markers);
    });

    // Project service events
    this.projectService.on('projectId', (projectId) => {
      this.sendToRenderer(IPC_EVENTS.PROJECT_ID_UPDATE, projectId);
    });

    this.projectService.on('projectChanged', (projectId) => {
      this.sendToRenderer(IPC_EVENTS.PROJECT_CHANGED, projectId);
    });

    this.projectService.on('setlists', (setlists) => {
      this.sendToRenderer(IPC_EVENTS.SETLISTS_UPDATE, setlists);
    });

    this.projectService.on('setlistUpdated', (setlist) => {
      this.sendToRenderer(IPC_EVENTS.SETLIST_UPDATE, setlist);
    });

    // MIDI service events
    this.midiService.on('midiActivity', () => {
      this.sendToRenderer(IPC_EVENTS.MIDI_ACTIVITY);
    });

    this.midiService.on('action', (action, params) => {
      this.handleMidiAction(action, params);
    });
  }

  /**
   * Send message to renderer process
   * @param channel - IPC channel
   * @param data - Data to send
   */
  private sendToRenderer(channel: string, data?: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Send status message to renderer process
   * @param message - Status message
   */
  private sendStatusMessage(message: StatusMessage): void {
    this.sendToRenderer(IPC_EVENTS.STATUS_MESSAGE, message);
  }

  /**
   * Create info status message
   * @param message - Message text
   * @param details - Optional details
   * @returns Status message
   */
  private createInfoMessage(message: string, details?: string): StatusMessage {
    return {
      type: 'info',
      message,
      timestamp: Date.now(),
      details
    };
  }

  /**
   * Create error status message
   * @param message - Message text
   * @param details - Optional details
   * @returns Status message
   */
  private createErrorMessage(message: string, details?: string): StatusMessage {
    return {
      type: 'error',
      message,
      timestamp: Date.now(),
      details
    };
  }

  /**
   * Handle MIDI action
   * @param action - Action name
   * @param params - Action parameters
   */
  private async handleMidiAction(action: string, params?: any): Promise<void> {
    logger.info('Handling MIDI action', { action, params });

    try {
      switch (action) {
        case 'togglePlay':
          await this.reaperConnector.togglePlay();
          break;
        case 'nextRegion':
          await this.regionService.nextRegion();
          break;
        case 'previousRegion':
          await this.regionService.previousRegion();
          break;
        case 'seekToCurrentRegionStart':
          await this.regionService.seekToCurrentRegionStart();
          break;
        case 'seekToRegion':
          if (params && params.regionId) {
            const region = this.regionService.getRegionById(params.regionId);
            if (region) {
              await this.regionService.seekToRegionAndPlay(region, params.autoplay, params.countIn);
            }
          }
          break;
        case 'seekToPosition':
          if (params && params.position !== undefined) {
            await this.reaperConnector.seekToPosition(params.position);
          }
          break;
        default:
          logger.warn('Unknown MIDI action', { action });
      }
    } catch (error) {
      logger.error('Error handling MIDI action', { action, error });
    }
  }

  // Connection handlers

  /**
   * Handle ping request
   * @returns Pong response
   */
  private async handlePing(): Promise<string> {
    return 'pong';
  }

  /**
   * Handle report connection status
   * @param event - IPC event
   * @param status - Connection status
   */
  private handleReportConnectionStatus(_: Electron.IpcMainEvent, status: any): void {
    logger.debug('Connection status reported from renderer', { status });
  }

  /**
   * Handle request reconnect
   */
  private handleRequestReconnect(): void {
    logger.info('Reconnect requested from renderer');
    this.reaperConnector.connect();
  }

  // Region handlers

  /**
   * Handle refresh regions
   * @returns Regions
   */
  private async handleRefreshRegions(): Promise<any> {
    try {
      return await this.regionService.refreshRegions();
    } catch (error) {
      logger.error('Error refreshing regions', { error });
      this.sendStatusMessage(this.createErrorMessage('Failed to refresh regions', String(error)));
      throw error;
    }
  }

  /**
   * Handle get regions
   * @returns Regions
   */
  private async handleGetRegions(): Promise<any> {
    return this.regionService.getRegions();
  }

  // Marker handlers

  /**
   * Handle refresh markers
   * @returns Markers
   */
  private async handleRefreshMarkers(): Promise<any> {
    try {
      return await this.markerService.refreshMarkers();
    } catch (error) {
      logger.error('Error refreshing markers', { error });
      this.sendStatusMessage(this.createErrorMessage('Failed to refresh markers', String(error)));
      throw error;
    }
  }

  /**
   * Handle get markers
   * @returns Markers
   */
  private async handleGetMarkers(): Promise<any> {
    return this.markerService.getMarkers();
  }

  // Playback control handlers

  /**
   * Handle toggle play
   */
  private async handleTogglePlay(): Promise<void> {
    try {
      await this.reaperConnector.togglePlay();
    } catch (error) {
      logger.error('Error toggling play', { error });
      this.sendStatusMessage(this.createErrorMessage('Failed to toggle play', String(error)));
      throw error;
    }
  }

  /**
   * Handle play with count-in
   */
  private async handlePlayWithCountIn(): Promise<void> {
    try {
      await this.reaperConnector.playWithCountIn();
    } catch (error) {
      logger.error('Error playing with count-in', { error });
      this.sendStatusMessage(this.createErrorMessage('Failed to play with count-in', String(error)));
      throw error;
    }
  }

  /**
   * Handle seek to position
   * @param _ - IPC event
   * @param params - Parameters including position and useCountIn flag
   */
  private async handleSeekToPosition(_: any, params: { position: string, useCountIn?: boolean }): Promise<void> {
    try {
      // Extract position and useCountIn from params
      const { position, useCountIn = false } = params;

      // Parse position to float
      const pos = parseFloat(position);
      if (isNaN(pos)) {
        throw new Error('Invalid position');
      }

      logger.debug('Seeking to position', { position: pos, useCountIn });

      // Call seekToPosition with the useCountIn parameter
      await this.reaperConnector.seekToPosition(pos, useCountIn);
    } catch (error) {
      logger.error('Error seeking to position', { error, params });
      this.sendStatusMessage(this.createErrorMessage('Failed to seek to position', String(error)));
      throw error;
    }
  }

  /**
   * Handle seek to region
   * @param _ - IPC event
   * @param params - Parameters including regionId, autoplay flag, and countIn flag
   */
  private async handleSeekToRegion(_: any, params: { regionId: string, autoplay: boolean, countIn?: boolean }): Promise<void> {
    try {
      const { regionId, autoplay, countIn } = params;
      logger.debug('Seeking to region with options', { regionId, autoplay, countIn });

      // Get the region
      const region = this.regionService.getRegionById(regionId);
      if (!region) {
        throw new Error(`Region not found: ${regionId}`);
      }

      // Use the new seekToRegionAndPlay method
      const result = await this.regionService.seekToRegionAndPlay(region, autoplay, countIn);

      if (!result) {
        throw new Error('Failed to seek to region and play');
      }
    } catch (error) {
      logger.error('Error seeking to region', { error, params });
      this.sendStatusMessage(this.createErrorMessage('Failed to seek to region', String(error)));
      throw error;
    }
  }

  /**
   * Handle next region
   * @returns Promise that resolves with a boolean indicating success or failure
   */
  private async handleNextRegion(): Promise<{ success: boolean }> {
    try {
      const success = await this.regionService.nextRegion();
      return { success };
    } catch (error) {
      logger.error('Error going to next region', { error });
      this.sendStatusMessage(this.createErrorMessage('Failed to go to next region', String(error)));
      return { success: false };
    }
  }

  /**
   * Handle previous region
   * @returns Promise that resolves with a boolean indicating success or failure
   */
  private async handlePreviousRegion(): Promise<{ success: boolean }> {
    try {
      const success = await this.regionService.previousRegion();
      return { success };
    } catch (error) {
      logger.error('Error going to previous region', { error });
      this.sendStatusMessage(this.createErrorMessage('Failed to go to previous region', String(error)));
      return { success: false };
    }
  }

  /**
   * Handle seek to current region start
   */
  private async handleSeekToCurrentRegionStart(): Promise<void> {
    try {
      await this.regionService.seekToCurrentRegionStart();
    } catch (error) {
      logger.error('Error seeking to current region start', { error });
      this.sendStatusMessage(this.createErrorMessage('Failed to seek to current region start', String(error)));
      throw error;
    }
  }

  /**
   * Handle set autoplay enabled
   * @param _ - IPC event
   * @param enabled - Autoplay enabled flag
   */
  private async handleSetAutoplayEnabled(_: any, enabled: boolean): Promise<void> {
    try {
      logger.info('Setting autoplay enabled', { enabled });

      // Update the autoplayEnabled setting in the reaperConnector's lastPlaybackState
      const playbackState = this.reaperConnector.getLastPlaybackState();
      playbackState.autoplayEnabled = enabled;

      // Emit a playback state update to the renderer
      this.sendToRenderer(IPC_EVENTS.PLAYBACK_STATE_UPDATE, playbackState);
    } catch (error) {
      logger.error('Error setting autoplay enabled', { error, enabled });
      this.sendStatusMessage(this.createErrorMessage('Failed to set autoplay enabled', String(error)));
      throw error;
    }
  }

  /**
   * Handle set count-in enabled
   * @param _ - IPC event
   * @param enabled - Count-in enabled flag
   */
  private async handleSetCountInEnabled(_: any, enabled: boolean): Promise<void> {
    try {
      logger.info('Setting count-in enabled', { enabled });

      // Update the countInEnabled setting in the reaperConnector's lastPlaybackState
      const playbackState = this.reaperConnector.getLastPlaybackState();
      playbackState.countInEnabled = enabled;

      // Emit a playback state update to the renderer
      this.sendToRenderer(IPC_EVENTS.PLAYBACK_STATE_UPDATE, playbackState);
    } catch (error) {
      logger.error('Error setting count-in enabled', { error, enabled });
      this.sendStatusMessage(this.createErrorMessage('Failed to set count-in enabled', String(error)));
      throw error;
    }
  }

  // Project handlers

  /**
   * Handle refresh project ID
   * @returns Project ID
   */
  private async handleRefreshProjectId(): Promise<string> {
    try {
      return await this.projectService.refreshProjectId();
    } catch (error) {
      logger.error('Error refreshing project ID', { error });
      this.sendStatusMessage(this.createErrorMessage('Failed to refresh project ID', String(error)));
      throw error;
    }
  }

  /**
   * Handle get project ID
   * @returns Project ID
   */
  private async handleGetProjectId(): Promise<string> {
    return this.projectService.getProjectId();
  }

  // Setlist handlers

  /**
   * Handle get setlists
   * @returns Setlists
   */
  private async handleGetSetlists(): Promise<any> {
    return this.projectService.getSetlists();
  }

  /**
   * Handle get setlist
   * @param _ - IPC event
   * @param setlistId - Setlist ID
   * @returns Setlist
   */
  private async handleGetSetlist(_: any, setlistId: string): Promise<any> {
    return this.projectService.getSetlist(setlistId);
  }

  /**
   * Handle create setlist
   * @param _ - IPC event
   * @param name - Setlist name
   * @returns Created setlist
   */
  private async handleCreateSetlist(_: any, name: string): Promise<any> {
    try {
      return await this.projectService.createSetlist(name);
    } catch (error) {
      logger.error('Error creating setlist', { error, name });
      this.sendStatusMessage(this.createErrorMessage('Failed to create setlist', String(error)));
      throw error;
    }
  }

  /**
   * Handle update setlist
   * @param _ - IPC event
   * @param params - Update parameters
   * @returns Updated setlist
   */
  private async handleUpdateSetlist(_: any, params: { setlistId: string, name: string }): Promise<any> {
    try {
      return await this.projectService.updateSetlist(params.setlistId, params.name);
    } catch (error) {
      logger.error('Error updating setlist', { error, params });
      this.sendStatusMessage(this.createErrorMessage('Failed to update setlist', String(error)));
      throw error;
    }
  }

  /**
   * Handle delete setlist
   * @param _ - IPC event
   * @param setlistId - Setlist ID
   * @returns Success flag
   */
  private async handleDeleteSetlist(_: any, setlistId: string): Promise<boolean> {
    try {
      return await this.projectService.deleteSetlist(setlistId);
    } catch (error) {
      logger.error('Error deleting setlist', { error, setlistId });
      this.sendStatusMessage(this.createErrorMessage('Failed to delete setlist', String(error)));
      throw error;
    }
  }

  /**
   * Handle add setlist item
   * @param _ - IPC event
   * @param params - Add parameters
   * @returns Added item
   */
  private async handleAddSetlistItem(_: any, params: { setlistId: string, regionId: string, regionName?: string, position?: number }): Promise<any> {
    try {
      // If regionName is provided, use it directly
      if (params.regionName) {
        logger.info(`Using provided region name: ${params.regionName}`);
        return await this.projectService.addSetlistItem(
          params.setlistId,
          params.regionId,
          params.regionName,
          params.position
        );
      }

      // Otherwise, try to get the region
      let region = this.regionService.getRegionById(params.regionId);

      // If region not found, try refreshing regions first
      if (!region) {
        logger.info(`Region ${params.regionId} not found, refreshing regions...`);
        await this.regionService.refreshRegions();

        // Try to get the region again after refresh
        region = this.regionService.getRegionById(params.regionId);

        // If still not found, create a placeholder region
        if (!region) {
          logger.warn(`Region ${params.regionId} still not found after refresh, using placeholder`);
          // Use a placeholder name for the region
          return await this.projectService.addSetlistItem(
            params.setlistId,
            params.regionId,
            `Region ${params.regionId}`,
            params.position
          );
        }
      }

      return await this.projectService.addSetlistItem(params.setlistId, params.regionId, region.name, params.position);
    } catch (error) {
      logger.error('Error adding setlist item', { error, params });
      this.sendStatusMessage(this.createErrorMessage('Failed to add setlist item', String(error)));
      throw error;
    }
  }

  /**
   * Handle remove setlist item
   * @param _ - IPC event
   * @param params - Remove parameters
   * @returns Success flag
   */
  private async handleRemoveSetlistItem(_: any, params: { setlistId: string, itemId: string }): Promise<boolean> {
    try {
      return await this.projectService.removeSetlistItem(params.setlistId, params.itemId);
    } catch (error) {
      logger.error('Error removing setlist item', { error, params });
      this.sendStatusMessage(this.createErrorMessage('Failed to remove setlist item', String(error)));
      throw error;
    }
  }

  /**
   * Handle move setlist item
   * @param _ - IPC event
   * @param params - Move parameters
   * @returns Updated setlist
   */
  private async handleMoveSetlistItem(_: any, params: { setlistId: string, itemId: string, newPosition: number }): Promise<any> {
    try {
      return await this.projectService.moveSetlistItem(params.setlistId, params.itemId, params.newPosition);
    } catch (error) {
      logger.error('Error moving setlist item', { error, params });
      this.sendStatusMessage(this.createErrorMessage('Failed to move setlist item', String(error)));
      throw error;
    }
  }

  /**
   * Handle set selected setlist
   * @param _ - IPC event
   * @param setlistId - Setlist ID or null
   */
  private async handleSetSelectedSetlist(_: any, setlistId: string | null): Promise<void> {
    try {
      await this.projectService.setSelectedSetlist(setlistId);
    } catch (error) {
      logger.error('Error setting selected setlist', { error, setlistId });
      this.sendStatusMessage(this.createErrorMessage('Failed to set selected setlist', String(error)));
      throw error;
    }
  }

  // MIDI handlers

  /**
   * Handle get MIDI devices
   * @returns MIDI devices
   */
  private async handleGetMidiDevices(): Promise<any> {
    return this.midiService.getDevices();
  }

  /**
   * Handle get MIDI config
   * @returns MIDI config
   */
  private async handleGetMidiConfig(): Promise<any> {
    return this.midiService.getConfig();
  }

  /**
   * Handle update MIDI config
   * @param _ - IPC event
   * @param config - MIDI config
   */
  private async handleUpdateMidiConfig(_: any, config: any): Promise<void> {
    try {
      this.midiService.updateConfig(config);
    } catch (error) {
      logger.error('Error updating MIDI config', { error, config });
      this.sendStatusMessage(this.createErrorMessage('Failed to update MIDI config', String(error)));
      throw error;
    }
  }

  /**
   * Handle connect to MIDI device
   * @param _ - IPC event
   * @param deviceId - Device ID
   * @returns Success flag
   */
  private async handleConnectToMidiDevice(_: any, deviceId: string): Promise<boolean> {
    try {
      return this.midiService.connectToDevice(deviceId);
    } catch (error) {
      logger.error('Error connecting to MIDI device', { error, deviceId });
      this.sendStatusMessage(this.createErrorMessage('Failed to connect to MIDI device', String(error)));
      throw error;
    }
  }

  /**
   * Handle simulate MIDI note
   * @param _ - IPC event
   * @param params - Note parameters
   */
  private async handleSimulateMidiNote(_: any, params: { note: number, velocity?: number, channel?: number }): Promise<void> {
    try {
      this.midiService.simulateNote(params.note, params.velocity, params.channel);
    } catch (error) {
      logger.error('Error simulating MIDI note', { error, params });
      this.sendStatusMessage(this.createErrorMessage('Failed to simulate MIDI note', String(error)));
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    // Remove all IPC handlers
    ipcMain.removeAllListeners(IPC_CHANNELS.REPORT_CONNECTION_STATUS);
    ipcMain.removeAllListeners(IPC_CHANNELS.REQUEST_RECONNECT);
    ipcMain.removeHandler(IPC_CHANNELS.PING);
    ipcMain.removeHandler(IPC_CHANNELS.REFRESH_REGIONS);
    ipcMain.removeHandler(IPC_CHANNELS.GET_REGIONS);
    ipcMain.removeHandler(IPC_CHANNELS.REFRESH_MARKERS);
    ipcMain.removeHandler(IPC_CHANNELS.GET_MARKERS);
    ipcMain.removeHandler(IPC_CHANNELS.TOGGLE_PLAY);
    ipcMain.removeHandler(IPC_CHANNELS.PLAY_WITH_COUNT_IN);
    ipcMain.removeHandler(IPC_CHANNELS.SEEK_TO_POSITION);
    ipcMain.removeHandler(IPC_CHANNELS.SEEK_TO_REGION);
    ipcMain.removeHandler(IPC_CHANNELS.NEXT_REGION);
    ipcMain.removeHandler(IPC_CHANNELS.PREVIOUS_REGION);
    ipcMain.removeHandler(IPC_CHANNELS.SEEK_TO_CURRENT_REGION_START);
    ipcMain.removeHandler(IPC_CHANNELS.SET_AUTOPLAY_ENABLED);
    ipcMain.removeHandler(IPC_CHANNELS.SET_COUNT_IN_ENABLED);
    ipcMain.removeHandler(IPC_CHANNELS.REFRESH_PROJECT_ID);
    ipcMain.removeHandler(IPC_CHANNELS.GET_PROJECT_ID);
    ipcMain.removeHandler(IPC_CHANNELS.GET_SETLISTS);
    ipcMain.removeHandler(IPC_CHANNELS.GET_SETLIST);
    ipcMain.removeHandler(IPC_CHANNELS.CREATE_SETLIST);
    ipcMain.removeHandler(IPC_CHANNELS.UPDATE_SETLIST);
    ipcMain.removeHandler(IPC_CHANNELS.DELETE_SETLIST);
    ipcMain.removeHandler(IPC_CHANNELS.ADD_SETLIST_ITEM);
    ipcMain.removeHandler(IPC_CHANNELS.REMOVE_SETLIST_ITEM);
    ipcMain.removeHandler(IPC_CHANNELS.MOVE_SETLIST_ITEM);
    ipcMain.removeHandler(IPC_CHANNELS.SET_SELECTED_SETLIST);
    ipcMain.removeHandler(IPC_CHANNELS.GET_MIDI_DEVICES);
    ipcMain.removeHandler(IPC_CHANNELS.GET_MIDI_CONFIG);
    ipcMain.removeHandler(IPC_CHANNELS.UPDATE_MIDI_CONFIG);
    ipcMain.removeHandler(IPC_CHANNELS.CONNECT_TO_MIDI_DEVICE);
    ipcMain.removeHandler(IPC_CHANNELS.SIMULATE_MIDI_NOTE);
  }
}
