/**
 * REAPER Connector
 * Handles communication with REAPER through its web interface
 */
import { EventEmitter } from 'events';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import config from '../utils/config';
import logger from '../utils/logger';
import { ConnectionStatus, Region, Marker, PlaybackState } from '../types';

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
    }
  };

  constructor() {
    super();

    // Get REAPER configuration
    const reaperConfig = config.getConfig().reaper;

    // Create axios instance for REAPER API requests
    this.axiosInstance = axios.create({
      baseURL: `${reaperConfig.protocol}://${reaperConfig.host}:${reaperConfig.port}`,
      timeout: reaperConfig.connectionTimeout,
    });

    logger.info('REAPER connector initialized', {
      host: reaperConfig.host,
      port: reaperConfig.port
    });
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

        // Update playback state
        this.lastPlaybackState = {
          isPlaying: transportState.isPlaying,
          position: transportState.position,
          currentRegionId: transportState.currentRegionId,
          bpm: transportState.bpm,
          timeSignature: transportState.timeSignature
        };

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
  private formatTransportResponse(response: string): any {
    logger.debug('Formatting transport response');

    try {
      // Split the response into lines
      const lines = response.split('\n');
      logger.debug('Transport response split into lines', { count: lines.length });

      // Initialize transport state with defaults
      const transportState = {
        isPlaying: false,
        position: 0,
        projectId: this.projectId || '',
        bpm: 120,
        timeSignature: {
          numerator: 4,
          denominator: 4
        }
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
            // Check play state (1 = playing, 0 = stopped)
            transportState.isPlaying = parts[1] === '1';
          }

          if (parts.length >= 3) {
            // Extract position
            transportState.position = parseFloat(parts[2]);
          }
        }
        // Check if this is a tempo line
        else if (parts[0] === 'TEMPO') {
          if (parts.length >= 2) {
            // Extract BPM
            transportState.bpm = parseFloat(parts[1]);
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
        }
      };
    }
  }

  /**
   * Get transport state from REAPER
   * @returns Transport state
   */
  private async getTransportState(): Promise<any> {
    try {
      // Make a request to the REAPER API to get transport state
      const response = await this.makeRequest<string>('GET', '_/TRANSPORT');

      // Format the response
      const transportState = this.formatTransportResponse(response);

      // Add project ID to transport state
      transportState.projectId = this.projectId || '';

      return transportState;
    } catch (error) {
      logger.error('Failed to get transport state', { error });

      // Return last known state in case of error
      return {
        isPlaying: this.lastPlaybackState.isPlaying,
        position: this.lastPlaybackState.position,
        projectId: this.projectId || '',
        bpm: this.lastPlaybackState.bpm,
        timeSignature: this.lastPlaybackState.timeSignature
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
          const region: Region = {
            id: parts[1],
            name: parts[2],
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
            id: parts[1],
            name: parts[2],
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
   * Toggle play/pause in REAPER
   */
  public async togglePlay(): Promise<void> {
    try {
      logger.debug('Toggling play/pause in REAPER');

      // Send the play/pause toggle command to REAPER (action ID 1007)
      await this.makeRequest<string>('GET', '_/1007');

      // Get updated transport state
      const transportState = await this.getTransportState();

      // Update last playback state
      this.lastPlaybackState = transportState;

      // Emit playback state update
      this.emit('playbackState', this.lastPlaybackState);

      logger.debug('Play/pause toggled', { isPlaying: this.lastPlaybackState.isPlaying });
    } catch (error) {
      logger.error('Failed to toggle play', { error });
      throw error;
    }
  }

  /**
   * Seek to position in REAPER
   * @param position - Position to seek to
   */
  public async seekToPosition(position: number): Promise<void> {
    try {
      logger.debug('Seeking to position in REAPER', { position });

      // Send the seek command to REAPER
      await this.makeRequest<string>('GET', `_/SET/POS/${position}`);

      // Get updated transport state
      const transportState = await this.getTransportState();

      // Update last playback state
      this.lastPlaybackState = transportState;

      // Emit playback state update
      this.emit('playbackState', this.lastPlaybackState);

      logger.debug('Seeked to position', { position: this.lastPlaybackState.position });
    } catch (error) {
      logger.error('Failed to seek to position', { error, position });
      throw error;
    }
  }

  /**
   * Seek to region in REAPER
   * @param regionId - Region ID to seek to
   */
  public async seekToRegion(regionId: string): Promise<void> {
    try {
      logger.debug('Seeking to region in REAPER', { regionId });

      // Get regions
      const regions = await this.getRegions();

      // Find region
      const region = regions.find(r => r.id === regionId);
      if (!region) {
        throw new Error(`Region not found: ${regionId}`);
      }

      logger.debug('Found region', { region });

      // Seek to region start
      await this.seekToPosition(region.start);

      // Update current region ID
      this.lastPlaybackState.currentRegionId = regionId;

      // Emit playback state update
      this.emit('playbackState', this.lastPlaybackState);

      logger.debug('Seeked to region', {
        regionId,
        regionName: region.name,
        position: region.start
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

      // Find current region index
      const currentIndex = regions.findIndex(r => r.id === this.lastPlaybackState.currentRegionId);
      if (currentIndex === -1 || currentIndex >= regions.length - 1) {
        logger.warn('No next region available', {
          currentRegionId: this.lastPlaybackState.currentRegionId,
          currentIndex,
          totalRegions: regions.length
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

      // Find current region index
      const currentIndex = regions.findIndex(r => r.id === this.lastPlaybackState.currentRegionId);
      if (currentIndex <= 0) {
        logger.warn('No previous region available', {
          currentRegionId: this.lastPlaybackState.currentRegionId,
          currentIndex,
          totalRegions: regions.length
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
      const currentRegion = regions.find(r => r.id === this.lastPlaybackState.currentRegionId);
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

      // Seek to region start
      await this.seekToPosition(currentRegion.start);

      logger.debug('Seeked to current region start', {
        regionId: currentRegion.id,
        regionName: currentRegion.name,
        position: currentRegion.start
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
      // In a real implementation, this would make a request to the REAPER API
      // For now, we'll use the mock project ID
      const projectId = this.projectId || 'mock-project-id';

      // Update project ID
      this.projectId = projectId;

      // Emit project ID update
      this.emit('projectId', projectId);

      return projectId;
    } catch (error) {
      logger.error('Failed to refresh project ID', { error });
      throw error;
    }
  }

  /**
   * Get project ID from REAPER
   * @returns Project ID
   */
  public async getProjectId(): Promise<string> {
    return this.projectId || await this.refreshProjectId();
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
   * Clean up resources
   */
  public cleanup(): void {
    // Stop polling
    this.stopPolling();

    // Cancel reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
