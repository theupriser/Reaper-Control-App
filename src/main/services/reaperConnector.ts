/**
 * REAPER Connector
 * Handles communication with REAPER through its web interface
 */
import { EventEmitter } from 'events';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import config from '../utils/config';
import logger from '../utils/logger';
import { ConnectionStatus, Region, Marker, PlaybackState } from '../types';
import { bpmCalculator, getBpmForRegion } from '../utils/bpmUtils';

export class ReaperConnector extends EventEmitter {
  private axiosInstance: AxiosInstance;
  private connected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private pollingTimer: NodeJS.Timeout | null = null;
  private projectId: string = '';
  private lastPlaybackState: PlaybackState = {
    isPlaying: false,
    position: 0,
    bpm: 120,
    timeSignature: {
      numerator: 4,
      denominator: 4
    },
    autoplayEnabled: true,
    countInEnabled: false,
    isRecordingArmed: false,
    selectedSetlistId: null
  };

  constructor() {
    super();

    // Initialize axios instance in the connect method
    this.axiosInstance = axios.create();

    logger.info('REAPER connector initialized');
  }

  /**
   * Connect to REAPER
   */
  public async connect(): Promise<void> {
    if (this.connected) {
      logger.debug('Already connected to REAPER');
      return;
    }

    try {
      logger.info('Connecting to REAPER...');

      // Get fresh REAPER configuration
      const reaperConfig = config.getConfig().reaper;

      // Create or recreate axios instance with current config
      this.axiosInstance = axios.create({
        baseURL: `${reaperConfig.protocol}://${reaperConfig.host}:${reaperConfig.port}`,
        timeout: reaperConfig.connectionTimeout,
      });

      logger.info('Using REAPER configuration:', {
        host: reaperConfig.host,
        port: reaperConfig.port
      });

      // Test connection by getting transport state
      await this.getTransportState();

      // Connection successful
      this.connected = true;
      this.reconnectAttempts = 0;

      // Emit connection status
      this.emitConnectionStatus({
        connected: true,
        status: 'Connected to REAPER'
      });

      // Start polling for updates
      this.startPolling();

      // Get initial project ID
      await this.refreshProjectId();

      // Load initial markers and regions
      try {
        logger.info('Loading initial markers and regions');
        await this.refreshMarkers();
        await this.refreshRegions();

        // Check if REAPER is not playing and get the current region
        const transportState = await this.getTransportState();
        if (!transportState.isPlaying) {
          logger.info('REAPER is not playing, checking for !bpm markers in current region');

          // Get the current regions and markers
          const regions = await this.getRegions();
          const markers = await this.getMarkers();

          // Find the current region based on cursor position if currentRegionId is not available
          let currentRegion: Region | undefined = undefined;
          if (transportState.currentRegionId) {
            // Use String() to ensure type consistency when comparing IDs
            currentRegion = regions.find(region =>
              String(region.id) === String(transportState.currentRegionId) ||
              (!isNaN(Number(region.id)) && !isNaN(Number(transportState.currentRegionId)) &&
               Number(region.id) === Number(transportState.currentRegionId))
            );
          } else {
            // Find the region that contains the current cursor position
            const currentPosition = transportState.position;
            currentRegion = regions.find(region =>
              currentPosition >= region.start && currentPosition <= region.end
            );

            if (currentRegion) {
              logger.info(`Found current region by cursor position: ${currentRegion.name}`);
            }
          }

          if (currentRegion) {
            // Check if there's a !bpm marker in the current region
            const bpm = getBpmForRegion(currentRegion, markers);

            if (bpm !== null) {
              logger.info(`Found !bpm marker in current region: ${bpm} BPM`);

              // Set the initial BPM in the calculator
              bpmCalculator.resetBeatPositions(bpm);

              // Update the transport state with the BPM from the marker
              transportState.bpm = bpm;

              // Update the last playback state
              this.lastPlaybackState = {
                ...this.lastPlaybackState,
                bpm: bpm
              };

              // Emit updated playback state
              this.emit('playbackState', this.lastPlaybackState);
            }
          }
        }
      } catch (error) {
        logger.error('Failed to load initial markers and regions', { error });
        // Continue even if loading markers/regions fails
      }

      logger.info('Connected to REAPER successfully');
    } catch (error) {
      logger.error('Failed to connect to REAPER', { error });

      // Emit connection status
      this.emitConnectionStatus({
        connected: false,
        reason: 'connection_failed',
        status: 'Failed to connect to REAPER'
      });

      // Schedule reconnect
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from REAPER
   */
  public disconnect(): void {
    if (!this.connected) {
      return;
    }

    logger.info('Disconnecting from REAPER');

    // Stop polling
    this.stopPolling();

    // Cancel reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Update state
    this.connected = false;

    // Emit connection status
    this.emitConnectionStatus({
      connected: false,
      reason: 'disconnected',
      status: 'Disconnected from REAPER'
    });
  }

  /**
   * Check if connected to REAPER
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Schedule reconnect attempt
   */
  private scheduleReconnect(): void {
    const reaperConfig = config.getConfig().reaper;

    // Cancel existing timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Check if max reconnect attempts reached
    if (this.reconnectAttempts >= reaperConfig.maxReconnectAttempts) {
      logger.warn('Max reconnect attempts reached');

      // Emit connection status
      this.emitConnectionStatus({
        connected: false,
        reason: 'max_reconnect_attempts',
        status: 'Max reconnect attempts reached'
      });

      return;
    }

    // Increment reconnect attempts
    this.reconnectAttempts++;

    // Schedule reconnect
    this.reconnectTimer = setTimeout(() => {
      logger.info(`Reconnect attempt ${this.reconnectAttempts}/${reaperConfig.maxReconnectAttempts}`);

      // Emit connection status
      this.emitConnectionStatus({
        connected: false,
        reason: 'reconnecting',
        status: `Reconnecting to REAPER (attempt ${this.reconnectAttempts}/${reaperConfig.maxReconnectAttempts})`
      });

      // Attempt to connect
      this.connect();
    }, reaperConfig.reconnectInterval);
  }

  /**
   * Start polling for updates
   */
  private startPolling(): void {
    const reaperConfig = config.getConfig().reaper;

    // Cancel existing timer
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    // Start polling
    this.pollingTimer = setInterval(async () => {
      if (!this.connected) {
        return;
      }

      try {
        // Get transport state
        const transportState = await this.getTransportState();

        // Check if project changed
        if (transportState.projectId && transportState.projectId !== this.projectId) {
          logger.info('Project changed', {
            oldProjectId: this.projectId,
            newProjectId: transportState.projectId
          });

          // Update project ID
          this.projectId = transportState.projectId;

          // Emit project changed event
          this.emit('projectChanged', this.projectId);

          // Refresh regions and markers for the new project
          await this.refreshRegions();
          await this.refreshMarkers();
        }

        // Get beat position data from REAPER for BPM calculation
        try {
          const beatPosResponse = await this.getBeatPosition();
          const parts = beatPosResponse.split('\t');

          // BEATPOS response format:
          // BEATPOS \t playstate \t position_seconds \t full_beat_position \t measure_cnt \t beats_in_measure \t ts_numerator \t ts_denominator
          if (parts.length >= 4 && parts[0] === 'BEATPOS') {
            // Extract position in seconds and beat position
            const positionSeconds = parseFloat(parts[2]);
            const beatPosition = parseFloat(parts[3]);

            // Add the beat position to the calculator
            bpmCalculator.addBeatPosition(positionSeconds, beatPosition);

            // Calculate BPM using the last 2 playback states
            const calculatedBpm = bpmCalculator.calculateBPM(transportState.bpm);

            // Use the calculated BPM instead of the one from transportState
            transportState.bpm = calculatedBpm;

            logger.debug('Updated BPM using last 2 playback states', {
              calculatedBpm,
              originalBpm: transportState.bpm
            });
          }
        } catch (bpmError) {
          logger.warn('Error calculating BPM from beat positions', { error: bpmError });
          // Continue with the BPM from transportState if there's an error
        }

        // Update playback state
        this.lastPlaybackState = {
          isPlaying: transportState.isPlaying,
          position: transportState.position,
          // Preserve the current region ID if it's not provided in the transport state
          currentRegionId: transportState.currentRegionId !== undefined ?
            transportState.currentRegionId : this.lastPlaybackState.currentRegionId,
          // Preserve the selected setlist ID
          selectedSetlistId: transportState.selectedSetlistId !== undefined ?
            transportState.selectedSetlistId : this.lastPlaybackState.selectedSetlistId,
          bpm: transportState.bpm,
          timeSignature: transportState.timeSignature,
          // Preserve autoplay and count-in settings
          autoplayEnabled: transportState.autoplayEnabled !== undefined ?
            transportState.autoplayEnabled : this.lastPlaybackState.autoplayEnabled,
          countInEnabled: transportState.countInEnabled !== undefined ?
            transportState.countInEnabled : this.lastPlaybackState.countInEnabled,
          isRecordingArmed: transportState.isRecordingArmed !== undefined ?
            transportState.isRecordingArmed : this.lastPlaybackState.isRecordingArmed
        };

        // Log if we're preserving the current region ID
        if (transportState.currentRegionId === undefined && this.lastPlaybackState.currentRegionId !== null) {
          logger.debug('Preserving current region ID in playback state', {
            currentRegionId: this.lastPlaybackState.currentRegionId
          });
        }

        // Emit playback state update
        this.emit('playbackState', this.lastPlaybackState);
      } catch (error) {
        logger.error('Error polling REAPER', { error });

        // Handle connection error
        this.handleConnectionError(error);
      }
    }, reaperConfig.pollingInterval);
  }

  /**
   * Stop polling for updates
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Handle connection error
   * @param error - The error that occurred
   */
  private handleConnectionError(error: any): void {
    logger.error('REAPER connection error', { error });

    // Update state
    this.connected = false;

    // Stop polling
    this.stopPolling();

    // Emit connection status
    this.emitConnectionStatus({
      connected: false,
      reason: 'connection_error',
      status: 'Connection to REAPER lost'
    });

    // Schedule reconnect
    this.scheduleReconnect();
  }

  /**
   * Emit connection status
   * @param status - The connection status
   */
  private emitConnectionStatus(status: ConnectionStatus): void {
    this.emit('connectionChange', status);
  }

  /**
   * Make a request to the REAPER API with retry capability
   * @param method - HTTP method
   * @param endpoint - API endpoint
   * @param data - Request data
   * @param retryCount - Number of retry attempts (default: 3)
   * @param retryDelay - Delay between retries in milliseconds (default: 1000)
   * @returns Response data
   */
  private async makeRequest<T>(
    method: string,
    endpoint: string,
    data?: any,
    retryCount: number = 3,
    retryDelay: number = 1000
  ): Promise<T> {
    let attempts = 0;

    // Check if axios instance exists, create if needed
    if (!this.axiosInstance) {
      logger.warn('Axios instance not initialized, attempting to create it now');
      const reaperConfig = config.getConfig().reaper;
      this.axiosInstance = axios.create({
        baseURL: `${reaperConfig.protocol}://${reaperConfig.host}:${reaperConfig.port}`,
        timeout: reaperConfig.connectionTimeout,
      });
    }

    while (attempts <= retryCount) {
      try {
        const config: AxiosRequestConfig = {
          method,
          url: endpoint,
          data,
          timeout: 5000 // 5 second timeout
        };

        logger.debug(`Making request to REAPER API: ${method} ${endpoint}${attempts > 0 ? ` (retry ${attempts}/${retryCount})` : ''}`);

        const response = await this.axiosInstance.request<T>(config);
        logger.debug(`Received response from REAPER API: ${method} ${endpoint}`, {
          status: response.status,
          statusText: response.statusText
        });

        return response.data;
      } catch (error: any) {
        attempts++;

        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          logger.warn(`Request to REAPER API timed out: ${method} ${endpoint}`);
        } else {
          logger.error(`REAPER API request failed: ${method} ${endpoint}`, { error });
        }

        // If we've reached the maximum number of attempts, handle the connection error and throw
        if (attempts > retryCount) {
          logger.error(`REAPER API request failed after ${retryCount} attempts: ${method} ${endpoint}`);
          this.handleConnectionError(error);
          throw error;
        }

        // Otherwise, wait and retry
        logger.info(`Retrying request to REAPER API in ${retryDelay}ms: ${method} ${endpoint} (attempt ${attempts}/${retryCount})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    // This should never be reached, but TypeScript requires a return statement
    throw new Error(`Unexpected error in makeRequest: ${method} ${endpoint}`);
  }

  /**
   * Format transport response from REAPER
   * @param response - Raw response from REAPER
   * @returns Formatted transport state
   */
  private async formatTransportResponse(response: string): Promise<any> {
    logger.debug('Formatting transport response');

    try {
      // Split the response into lines
      const lines = response.split('\n');
      logger.debug('Transport response split into lines', { count: lines.length });

      // Initialize transport state with defaults
      const transportState = {
        isPlaying: false,
        position: 0,
        projectId: this.projectId || '', // Use current project ID if available
        bpm: 120,
        timeSignature: {
          numerator: 4,
          denominator: 4
        },
        autoplayEnabled: this.lastPlaybackState.autoplayEnabled,
        countInEnabled: this.lastPlaybackState.countInEnabled,
        isRecordingArmed: this.lastPlaybackState.isRecordingArmed
      };

      // Process each line
      for (const line of lines) {
        // Skip empty lines
        if (!line.trim()) continue;

        // Parse the line
        const parts = line.split('\t');

        // Check if this is a transport line
        if (parts[0] === 'TRANSPORT') {
          // Extract transport information
          if (parts.length >= 2) {
            // Check play state (5 = recording, 1 = playing, 0 = stopped)
            transportState.isPlaying = parts[1] === '1' || parts[1] === '5';
          }

          if (parts.length >= 3) {
            // Extract position
            transportState.position = parseFloat(parts[2]);
          }
        }
        // Check if this is a tempo line
        else if (parts[0] === 'TEMPO') {
          if (parts.length >= 2) {
            // Extract BPM from REAPER's response
            const reaperBpm = parseFloat(parts[1]);
            transportState.bpm = reaperBpm;
          }

          if (parts.length >= 4) {
            // Extract time signature
            transportState.timeSignature = {
              numerator: parseInt(parts[2], 10),
              denominator: parseInt(parts[3], 10)
            };
          }
        }
      }

      // Get the BPM from the bpmCalculator, which may include !bpm marker values
      try {
        const calculatedBpm = bpmCalculator.calculateBPM(transportState.bpm);
        if (calculatedBpm !== transportState.bpm) {
          logger.debug(`Using calculated BPM (${calculatedBpm}) instead of REAPER BPM (${transportState.bpm})`);
          transportState.bpm = calculatedBpm;
        }
      } catch (bpmError) {
        logger.warn('Error getting calculated BPM, using REAPER BPM', { error: bpmError });
      }

      logger.debug('Formatted transport state', transportState);
      return transportState;
    } catch (error) {
      logger.error('Error formatting transport response', { error });

      // Return default transport state in case of error
      return {
        isPlaying: this.lastPlaybackState.isPlaying,
        position: this.lastPlaybackState.position,
        projectId: this.projectId || '',
        bpm: 120,
        timeSignature: {
          numerator: 4,
          denominator: 4
        },
        autoplayEnabled: this.lastPlaybackState.autoplayEnabled,
        countInEnabled: this.lastPlaybackState.countInEnabled,
        isRecordingArmed: this.lastPlaybackState.isRecordingArmed
      };
    }
  }

  /**
   * Get the last known playback state
   * @returns The last known playback state
   */
  public getLastPlaybackState(): PlaybackState {
    return this.lastPlaybackState;
  }

  /**
   * Set the selected setlist ID in the playback state
   * @param setlistId - Setlist ID or null for all regions
   */
  public setSelectedSetlistId(setlistId: string | null): void {
    // Update the last playback state
    this.lastPlaybackState = {
      ...this.lastPlaybackState,
      selectedSetlistId: setlistId
    };

    // Emit playback state update
    this.emit('playbackState', this.lastPlaybackState);

    logger.info('Updated selected setlist ID in playback state', { setlistId });
  }

  /**
   * Get transport state from REAPER
   * @returns Transport state
   */
  private async getTransportState(): Promise<any> {
    try {
      // Make a request to the REAPER API to get transport state
      const response = await this.makeRequest<string>('GET', '_/TRANSPORT');

      // Format the response (now async)
      const transportState = await this.formatTransportResponse(response);

      // Add project ID to transport state
      transportState.projectId = this.projectId || '';

      // Determine current region based on cursor position
      try {
        // Get the current regions
        const regions = await this.getRegions();

        // Find the region that contains the current cursor position
        const currentPosition = transportState.position;
        const currentRegion = regions.find(region =>
          currentPosition >= region.start && currentPosition <= region.end
        );

        // Set the current region ID if found
        if (currentRegion) {
          transportState.currentRegionId = currentRegion.id;
          logger.debug('Current region determined by cursor position', {
            regionId: currentRegion.id,
            regionName: currentRegion.name,
            cursorPosition: currentPosition
          });
        }
      } catch (regionError) {
        logger.warn('Failed to determine current region by cursor position', { error: regionError });
        // Keep the previous currentRegionId if we couldn't determine a new one
        transportState.currentRegionId = this.lastPlaybackState.currentRegionId;
      }

      // Preserve the selected setlist ID
      transportState.selectedSetlistId = this.lastPlaybackState.selectedSetlistId;

      return transportState;
    } catch (error) {
      logger.error('Failed to get transport state', { error });

      // Return last known state in case of error
      return {
        isPlaying: this.lastPlaybackState.isPlaying,
        position: this.lastPlaybackState.position,
        projectId: this.projectId || '',
        bpm: this.lastPlaybackState.bpm,
        timeSignature: this.lastPlaybackState.timeSignature,
        currentRegionId: this.lastPlaybackState.currentRegionId,
        selectedSetlistId: this.lastPlaybackState.selectedSetlistId
      };
    }
  }

  /**
   * Format regions response from REAPER
   * @param response - Raw response from REAPER
   * @returns Formatted regions
   */
  private formatRegionsResponse(response: string): Region[] {
    logger.debug('Formatting regions response');

    try {
      // Initialize regions array
      const regions: Region[] = [];

      // Split the response into lines
      const lines = response.split('\n');
      logger.debug('Regions response split into lines', { count: lines.length });

      // Process each line
      for (const line of lines) {
        // Skip empty lines
        if (!line.trim()) continue;

        // Parse the line
        const parts = line.split('\t');

        // Check if this is a region line
        if (parts[0] === 'REGION' && parts.length >= 5) {
          // Extract region information
          // Parts[2] = region ID
          // Parts[1] = region name
          // Parts[3] = start position
          // Parts[4] = end position
          const region: Region = {
            id: parts[2],
            name: parts[1],
            start: parseFloat(parts[3]),
            end: parseFloat(parts[4])
          };

          // Add color if available (index 5)
          if (parts.length >= 6 && parts[5]) {
            region.color = parts[5];
          }

          // Add the region to the array
          regions.push(region);
        }
      }

      logger.debug('Formatted regions', { count: regions.length });
      return regions;
    } catch (error) {
      logger.error('Error formatting regions response', { error });

      // Return empty array in case of error
      return [];
    }
  }

  /**
   * Refresh regions from REAPER
   * @returns Regions
   */
  public async refreshRegions(): Promise<Region[]> {
    try {
      logger.debug('Refreshing regions from REAPER');

      // Make a request to the REAPER API to get regions
      const response = await this.makeRequest<string>('GET', '_/REGION');

      // Format the response
      const regions = this.formatRegionsResponse(response);

      // Emit regions update
      this.emit('regions', regions);

      return regions;
    } catch (error) {
      logger.error('Failed to refresh regions', { error });

      // Emit empty regions array in case of error
      this.emit('regions', []);

      throw error;
    }
  }

  /**
   * Get regions from REAPER
   * @returns Regions
   */
  public async getRegions(): Promise<Region[]> {
    return this.refreshRegions();
  }

  /**
   * Format markers response from REAPER
   * @param response - Raw response from REAPER
   * @returns Formatted markers
   */
  private formatMarkersResponse(response: string): Marker[] {
    logger.debug('Formatting markers response');

    try {
      // Initialize markers array
      const markers: Marker[] = [];

      // Split the response into lines
      const lines = response.split('\n');
      logger.debug('Markers response split into lines', { count: lines.length });

      // Process each line
      for (const line of lines) {
        // Skip empty lines
        if (!line.trim()) continue;

        // Parse the line
        const parts = line.split('\t');

        // Check if this is a marker line
        if (parts[0] === 'MARKER' && parts.length >= 4) {
          // Extract marker information
          const marker: Marker = {
            id: parts[2],
            name: parts[1],
            position: parseFloat(parts[3])
          };

          // Add color if available (index 4)
          if (parts.length >= 5 && parts[4]) {
            marker.color = parts[4];
          }

          // Add the marker to the array
          markers.push(marker);
        }
      }

      logger.debug('Formatted markers', { count: markers.length });
      return markers;
    } catch (error) {
      logger.error('Error formatting markers response', { error });

      // Return empty array in case of error
      return [];
    }
  }

  /**
   * Refresh markers from REAPER
   * @returns Markers
   */
  public async refreshMarkers(): Promise<Marker[]> {
    try {
      logger.debug('Refreshing markers from REAPER');

      // Make a request to the REAPER API to get markers
      const response = await this.makeRequest<string>('GET', '_/MARKER');

      // Format the response
      const markers = this.formatMarkersResponse(response);

      // Emit markers update
      this.emit('markers', markers);

      return markers;
    } catch (error) {
      logger.error('Failed to refresh markers', { error });

      // Emit empty markers array in case of error
      this.emit('markers', []);

      throw error;
    }
  }

  /**
   * Get markers from REAPER
   * @returns Markers
   */
  public async getMarkers(): Promise<Marker[]> {
    return this.refreshMarkers();
  }

  /**
   * Toggle play/pause in REAPER, with recording support
   */
  public async togglePlay(): Promise<void> {
    try {
      logger.debug('Toggling play/pause in REAPER');

      // Store the current state before toggling
      const wasPlaying = this.lastPlaybackState.isPlaying;
      const isRecordingArmed = this.lastPlaybackState.isRecordingArmed || false;

      // Use different action IDs for play and pause to avoid issues
      if (!wasPlaying) {
        if (isRecordingArmed) {
          // If it was paused and recording is armed, start recording (40046)
          logger.debug('Sending start recording command to REAPER (action ID 40046)');
          await this.makeRequest<string>('GET', '_/40046');
        } else {
          // If it was paused and not recording, send play command (1007)
          logger.debug('Sending play command to REAPER (action ID 1007)');
          await this.makeRequest<string>('GET', '_/1007');
        }
      } else {
        // if (isRecordingArmed) {
        //   // If it was recording, stop and save (40667)
        //   logger.debug('Sending stop recording command to REAPER (action ID 40667)');
        //   await this.makeRequest<string>('GET', '_/40667');
        // } else {
          // If it was playing but not recording, pause (1008)
          logger.debug('Sending pause command to REAPER (action ID 1008)');
          await this.makeRequest<string>('GET', '_/1008');
        // }
      }

      // Get updated transport state from REAPER to ensure we're in sync
      const transportState = await this.getTransportState();

      // Update last playback state with the actual state from REAPER
      this.lastPlaybackState = transportState;

      // Emit playback state update again with the confirmed state from REAPER
      this.emit('playbackState', this.lastPlaybackState);

      logger.debug('Play/pause toggled with REAPER', { isPlaying: this.lastPlaybackState.isPlaying });
    } catch (error) {
      logger.error('Failed to toggle play', { error });
      throw error;
    }
  }

  /**
   * Pause playback in REAPER using MIDI pause event command
   */
  public async pause(): Promise<void> {
    try {
      logger.debug('Pausing REAPER with MIDI pause event command (action ID 1008)');

      // Store the current state
      const wasPlaying = this.lastPlaybackState.isPlaying;

      // If already paused, no need to do anything
      if (!wasPlaying) {
        logger.debug('Already paused, no action needed');
        return;
      }

      // Removed optimistic UI update to prevent flickering

      // Send the 1008 command to REAPER
      logger.debug('Sending pause command to REAPER (action ID 1008)');
      await this.makeRequest<string>('GET', '_/1008');

      // Get updated transport state from REAPER to ensure we're in sync
      const transportState = await this.getTransportState();

      // Update last playback state with the actual state from REAPER
      this.lastPlaybackState = transportState;

      // Emit playback state update again with the confirmed state from REAPER
      this.emit('playbackState', this.lastPlaybackState);

      logger.debug('Pause command sent to REAPER', { isPlaying: this.lastPlaybackState.isPlaying });
    } catch (error) {
      logger.error('Failed to pause with action ID 1008 command', { error });
      throw error;
    }
  }

  /**
   * Set recording armed state
   * @param enabled Whether recording is armed
   */
  public async setRecordingArmed(enabled: boolean): Promise<void> {
    try {
      logger.debug(`Setting recording armed state to ${enabled}`);

      // Check if we're disabling recording that was previously armed
      const wasArmed = this.lastPlaybackState.isRecordingArmed;

      // Update local state
      this.lastPlaybackState = {
        ...this.lastPlaybackState,
        isRecordingArmed: enabled
      };

      // If recording is being disabled, send commands to REAPER
      if (wasArmed && !enabled) {
        logger.debug('Disabling armed recording, sending required commands to REAPER');

        // Send pause command first (action ID 1008)
        logger.debug('Sending pause command to REAPER (action ID 1008)');
        await this.makeRequest<string>('GET', '_/1008');

        // Then send stop recording command (action ID 40667)
        logger.debug('Sending stop recording command to REAPER (action ID 40667)');
        await this.makeRequest<string>('GET', '_/40667');

        // Get updated transport state from REAPER to ensure we're in sync
        const transportState = await this.getTransportState();

        // Update last playback state with the actual state from REAPER
        this.lastPlaybackState = {
          ...transportState,
          isRecordingArmed: false // Ensure it's set to false
        };
      }

      // Emit playback state update with the new recording armed state
      this.emit('playbackState', this.lastPlaybackState);

      logger.debug('Recording armed state updated', { isRecordingArmed: enabled });
    } catch (error) {
      logger.error('Failed to set recording armed state', { error });
      throw error;
    }
  }

  /**
   * Start playback with count-in in REAPER
   */
  public async playWithCountIn(): Promise<void> {
    try {
      logger.debug('Starting playback with count-in in REAPER');

      // Removed optimistic UI update to prevent flickering

      // Enable count-in (Action ID 40363)
      logger.debug('Enabling count-in in REAPER (action ID 40363)');
      await this.makeRequest<string>('GET', '_/40363');

      // Start playback (Action ID 1007)
      logger.debug('Starting playback in REAPER (action ID 1007)');
      await this.makeRequest<string>('GET', '_/1007');

      // Get updated transport state from REAPER to ensure we're in sync
      const transportState = await this.getTransportState();

      // Update last playback state with the actual state from REAPER
      this.lastPlaybackState = transportState;

      // Emit playback state update again with the confirmed state from REAPER
      this.emit('playbackState', this.lastPlaybackState);

      logger.debug('Playback with count-in started in REAPER', { isPlaying: this.lastPlaybackState.isPlaying });
    } catch (error) {
      logger.error('Failed to start playback with count-in', { error });
      throw error;
    }
  }

  /**
   * Seek to position in REAPER
   * @param position - Position to seek to
   * @param useCountIn - Whether to use count-in when seeking (positions cursor 2 bars before)
   */
  public async seekToPosition(position: number, useCountIn: boolean = false): Promise<void> {
    try {
      logger.debug('Seeking to position in REAPER', { position, useCountIn });

      // Store the current playback state before seeking
      const wasPlaying = this.lastPlaybackState.isPlaying;
      logger.debug(`Current playback state before seeking: playing=${wasPlaying}`);

      let positionToSeek = position;

      // If count-in is enabled, position the cursor 2 bars before the marker
      if (useCountIn) {
        try {
          logger.debug('Count-in enabled, calculating position 2 bars before target position');

          // Get the duration of 2 bars in seconds based on the current time signature
          const countInDuration = await this.calculateBarsToSeconds(2);

          // Calculate position 2 bars before target position
          // Ensure we don't go before the start of the project (negative time)
          positionToSeek = Math.max(0, position - countInDuration);
          logger.debug(`Positioning cursor 2 bars (${countInDuration.toFixed(2)}s) before target at ${positionToSeek.toFixed(2)}s`);
        } catch (error) {
          // Fallback to default calculation if there's an error
          logger.error('Error calculating count-in position, using default', { error });
          positionToSeek = Math.max(0, position - 4); // Default to 4 seconds (2 bars at 4/4 and 120 BPM)
          logger.debug(`Using fallback: positioning cursor 2 bars (4s) before target at ${positionToSeek.toFixed(2)}s`);
        }
      }

      // If currently playing, pause first
      if (wasPlaying) {
        logger.debug('Currently playing, pausing before seeking');
        await this.makeRequest<string>('GET', '_/1008'); // Pause (action ID 1008)
        await new Promise(resolve => setTimeout(resolve, 150)); // Short delay
      }

      // Send the seek command to REAPER
      await this.makeRequest<string>('GET', `_/SET/POS/${positionToSeek}`);

      // If was playing before, resume playback
      if (wasPlaying) {
        logger.debug('Resuming playback after seeking');
        await new Promise(resolve => setTimeout(resolve, 150)); // Short delay
        await this.makeRequest<string>('GET', '_/1007'); // Play (action ID 1007)
      }

      // Get updated transport state
      const transportState = await this.getTransportState();

      // Update last playback state
      this.lastPlaybackState = transportState;

      // Emit playback state update
      this.emit('playbackState', this.lastPlaybackState);

      logger.debug('Seeked to position', {
        requestedPosition: position,
        actualPosition: positionToSeek,
        currentPosition: this.lastPlaybackState.position,
        wasPlaying,
        isPlayingNow: this.lastPlaybackState.isPlaying,
        useCountIn
      });
    } catch (error) {
      logger.error('Failed to seek to position', { error, position, useCountIn });
      throw error;
    }
  }

  /**
   * Seek to region in REAPER
   * @param regionId - Region ID to seek to
   * @param skipRegionRefresh - Skip refreshing regions if we already have them
   */
  public async seekToRegion(regionId: string | number, skipRegionRefresh: boolean = false): Promise<void> {
    try {
      logger.debug('Seeking to region in REAPER', { regionId, regionIdType: typeof regionId, skipRegionRefresh });

      // Get regions - either fetch them directly or skip if explicitly requested
      let regions: Region[] = [];
      if (!skipRegionRefresh) {
        regions = await this.getRegions();
      } else {
        // If skipRegionRefresh is true, we still need to get regions from somewhere
        // Since we don't have a cached regions property, we'll fetch them directly
        regions = await this.getRegions();
        logger.debug('Using regions without re-fetching', { regionCount: regions.length });
      }

      // First try an exact string match
      let region = regions.find(r => String(r.id) === String(regionId));

      // If no match found, try numeric comparison (in case of type mismatch)
      if (!region && !isNaN(Number(regionId))) {
        region = regions.find(r => !isNaN(Number(r.id)) && Number(r.id) === Number(regionId));

        if (region) {
          logger.debug('Found region using numeric ID matching', {
            requestedId: regionId,
            foundId: region.id,
            regionName: region.name
          });
        }
      }

      if (!region) {
        logger.error('Region not found', {
          regionId,
          regionIdType: typeof regionId,
          availableRegionIds: regions.map(r => ({ id: r.id, type: typeof r.id }))
        });
        throw new Error(`Region not found: ${regionId}`);
      }

      logger.debug('Found region', { region, regionIdType: typeof region.id });

      // Seek to region start with a small margin to ensure cursor is within the region
      const positionWithMargin = region.start + 0.001;
      await this.seekToPosition(positionWithMargin);

      // Update current region ID - convert to string to match the PlaybackState interface
      this.lastPlaybackState.currentRegionId = String(regionId);

      // Emit playback state update
      this.emit('playbackState', this.lastPlaybackState);

      logger.debug('Seeked to region', {
        regionId,
        regionName: region.name,
        position: positionWithMargin
      });
    } catch (error) {
      logger.error('Failed to seek to region', { error, regionId });
      throw error;
    }
  }

  /**
   * Go to next region in REAPER
   */
  public async nextRegion(): Promise<void> {
    try {
      logger.debug('Going to next region in REAPER');

      // Get regions
      const regions = await this.getRegions();

      // Get current transport state to ensure we have the latest currentRegionId
      const transportState = await this.getTransportState();
      this.lastPlaybackState = transportState;

      // Find current region index using string comparison to handle type differences
      const currentIndex = regions.findIndex(r =>
        String(r.id) === String(this.lastPlaybackState.currentRegionId) ||
        (!isNaN(Number(r.id)) && !isNaN(Number(this.lastPlaybackState.currentRegionId)) &&
         Number(r.id) === Number(this.lastPlaybackState.currentRegionId))
      );

      if (currentIndex === -1 || currentIndex >= regions.length - 1) {
        logger.warn('No next region available', {
          currentRegionId: this.lastPlaybackState.currentRegionId,
          currentRegionIdType: typeof this.lastPlaybackState.currentRegionId,
          currentIndex,
          totalRegions: regions.length,
          availableRegionIds: regions.slice(0, 5).map(r => ({ id: r.id, type: typeof r.id }))
        });
        throw new Error('No next region');
      }

      // Get next region
      const nextRegion = regions[currentIndex + 1];
      logger.debug('Found next region', {
        currentIndex,
        nextIndex: currentIndex + 1,
        nextRegionId: nextRegion.id,
        nextRegionName: nextRegion.name
      });

      // Seek to next region
      await this.seekToRegion(nextRegion.id);

      logger.debug('Moved to next region', {
        regionId: nextRegion.id,
        regionName: nextRegion.name
      });
    } catch (error) {
      logger.error('Failed to go to next region', { error });
      throw error;
    }
  }

  /**
   * Go to previous region in REAPER
   */
  public async previousRegion(): Promise<void> {
    try {
      logger.debug('Going to previous region in REAPER');

      // Get regions
      const regions = await this.getRegions();

      // Get current transport state to ensure we have the latest currentRegionId
      const transportState = await this.getTransportState();
      this.lastPlaybackState = transportState;

      // Find current region index using string comparison to handle type differences
      const currentIndex = regions.findIndex(r =>
        String(r.id) === String(this.lastPlaybackState.currentRegionId) ||
        (!isNaN(Number(r.id)) && !isNaN(Number(this.lastPlaybackState.currentRegionId)) &&
         Number(r.id) === Number(this.lastPlaybackState.currentRegionId))
      );

      if (currentIndex <= 0) {
        logger.warn('No previous region available', {
          currentRegionId: this.lastPlaybackState.currentRegionId,
          currentRegionIdType: typeof this.lastPlaybackState.currentRegionId,
          currentIndex,
          totalRegions: regions.length,
          availableRegionIds: regions.slice(0, 5).map(r => ({ id: r.id, type: typeof r.id }))
        });
        throw new Error('No previous region');
      }

      // Get previous region
      const prevRegion = regions[currentIndex - 1];
      logger.debug('Found previous region', {
        currentIndex,
        prevIndex: currentIndex - 1,
        prevRegionId: prevRegion.id,
        prevRegionName: prevRegion.name
      });

      // Seek to previous region
      await this.seekToRegion(prevRegion.id);

      logger.debug('Moved to previous region', {
        regionId: prevRegion.id,
        regionName: prevRegion.name
      });
    } catch (error) {
      logger.error('Failed to go to previous region', { error });
      throw error;
    }
  }

  /**
   * Seek to current region start in REAPER
   */
  public async seekToCurrentRegionStart(): Promise<void> {
    try {
      logger.debug('Seeking to current region start in REAPER');

      // Get regions
      const regions = await this.getRegions();

      // Get current transport state to ensure we have the latest currentRegionId
      const transportState = await this.getTransportState();
      this.lastPlaybackState = transportState;

      // Find current region
      // Use String() to ensure type consistency when comparing IDs
      const currentRegion = regions.find(r =>
        String(r.id) === String(this.lastPlaybackState.currentRegionId) ||
        (!isNaN(Number(r.id)) && !isNaN(Number(this.lastPlaybackState.currentRegionId)) &&
         Number(r.id) === Number(this.lastPlaybackState.currentRegionId))
      );
      if (!currentRegion) {
        logger.warn('Current region not found', {
          currentRegionId: this.lastPlaybackState.currentRegionId,
          availableRegions: regions.map(r => ({ id: r.id, name: r.name }))
        });
        throw new Error('Current region not found');
      }

      logger.debug('Found current region', {
        regionId: currentRegion.id,
        regionName: currentRegion.name,
        start: currentRegion.start
      });

      // Seek to region start with a small margin to ensure cursor is within the region
      const positionWithMargin = currentRegion.start + 0.001;
      await this.seekToPosition(positionWithMargin);

      logger.debug('Seeked to current region start', {
        regionId: currentRegion.id,
        regionName: currentRegion.name,
        position: positionWithMargin
      });
    } catch (error) {
      logger.error('Failed to seek to current region start', { error });
      throw error;
    }
  }

  /**
   * Refresh project ID from REAPER
   * @returns Project ID
   */
  public async refreshProjectId(): Promise<string> {
    try {
      logger.debug('Refreshing project ID from REAPER');

      // Define section and key for project ID in REAPER's extended state
      const projectSection = 'ReaperControl';
      const projectIdKey = 'ProjectId';

      // Try to get the existing project ID
      let projectId = await this.getProjectExtState(projectSection, projectIdKey);

      // If no project ID exists, generate one and save it
      if (!projectId) {
        // Generate a unique ID (using a similar approach to UUID)
        projectId = `project-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        logger.info(`Generated new project ID: ${projectId}`);

        try {
          // Save the project ID to REAPER's extended state
          await this.setProjectExtState(projectSection, projectIdKey, projectId);
          logger.info('Saved project ID to REAPER project');
        } catch (saveError) {
          logger.error('Error saving project ID to REAPER project', { error: saveError });
          // Continue with the new ID even if saving fails
          logger.info('Continuing with new project ID despite save error');
        }
      } else {
        logger.info(`Retrieved existing project ID: ${projectId}`);
      }

      // Update project ID
      this.projectId = projectId;

      // Emit project ID update
      this.emit('projectId', projectId);

      return projectId;
    } catch (error) {
      logger.error('Failed to refresh project ID', { error });

      // If there's an error, generate a fallback ID
      try {
        // Generate a fallback ID
        const fallbackId = `project-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        logger.info(`Generated fallback project ID due to error: ${fallbackId}`);

        // Update project ID
        this.projectId = fallbackId;

        // Emit project ID update
        this.emit('projectId', fallbackId);

        return fallbackId;
      } catch (fallbackError) {
        logger.error('Error generating fallback project ID', { error: fallbackError });
        throw error; // Throw the original error
      }
    }
  }

  /**
   * Get project ID from REAPER
   * @returns Project ID
   */
  public async getProjectId(): Promise<string> {
    // If we already have a project ID, return it
    if (this.projectId) {
      return this.projectId;
    }

    // Otherwise, refresh the project ID from REAPER
    return await this.refreshProjectId();
  }

  /**
   * Get project extended state from REAPER
   * @param section - Section name
   * @param key - Key name
   * @returns Value or empty string if not found
   */
  public async getProjectExtState(section: string, key: string): Promise<string> {
    try {
      logger.debug('Getting project extended state', { section, key });

      // URL encode the section and key
      const encodedSection = encodeURIComponent(section);
      const encodedKey = encodeURIComponent(key);

      // Make a request to the REAPER API to get project extended state
      const response = await this.makeRequest<string>('GET', `_/GET/PROJEXTSTATE/${encodedSection}/${encodedKey}`);

      // Parse the response
      const lines = response.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;

        const parts = line.split('\t');
        if (parts[0] === 'PROJEXTSTATE' && parts.length >= 4) {
          // The value is in the 4th part (index 3)
          const value = parts[3];

          // Decode any escaped characters
          const decodedValue = value
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\');

          logger.debug('Found project extended state value', { section, key, value: decodedValue });
          return decodedValue;
        }
      }

      // If we get here, no value was found
      logger.debug('No project extended state found', { section, key });
      return '';
    } catch (error) {
      logger.error('Failed to get project extended state', { error, section, key });
      throw error;
    }
  }

  /**
   * Set project extended state in REAPER
   * @param section - Section name
   * @param key - Key name
   * @param value - Value to set
   */
  public async setProjectExtState(section: string, key: string, value: string): Promise<void> {
    try {
      logger.debug('Setting project extended state', { section, key, value });

      // URL encode the section, key, and value
      const encodedSection = encodeURIComponent(section);
      const encodedKey = encodeURIComponent(key);
      const encodedValue = encodeURIComponent(value);

      // Make a request to the REAPER API to set project extended state
      await this.makeRequest<string>('GET', `_/SET/PROJEXTSTATE/${encodedSection}/${encodedKey}/${encodedValue}`);

      logger.debug('Project extended state set successfully', { section, key });
    } catch (error) {
      logger.error('Failed to set project extended state', { error, section, key });
      throw error;
    }
  }

  /**
   * Get beat position and time signature from REAPER
   * @returns Raw beat position response
   */
  public async getBeatPosition(): Promise<string> {
    try {
      logger.debug('Getting beat position from REAPER');
      return await this.makeRequest<string>('GET', '_/BEATPOS');
    } catch (error) {
      logger.error('Failed to get beat position', { error });
      throw error;
    }
  }

  /**
   * Get the current BPM from REAPER by calculating it from the BEATPOS response
   * Uses the bpmCalculator utility for consistent BPM calculation
   * @returns Current BPM
   */
  public async getBPM(): Promise<number> {
    try {
      logger.debug('Getting BPM from REAPER');

      // Get the beat position data from REAPER
      const beatPosResponse = await this.getBeatPosition();

      // Parse the response
      const parts = beatPosResponse.split('\t');

      // BEATPOS response format:
      // BEATPOS \t playstate \t position_seconds \t full_beat_position \t measure_cnt \t beats_in_measure \t ts_numerator \t ts_denominator
      if (parts.length >= 4 && parts[0] === 'BEATPOS') {
        // Extract position in seconds and beat position
        const positionSeconds = parseFloat(parts[2]);
        const beatPosition = parseFloat(parts[3]);

        logger.debug('Beat position data', { positionSeconds, beatPosition });

        // Add the beat position to the calculator
        bpmCalculator.addBeatPosition(positionSeconds, beatPosition);

        // Calculate BPM using the utility
        const bpm = bpmCalculator.calculateBPM(120); // Default to 120 BPM if calculation fails

        return bpm;
      } else {
        logger.warn('Invalid BEATPOS response format, using fallback BPM calculation');
        const bpm = bpmCalculator.calculateBPM(120);
        return bpm;
      }
    } catch (error) {
      logger.error('Error calculating BPM from BEATPOS', { error });
      return bpmCalculator.calculateBPM(120);
    }
  }

  /**
   * Reset the beat positions array
   * This should be called when the region changes or when the tempo changes significantly
   * @param initialBpm - Optional initial BPM to use (from !bpm marker)
   */
  public resetBeatPositions(initialBpm: number | null = null): void {
    logger.debug('Resetting beat positions', { initialBpm });

    // Use the bpmCalculator utility to reset beat positions
    bpmCalculator.resetBeatPositions(initialBpm);
  }

  /**
   * Get the current time signature from REAPER
   * @returns Time signature as an object
   */
  public async getTimeSignature(): Promise<{ numerator: number; denominator: number }> {
    try {
      logger.debug('Getting time signature from REAPER');
      const beatPosResponse = await this.getBeatPosition();
      const parts = beatPosResponse.split('\t');

      // BEATPOS response format:
      // BEATPOS \t playstate \t position_seconds \t full_beat_position \t measure_cnt \t beats_in_measure \t ts_numerator \t ts_denominator
      if (parts.length >= 8 && parts[0] === 'BEATPOS') {
        const numerator = parseInt(parts[6], 10);
        const denominator = parseInt(parts[7], 10);

        logger.debug('Time signature', { numerator, denominator });

        return {
          numerator,
          denominator
        };
      } else {
        // Default to 4/4 if we can't parse the response
        logger.warn('Could not parse time signature from BEATPOS response, defaulting to 4/4');

        return {
          numerator: 4,
          denominator: 4
        };
      }
    } catch (error) {
      logger.error('Error getting time signature', { error });

      // Default to 4/4 in case of error
      return {
        numerator: 4,
        denominator: 4
      };
    }
  }

  /**
   * Calculate the duration of a specified number of bars in seconds
   * based on the current time signature and BPM
   * @param bars - Number of bars to calculate
   * @param defaultBpm - Default BPM to use if not available from REAPER
   * @returns Duration in seconds
   */
  public async calculateBarsToSeconds(bars: number, defaultBpm: number = 90): Promise<number> {
    try {
      logger.debug(`Calculating duration for ${bars} bars`);

      // Get the current time signature
      const timeSignature = await this.getTimeSignature();
      logger.debug(`Using time signature: ${timeSignature.numerator}/${timeSignature.denominator}`);

      // Get the current BPM from REAPER
      let bpm = await this.getBPM();

      // If BPM is 0 or invalid, use the default BPM
      if (!bpm || bpm <= 0) {
        logger.debug(`Invalid BPM (${bpm}), using default BPM: ${defaultBpm}`);
        bpm = defaultBpm;
      } else {
        logger.debug(`Using BPM: ${bpm}`);
      }

      // Calculate beats per bar based on time signature
      const beatsPerBar = timeSignature.numerator;

      // Calculate seconds per beat based on BPM
      // Formula: 60 seconds / BPM = duration of one beat in seconds
      const secondsPerBeat = 60 / bpm;

      // Calculate total seconds
      // Formula: bars * beats per bar * seconds per beat
      const totalSeconds = bars * beatsPerBar * secondsPerBeat;

      logger.debug(`Calculated ${bars} bars at ${timeSignature.numerator}/${timeSignature.denominator} and ${bpm} BPM: ${totalSeconds.toFixed(2)} seconds`);

      return totalSeconds;
    } catch (error) {
      logger.error('Error calculating bars to seconds', { error });

      // Default calculation assuming 4/4 time at default BPM
      // 4 beats per bar * (60 / BPM) seconds per beat * number of bars
      const defaultSeconds = 4 * (60 / defaultBpm) * bars;

      logger.debug(`Using default calculation for ${bars} bars: ${defaultSeconds.toFixed(2)} seconds`);

      return defaultSeconds;
    }
  }

  /**
   * Clean up resources and event listeners
   */
  public cleanup(): void {
    // Stop polling
    this.stopPolling();

    // Cancel reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Remove all event listeners to prevent memory leaks
    logger.debug('Removing all event listeners from ReaperConnector');
    this.removeAllListeners();

    logger.info('ReaperConnector cleanup complete');
  }
}
