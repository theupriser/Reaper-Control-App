/**
 * Region Service
 * Manages regions in REAPER
 */
import { EventEmitter } from 'events';
import { Region } from '../types';
import { ReaperConnector } from './reaperConnector';
import logger from '../utils/logger';

export class RegionService extends EventEmitter {
  private regions: Region[] = [];
  private reaperConnector: ReaperConnector;

  /**
   * Constructor
   * @param reaperConnector - REAPER connector instance
   */
  constructor(reaperConnector: ReaperConnector) {
    super();
    this.reaperConnector = reaperConnector;

    // Set up event listeners
    this.setupEventListeners();

    logger.info('Region service initialized');
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

      // Use REAPER connector to go to next region
      await this.reaperConnector.nextRegion();
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

      // Use REAPER connector to go to previous region
      await this.reaperConnector.previousRegion();
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
}
