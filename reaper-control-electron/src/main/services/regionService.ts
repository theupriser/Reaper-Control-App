/**
 * Region Service
 * Manages regions in REAPER
 */
import { EventEmitter } from 'events';
import { Region } from '../types';
import { ReaperConnector } from './reaperConnector';
import { MarkerService } from './markerService';
import { getBpmForRegion } from '../utils/bpmUtils';
import logger from '../utils/logger';

export class RegionService extends EventEmitter {
  private regions: Region[] = [];
  private reaperConnector: ReaperConnector;
  private markerService: MarkerService;
  private projectService: any; // Will be set after initialization

  /**
   * Constructor
   * @param reaperConnector - REAPER connector instance
   * @param markerService - Marker service instance
   */
  constructor(reaperConnector: ReaperConnector, markerService: MarkerService) {
    super();
    this.reaperConnector = reaperConnector;
    this.markerService = markerService;

    // Set up event listeners
    this.setupEventListeners();

    logger.info('Region service initialized');
  }

  /**
   * Set the project service
   * @param projectService - Project service instance
   */
  public setProjectService(projectService: any): void {
    this.projectService = projectService;
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen for regions updates from REAPER connector
    this.reaperConnector.on('regions', (regions: Region[]) => {
      this.handleRegionsUpdate(regions);
    });

    // Listen for project changes
    this.reaperConnector.on('projectChanged', () => {
      this.refreshRegions();
    });
  }

  /**
   * Handle regions update
   * @param regions - Updated regions
   */
  private handleRegionsUpdate(regions: Region[]): void {
    logger.debug('Regions updated', { count: regions.length });

    // Update regions
    this.regions = regions;

    // Emit regions update event
    this.emit('regions', this.regions);
  }

  /**
   * Get all regions
   * @returns All regions
   */
  public getRegions(): Region[] {
    return this.regions;
  }

  /**
   * Get region by ID
   * @param id - Region ID
   * @returns Region or undefined if not found
   */
  public getRegionById(id: string): Region | undefined {
    return this.regions.find(region => region.id === id);
  }

  /**
   * Get region at position
   * @param position - Position in seconds
   * @returns Region or undefined if not found
   */
  public getRegionAtPosition(position: number): Region | undefined {
    return this.regions.find(region => position >= region.start && position <= region.end);
  }

  /**
   * Get next region
   * @param currentRegionId - Current region ID
   * @returns Next region or undefined if not found
   */
  public getNextRegion(currentRegionId: string): Region | undefined {
    const currentIndex = this.regions.findIndex(region => region.id === currentRegionId);
    if (currentIndex === -1 || currentIndex >= this.regions.length - 1) {
      return undefined;
    }
    return this.regions[currentIndex + 1];
  }

  /**
   * Get previous region
   * @param currentRegionId - Current region ID
   * @returns Previous region or undefined if not found
   */
  public getPreviousRegion(currentRegionId: string): Region | undefined {
    const currentIndex = this.regions.findIndex(region => region.id === currentRegionId);
    if (currentIndex <= 0) {
      return undefined;
    }
    return this.regions[currentIndex - 1];
  }

  /**
   * Refresh regions from REAPER
   * @returns Promise that resolves with the regions
   */
  public async refreshRegions(): Promise<Region[]> {
    try {
      logger.debug('Refreshing regions');

      // Get regions from REAPER connector
      const regions = await this.reaperConnector.refreshRegions();

      // Update regions
      this.regions = regions;

      // Emit regions update event
      this.emit('regions', this.regions);

      return this.regions;
    } catch (error) {
      logger.error('Failed to refresh regions', { error });
      throw error;
    }
  }

  /**
   * Seek to region
   * @param regionId - Region ID
   * @returns Promise that resolves when the operation is complete
   */
  public async seekToRegion(regionId: string): Promise<void> {
    try {
      logger.debug('Seeking to region', { regionId });

      // Get region
      const region = this.getRegionById(regionId);
      if (!region) {
        throw new Error(`Region not found: ${regionId}`);
      }

      // Seek to region using REAPER connector
      await this.reaperConnector.seekToRegion(regionId);
    } catch (error) {
      logger.error('Failed to seek to region', { error, regionId });
      throw error;
    }
  }

  /**
   * Go to next region
   * @returns Promise that resolves when the operation is complete
   */
  public async nextRegion(): Promise<void> {
    try {
      logger.debug('Going to next region');

      // Get the current playback state to get the current region ID
      const playbackState = this.reaperConnector.getLastPlaybackState();
      const currentRegionId = playbackState.currentRegionId;

      // Check if a setlist is selected and the project service is available
      if (this.projectService && this.projectService.getSelectedSetlistId()) {
        logger.debug('Setlist is selected, checking for next item in setlist');

        // Get the next item in the setlist
        const nextItem = this.projectService.getNextSetlistItem(currentRegionId);

        if (nextItem) {
          logger.debug('Found next item in setlist, seeking to region', {
            regionId: nextItem.regionId,
            name: nextItem.name
          });

          // Get the region
          const region = this.getRegionById(nextItem.regionId);
          if (region) {
            // Use seekToRegionAndPlay with autoplay=null (use current setting) and countIn=false
            await this.seekToRegionAndPlay(region, null, false);
          }
          return;
        }

        logger.debug('No next item in setlist, falling back to standard next region');
      }

      // If no current region ID, use the first region
      if (!currentRegionId) {
        logger.debug('No current region ID, using first region');
        if (this.regions.length > 0) {
          const firstRegion = this.regions[0];
          await this.seekToRegionAndPlay(firstRegion, null, false);
          return;
        } else {
          logger.debug('No regions available');
          return;
        }
      }

      // Find the next region
      const nextRegion = this.getNextRegion(currentRegionId);
      if (nextRegion) {
        // Use seekToRegionAndPlay with autoplay=null (use current setting) and countIn=false
        await this.seekToRegionAndPlay(nextRegion, null, false);
      } else {
        // If no next region found, fall back to the REAPER connector method
        await this.reaperConnector.nextRegion();
      }
    } catch (error) {
      logger.error('Failed to go to next region', { error });
      throw error;
    }
  }

  /**
   * Go to previous region
   * @returns Promise that resolves when the operation is complete
   */
  public async previousRegion(): Promise<void> {
    try {
      logger.debug('Going to previous region');

      // Get the current playback state to get the current region ID
      const playbackState = this.reaperConnector.getLastPlaybackState();
      const currentRegionId = playbackState.currentRegionId;

      // Check if a setlist is selected and the project service is available
      if (this.projectService && this.projectService.getSelectedSetlistId()) {
        logger.debug('Setlist is selected, checking for previous item in setlist');

        // Get the previous item in the setlist
        const prevItem = this.projectService.getPreviousSetlistItem(currentRegionId);

        if (prevItem) {
          logger.debug('Found previous item in setlist, seeking to region', {
            regionId: prevItem.regionId,
            name: prevItem.name
          });

          // Get the region
          const region = this.getRegionById(prevItem.regionId);
          if (region) {
            // Use seekToRegionAndPlay with autoplay=null (use current setting) and countIn=false
            await this.seekToRegionAndPlay(region, null, false);
          }
          return;
        }

        logger.debug('No previous item in setlist, falling back to standard previous region');
      }

      // If no current region ID, use the last region
      if (!currentRegionId) {
        logger.debug('No current region ID, using last region');
        if (this.regions.length > 0) {
          const lastRegion = this.regions[this.regions.length - 1];
          await this.seekToRegionAndPlay(lastRegion, null, false);
          return;
        } else {
          logger.debug('No regions available');
          return;
        }
      }

      // Find the previous region
      const prevRegion = this.getPreviousRegion(currentRegionId);
      if (prevRegion) {
        // Use seekToRegionAndPlay with autoplay=null (use current setting) and countIn=false
        await this.seekToRegionAndPlay(prevRegion, null, false);
      } else {
        // If no previous region found, fall back to the REAPER connector method
        await this.reaperConnector.previousRegion();
      }
    } catch (error) {
      logger.error('Failed to go to previous region', { error });
      throw error;
    }
  }

  /**
   * Seek to current region start
   * @returns Promise that resolves when the operation is complete
   */
  public async seekToCurrentRegionStart(): Promise<void> {
    try {
      logger.debug('Seeking to current region start');

      // Use REAPER connector to seek to current region start
      await this.reaperConnector.seekToCurrentRegionStart();
    } catch (error) {
      logger.error('Failed to seek to current region start', { error });
      throw error;
    }
  }

  /**
   * Seek to a region and optionally start playback
   * @param region - Region to seek to
   * @param autoplay - Whether to start playback after seeking (defaults to current autoplay setting)
   * @param countIn - Whether to use count-in before playback (defaults to current countIn setting)
   * @returns Promise that resolves when the operation is complete
   */
  public async seekToRegionAndPlay(region: Region, autoplay: boolean | null = null, countIn: boolean | null = null): Promise<boolean> {
    try {
      logger.debug(`Seeking to region: ${region.name} (${region.start.toFixed(2)}s - ${region.end.toFixed(2)}s)`);

      // Get current playback state and settings
      const playbackState = this.reaperConnector.getLastPlaybackState();
      const isPlaying = playbackState.isPlaying;

      // If autoplay is null, use the current playback state
      // In a real implementation, this would use a stored autoplay setting
      const isAutoplayEnabled = autoplay !== null ? autoplay : true;

      // If countIn is null, use the current countIn setting
      // In a real implementation, this would use a stored countIn setting
      const isCountInEnabled = countIn !== null ? countIn : false;

      logger.debug(`Current state: playing=${isPlaying}, autoplay=${isAutoplayEnabled}, countIn=${isCountInEnabled}`);

      // Check if the region has a !bpm marker
      const markers = this.markerService.getMarkers();
      const bpm = getBpmForRegion(region, markers);

      // Reset BPM when changing to a new region/song, passing the BPM from marker if available
      logger.debug(`Resetting BPM calculation for region: ${region.name}`);
      this.reaperConnector.resetBeatPositions(bpm);

      // If currently playing, pause first
      if (isPlaying) {
        logger.debug('Currently playing, pausing first');
        await this.reaperConnector.togglePlay();
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      let positionToSeek: number;

      // If count-in is enabled, position the cursor 2 bars before the marker
      if (isCountInEnabled) {
        try {
          logger.debug('Count-in enabled, calculating position 2 bars before region start');

          // Get the duration of 2 bars in seconds based on the current time signature
          const countInDuration = await this.reaperConnector.calculateBarsToSeconds(2);

          // Calculate position 2 bars before region start
          // Ensure we don't go before the start of the project (negative time)
          positionToSeek = Math.max(0, region.start - countInDuration);
          logger.debug(`Positioning cursor 2 bars (${countInDuration.toFixed(2)}s) before region at ${positionToSeek.toFixed(2)}s`);
        } catch (error) {
          // Fallback to default calculation if there's an error
          logger.error('Error calculating count-in position, using default', { error });
          positionToSeek = Math.max(0, region.start - 4); // Default to 4 seconds (2 bars at 4/4 and 120 BPM)
          logger.debug(`Using fallback: positioning cursor 2 bars (4s) before region at ${positionToSeek.toFixed(2)}s`);
        }
      } else {
        // Add a small offset to ensure position is clearly within the region
        positionToSeek = region.start + 0.001;
        logger.debug(`Count-in disabled, positioning cursor at region start: ${positionToSeek.toFixed(3)}s`);
      }

      // Send the seek command
      logger.debug(`Seeking to position: ${positionToSeek.toFixed(3)}s`);
      await this.reaperConnector.seekToPosition(positionToSeek);

      // If was playing and autoplay is enabled, resume playback
      if ((isPlaying || autoplay === true) && isAutoplayEnabled) {
        logger.debug('Autoplay enabled, resuming playback after short delay');
        await new Promise(resolve => setTimeout(resolve, 150));

        // If count-in is enabled, use playWithCountIn, otherwise use normal togglePlay
        if (isCountInEnabled) {
          logger.debug('Using count-in for playback');
          await this.reaperConnector.playWithCountIn();
        } else {
          logger.debug('Resuming playback without count-in');
          await this.reaperConnector.togglePlay();
        }
      } else {
        logger.debug('Autoplay disabled, not resuming playback');
      }

      logger.debug('Successfully seeked to region and configured playback');
      return true;
    } catch (error) {
      logger.error('Error seeking to region and playing', { error });
      return false;
    }
  }
}
