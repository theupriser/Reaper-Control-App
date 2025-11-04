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
  private endOfRegionPollingInterval: NodeJS.Timeout | null = null;
  private isTransitioning: boolean = false;
  private lastTransitionTime: number = 0; // Track when the last transition occurred

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

    // Start polling for end of region detection
    this.startEndOfRegionPolling();

    logger.info('Region service initialized');
  }

  /**
   * Start polling for end of region detection at 15Hz (approximately 67ms interval)
   */
  private startEndOfRegionPolling(): void {
    if (this.endOfRegionPollingInterval) {
      clearInterval(this.endOfRegionPollingInterval);
    }

    this.endOfRegionPollingInterval = setInterval(async () => {
      try {
        const playbackState = this.reaperConnector.getLastPlaybackState();
        if (this.projectService && this.projectService.getSelectedSetlistId() && playbackState.isPlaying) {
          await this.checkEndOfRegion(playbackState);
        }
      } catch (error) {
        logger.error('Error in end of region polling:', error);
      }
    }, 67);

    logger.debug('Started polling for end of region detection');
  }

  /**
   * Stop polling for end of region detection
   */
  private stopEndOfRegionPolling(): void {
    if (this.endOfRegionPollingInterval) {
      clearInterval(this.endOfRegionPollingInterval);
      this.endOfRegionPollingInterval = null;
      logger.debug('Stopped polling for end of region detection');
    }
  }

  /**
   * Restart the polling mechanism
   */
  private restartPolling(): void {
    this.stopEndOfRegionPolling();
    this.isTransitioning = false;

    setTimeout(() => {
      this.startEndOfRegionPolling();
    }, 100);
  }

  /**
   * Check if we're at or approaching the end of the current region
   * @param playbackState - Current playback state
   */
  private async checkEndOfRegion(playbackState: any): Promise<void> {
    try {
      if (!playbackState.currentRegionId) {
        return;
      }

      const currentPosition = playbackState.position;
      const currentRegion = this.getRegionById(playbackState.currentRegionId);

      if (!currentRegion) {
        return;
      }

      if (this.isTransitioning) {
        return;
      }

      // Check if we're at the end of the region or very close to it
      // Only transition when we're extremely close to or just past the region end
      const timeToEnd = currentRegion.end - currentPosition;

      if (timeToEnd <= 0.15) {
        // Prevent multiple transitions in quick succession
        const now = Date.now();
        if (now - this.lastTransitionTime < 1000) {
          return;
        }
        this.lastTransitionTime = now;

        logger.debug('Approaching end of region, initiating transition');
        this.isTransitioning = true;

        try {
          if (this.projectService) {
            const nextSetlistItem = this.projectService.getNextSetlistItem(playbackState.currentRegionId);
            if (nextSetlistItem) {
              logger.debug(`Found next setlist item: ${nextSetlistItem.name || nextSetlistItem.regionId}`);
              const region = this.getRegionById(nextSetlistItem.regionId);
              if (region) {
                logger.debug(`Found next region: ${region.name}`);

                // Check if the region has a !bpm marker
                const markers = this.markerService.getMarkers();
                const bpm = getBpmForRegion(region, markers);

                // Reset BPM when automatically transitioning to the next song
                logger.debug('Resetting BPM calculation for next region');
                this.reaperConnector.resetBeatPositions(bpm);

                logger.debug('Seeking to next region and playing');
                await this.seekToRegionAndPlay(region, true, false, true); // Pass directTransition=true for smooth transition
              } else {
                logger.debug('Next region not found');
              }
            } else {
              logger.debug('No next setlist item found, pausing playback');
              // Pause Reaper at the end of the playlist
              await this.reaperConnector.pause();
            }
          }
        } finally {
          this.isTransitioning = false;
          logger.debug('Transition completed');
        }
      }
    } catch (error) {
      this.isTransitioning = false;
      logger.error('Error checking end of region', error);
    }
  }

  /**
   * Set the project service
   * @param projectService - Project service instance
   */
  public setProjectService(projectService: any): void {
    this.projectService = projectService;

    // Set up listener for setlist selection changes
    if (this.projectService) {
      this.projectService.on('selectedSetlist', () => {
        this.emit('regions', this.getRegions());
      });
    }
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

    // Listen for setlist selection changes
    if (this.projectService) {
      this.projectService.on('selectedSetlist', () => {
        logger.debug('Selected setlist changed, re-emitting regions with updated filtering');
        // Re-emit regions with the new filtering applied
        this.emit('regions', this.getRegions());
      });
    }
  }

  /**
   * Handle regions update
   * @param regions - Updated regions
   */
  private handleRegionsUpdate(regions: Region[]): void {
    logger.debug('Regions updated', { count: regions.length });

    // Update regions
    this.regions = regions;

    // Emit regions update event - use getRegions() to apply filtering if a setlist is selected
    this.emit('regions', this.getRegions());
  }

  /**
   * Get all regions
   * If a setlist is selected, returns only the regions that are part of that setlist
   * @returns Filtered regions or all regions if no setlist is selected, sorted by start time
   */
  public getRegions(): Region[] {
    // Log the current state for debugging
    logger.debug('getRegions called', {
      allRegionsCount: this.regions.length,
      availableRegionIds: this.regions.map(r => r.id)
    });

    // Check if we have a project service and a selected setlist
    if (this.projectService && this.projectService.getSelectedSetlistId()) {
      const selectedSetlistId = this.projectService.getSelectedSetlistId();
      const selectedSetlist = this.projectService.getSetlist(selectedSetlistId);

      logger.debug('Selected setlist info', {
        selectedSetlistId,
        hasSetlist: !!selectedSetlist,
        itemsCount: selectedSetlist?.items.length || 0
      });

      // If we have a valid setlist with items, filter the regions
      if (selectedSetlist && selectedSetlist.items.length > 0) {
        // Get all region IDs in the setlist
        const setlistRegionIds = selectedSetlist.items.map(item => item.regionId);

        logger.debug('Setlist region IDs', {
          setlistRegionIds,
          setlistItemsCount: setlistRegionIds.length
        });

        // First check for direct string matches
        const filteredRegions = this.regions.filter(region =>
          setlistRegionIds.includes(parseInt(region.id))
        ).sort((a, b) => {
            const setlistItemA = selectedSetlist.items.find((item: { regionId: string }) => item.regionId == a.id)
            const setlistItemB = selectedSetlist.items.find((item: { regionId: string }) => item.regionId == b.id)

            return setlistItemA.position - setlistItemB.position;
        });

        logger.debug('Filtering results', {
          filteredCount: filteredRegions.length,
          allRegionsCount: this.regions.length
        });

        // Sort regions by start time before returning
        return filteredRegions
      }
    }

    // If no setlist is selected or the setlist is empty, return all regions sorted by start time
    logger.debug('No setlist selected or empty setlist, returning all regions sorted by start time');
    return [...this.regions].sort((a, b) => a.start - b.start);
  }

  /**
   * Get region by ID
   * @param id - Region ID
   * @returns Region or undefined if not found
   */
  public getRegionById(id: string): Region | undefined {
    // Log information for debugging
    logger.debug('Getting region by ID', {
      id,
      allRegionsCount: this.regions.length,
      selectedSetlistId: this.projectService?.getSelectedSetlistId()
    });

    // First try an exact match by string comparison on all regions
    const region = this.regions.find(region => String(region.id) === String(id));

    // If exact match found, return it
    if (region) {
      return region;
    }

    // If no exact match found, check for region by numeric ID (in case of type mismatch)
    // This handles cases where one might be string and one numeric
    const numericRegion = this.regions.find(region =>
      !isNaN(Number(region.id)) && !isNaN(Number(id)) && Number(region.id) === Number(id)
    );

    if (numericRegion) {
      logger.debug('Found region by numeric ID match', { id, foundId: numericRegion.id });
      return numericRegion;
    }

    // If still no region found and we have a project service with a selected setlist
    if (this.projectService && this.projectService.getSelectedSetlistId()) {
      const selectedSetlistId = this.projectService.getSelectedSetlistId();
      const selectedSetlist = this.projectService.getSetlist(selectedSetlistId);

      if (selectedSetlist && selectedSetlist.items.length > 0) {
        // Find the setlist item with this region ID
        const setlistItem = selectedSetlist.items.find(item =>
          String(item.regionId) === String(id) ||
          (!isNaN(Number(item.regionId)) && !isNaN(Number(id)) && Number(item.regionId) === Number(id))
        );

        if (setlistItem) {
          logger.debug('Found region ID in setlist', { id, setlistItem });

          // Try to find a region that might match this setlist item
          // This handles potential mismatches in ID format (string vs numeric)
          for (const region of this.regions) {
            // Try various matching strategies
            if (String(region.id) === String(setlistItem.regionId) ||
                String(region.name).toLowerCase() === String(setlistItem.name).toLowerCase() ||
                (!isNaN(Number(region.id)) && !isNaN(Number(setlistItem.regionId)) &&
                 Number(region.id) === Number(setlistItem.regionId))) {

              logger.debug('Found matching region for setlist item', {
                setlistItemId: setlistItem.regionId,
                regionId: region.id,
                setlistItemName: setlistItem.name,
                regionName: region.name
              });

              return region;
            }
          }

          // If we got here, the region is in the setlist but couldn't be found in regions
          logger.warn('Region in setlist but not found in regions collection', {
            id,
            setlistItem,
            availableRegionIds: this.regions.map(r => r.id)
          });
        }
      }
    }

    // If we got here, we couldn't find the region
    logger.warn('Region not found', { id });
    return undefined;
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
    // Use String() to ensure type consistency when comparing IDs
    const currentIndex = this.regions.findIndex(region =>
      String(region.id) === String(currentRegionId) ||
      (!isNaN(Number(region.id)) && !isNaN(Number(currentRegionId)) &&
       Number(region.id) === Number(currentRegionId))
    );
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
    // Use String() to ensure type consistency when comparing IDs
    const currentIndex = this.regions.findIndex(region =>
      String(region.id) === String(currentRegionId) ||
      (!isNaN(Number(region.id)) && !isNaN(Number(currentRegionId)) &&
       Number(region.id) === Number(currentRegionId))
    );
    if (currentIndex <= 0) {
      return undefined;
    }
    return this.regions[currentIndex - 1];
  }

  /**
   * Check if navigation to next region is allowed
   * @returns Boolean indicating if next region navigation is allowed
   */
  public canGoToNextRegion(): boolean {
    // Get the current playback state to get the current region ID
    const playbackState = this.reaperConnector.getLastPlaybackState();
    const currentRegionId = playbackState.currentRegionId;
    const inSetlist = this.projectService && this.projectService.getSelectedSetlistId();

    // If in a setlist, check if there's a next item
    if (inSetlist) {
      const nextItem = this.projectService.getNextSetlistItem(currentRegionId);
      return !!nextItem;
    }

    // If not in a setlist but have a region, check if there's a next region
    if (currentRegionId) {
      const nextRegion = this.getNextRegion(currentRegionId);
      return !!nextRegion;
    }

    // If no current region but have regions, we can go to the first one
    return this.regions.length > 0;
  }

  /**
   * Check if navigation to previous region is allowed
   * @returns Boolean indicating if previous region navigation is allowed
   */
  public canGoToPreviousRegion(): boolean {
    // Get the current playback state to get the current region ID
    const playbackState = this.reaperConnector.getLastPlaybackState();
    const currentRegionId = playbackState.currentRegionId;
    const inSetlist = this.projectService && this.projectService.getSelectedSetlistId();

    // If in a setlist, check if there's a previous item
    if (inSetlist) {
      const prevItem = this.projectService.getPreviousSetlistItem(currentRegionId);
      return !!prevItem;
    }

    // If not in a setlist but have a region, check if there's a previous region
    if (currentRegionId) {
      const prevRegion = this.getPreviousRegion(currentRegionId);
      return !!prevRegion;
    }

    // If no current region but have regions, we can go to the last one
    return this.regions.length > 0;
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

      // Emit regions update event - use getRegions() to apply filtering if a setlist is selected
      this.emit('regions', this.getRegions());

      // Return the filtered regions if a setlist is selected, otherwise return all regions
      return this.getRegions();
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
   * @returns Promise that resolves with a boolean indicating success or failure
   */
  public async nextRegion(): Promise<boolean> {
    try {
      // Get the current playback state to get the current region ID
      const playbackState = this.reaperConnector.getLastPlaybackState();
      const currentRegionId = playbackState.currentRegionId;
      const inSetlist = this.projectService && this.projectService.getSelectedSetlistId();

      // Check if a setlist is selected and the project service is available
      if (inSetlist) {
        // Get the next item in the setlist
        const nextItem = this.projectService.getNextSetlistItem(currentRegionId);

        if (nextItem) {
          // Get the region
          const region = this.getRegionById(nextItem.regionId);
          if (region) {
            // Use seekToRegionAndPlay with autoplay=null (use current setting) and countIn=false
            await this.seekToRegionAndPlay(region, null, false);
            return true;
          }
        }
      }

      // If no current region ID, use the first region
      if (!currentRegionId) {
        if (this.regions.length > 0) {
          const firstRegion = this.regions[0];
          await this.seekToRegionAndPlay(firstRegion, null, false);
          return true;
        } else {
          return false;
        }
      }

      // Find the next region
      const nextRegion = this.getNextRegion(currentRegionId);
      if (nextRegion) {
        // Use seekToRegionAndPlay with autoplay=null (use current setting) and countIn=false
        await this.seekToRegionAndPlay(nextRegion, null, false);
        return true;
      } else if (inSetlist) {
        // If we're at the end of a setlist, don't attempt further navigation
        return false;
      } else {
        try {
          // Only fall back to the REAPER connector method if not in a setlist
          await this.reaperConnector.nextRegion();
          return true;
        } catch (error) {
          logger.error('No next region available', { error });
          return false;
        }
      }
    } catch (error) {
      logger.error('Failed to go to next region', { error });
      return false;
    }
  }

  /**
   * Go to previous region
   * @returns Promise that resolves with a boolean indicating success or failure
   */
  public async previousRegion(): Promise<boolean> {
    try {
      // Get the current playback state to get the current region ID
      const playbackState = this.reaperConnector.getLastPlaybackState();
      const currentRegionId = playbackState.currentRegionId;
      const inSetlist = this.projectService && this.projectService.getSelectedSetlistId();

      // Check if a setlist is selected and the project service is available
      if (inSetlist) {
        // Get the previous item in the setlist
        const prevItem = this.projectService.getPreviousSetlistItem(currentRegionId);

        if (prevItem) {
          // Get the region
          const region = this.getRegionById(prevItem.regionId);
          if (region) {
            // Use seekToRegionAndPlay with autoplay=null (use current setting) and countIn=false
            await this.seekToRegionAndPlay(region, null, false);
            return true;
          }
        }
      }

      // If no current region ID, use the last region
      if (!currentRegionId) {
        if (this.regions.length > 0) {
          const lastRegion = this.regions[this.regions.length - 1];
          await this.seekToRegionAndPlay(lastRegion, null, false);
          return true;
        } else {
          return false;
        }
      }

      // Find the previous region
      const prevRegion = this.getPreviousRegion(currentRegionId);
      if (prevRegion) {
        // Use seekToRegionAndPlay with autoplay=null (use current setting) and countIn=false
        await this.seekToRegionAndPlay(prevRegion, null, false);
        return true;
      } else if (inSetlist) {
        // If we're at the beginning of a setlist, don't attempt further navigation
        return false;
      } else {
        try {
          // Only fall back to the REAPER connector method if not in a setlist
          await this.reaperConnector.previousRegion();
          return true;
        } catch (error) {
          logger.error('No previous region available', { error });
          return false;
        }
      }
    } catch (error) {
      logger.error('Failed to go to previous region', { error });
      return false;
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
   * @param directTransition - Whether this is a direct transition between regions (used for smooth playback in playlist mode)
   * @returns Promise that resolves when the operation is complete
   */
  public async seekToRegionAndPlay(region: Region, autoplay: boolean | null = null, countIn: boolean | null = null, directTransition: boolean = false): Promise<boolean> {
    try {
      logger.debug(`Seeking to region: ${region.name} (${region.start.toFixed(2)}s - ${region.end.toFixed(2)}s)`);

      // Get current playback state and settings
      const playbackState = this.reaperConnector.getLastPlaybackState();
      const isPlaying = playbackState.isPlaying;
      const currentRegionId = playbackState.currentRegionId;

      // Check if this region is already the next region in Reaper
      // If it is, and this is a direct transition, we can skip seeking
      let skipSeeking = false;
      if (directTransition && currentRegionId) {
        // Get the next region in Reaper's sequence
        const nextReaperRegion = this.getNextRegion(currentRegionId);

        if (nextReaperRegion && String(nextReaperRegion.id) === String(region.id)) {
          logger.debug(`Target region is already the next region in Reaper sequence, skipping unnecessary seeking`);
          skipSeeking = true;
        }
      }

      // If autoplay is null, use the current playback state's autoplayEnabled setting
      const isAutoplayEnabled = autoplay !== null ? autoplay : playbackState.autoplayEnabled !== undefined ? playbackState.autoplayEnabled : true;

      // If countIn is null, use the current playback state's countInEnabled setting
      // However, only allow count-in when explicitly set to true (for markers)
      // This fixes the issue where count-in is triggered when selecting a song in the setlist
      const isCountInEnabled = countIn === true; // Only use count-in when explicitly set to true

      logger.debug(`Current state: playing=${isPlaying}, autoplay=${isAutoplayEnabled}, countIn=${isCountInEnabled}`);

      // Check if the region has a !bpm marker
      const markers = this.markerService.getMarkers();
      const bpm = getBpmForRegion(region, markers);

      // Reset BPM when changing to a new region/song, passing the BPM from marker if available
      logger.debug(`Resetting BPM calculation for region: ${region.name}`);
      this.reaperConnector.resetBeatPositions(bpm);

      // If currently playing and not skipping seeking, pause first
      if (isPlaying && !skipSeeking) {
        logger.debug('Currently playing, pausing first');
        await this.reaperConnector.togglePlay();
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // Only perform seeking if not skipping
      if (!skipSeeking) {
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
        // For automatic region changes (called from checkEndOfRegion), disable pause before seeking
        // Use either directTransition parameter or isTransitioning flag to determine if this is an automatic change
        logger.debug(`Is automatic region change: ${directTransition}`);
        await this.reaperConnector.seekToPosition(positionToSeek, false, directTransition);
      } else {
        logger.debug('Skipped seeking as the region is already the next region in Reaper');

        // Update the last playback state to reflect the new region using connector's API
        this.reaperConnector.setCurrentRegionId(String(region.id));
      }

      // Only resume playback if it was already playing AND autoplay is enabled AND we paused for seeking
      if (isPlaying && isAutoplayEnabled && !skipSeeking) {
        logger.debug('Was playing and autoplay enabled, resuming playback after short delay');
        await new Promise(resolve => setTimeout(resolve, 150));

        // If count-in is enabled, use playWithCountIn, otherwise use normal togglePlay
        if (isCountInEnabled) {
          logger.debug('Using count-in for playback');
          await this.reaperConnector.playWithCountIn();
        } else {
          logger.debug('Resuming playback without count-in');
          await this.reaperConnector.togglePlay();
        }
      } else if (skipSeeking) {
        logger.debug('Continued playback without interruption');
      } else {
        logger.debug('Not resuming playback: either was not playing or autoplay disabled');
      }

      // Restart the polling mechanism
      this.restartPolling();

      logger.debug('Successfully seeked to region and configured playback');
      return true;
    } catch (error) {
      logger.error('Error seeking to region and playing', { error });
      return false;
    }
  }
}
