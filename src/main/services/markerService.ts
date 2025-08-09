/**
 * Marker Service
 * Manages markers in REAPER
 */
import { Marker } from '../types';
import { ReaperConnector } from './reaperConnector';
import logger from '../utils/logger';
import { BaseService } from './baseService';

export class MarkerService extends BaseService<Marker> {
  /**
   * Constructor
   * @param reaperConnector - REAPER connector instance
   */
  constructor(reaperConnector: ReaperConnector) {
    super(reaperConnector, 'markers');
  }

  /**
   * Set up event listeners
   */
  protected override setupEventListeners(): void {
    super.setupEventListeners();

    // Listen for markers updates from REAPER connector
    this.reaperConnector.on('markers', (markers: Marker[]) => {
      this.handleItemsUpdate(markers);
    });
  }

  /**
   * Get all markers
   * @returns All markers
   */
  public getMarkers(): Marker[] {
    return this.getItems();
  }

  /**
   * Get marker by ID
   * @param id - Marker ID
   * @returns Marker or undefined if not found
   */
  public getMarkerById(id: string): Marker | undefined {
    return this.items.find(marker => marker.id === id);
  }

  /**
   * Implementation of abstract method from BaseService
   * @param id - Item ID
   * @returns Item or undefined if not found
   */
  public getItemById(id: string | number): Marker | undefined {
    return this.getMarkerById(String(id));
  }


  /**
   * Get next marker
   * @param position - Current position in seconds
   * @returns Next marker or undefined if not found
   */
  public getNextMarker(position: number): Marker | undefined {
    const nextMarkers = this.items
      .filter(marker => marker.position > position)
      .sort((a, b) => a.position - b.position);

    return nextMarkers.length > 0 ? nextMarkers[0] : undefined;
  }

  /**
   * Get previous marker
   * @param position - Current position in seconds
   * @returns Previous marker or undefined if not found
   */
  public getPreviousMarker(position: number): Marker | undefined {
    const prevMarkers = this.items
      .filter(marker => marker.position < position)
      .sort((a, b) => b.position - a.position);

    return prevMarkers.length > 0 ? prevMarkers[0] : undefined;
  }

  /**
   * Implementation of abstract method from BaseService
   * Get next item based on current item ID
   * Note: For markers, this is position-based rather than ID-based
   * @param currentId - Current marker ID or position
   * @returns Next marker or undefined if not found
   */
  public getNextItem(currentId: string | number): Marker | undefined {
    // If currentId is a position number, use it directly
    if (typeof currentId === 'number') {
      return this.getNextMarker(currentId);
    }

    // If currentId is a string ID, find the marker first
    const marker = this.getItemById(currentId);
    if (marker) {
      return this.getNextMarker(marker.position);
    }

    return undefined;
  }

  /**
   * Implementation of abstract method from BaseService
   * Get previous item based on current item ID
   * Note: For markers, this is position-based rather than ID-based
   * @param currentId - Current marker ID or position
   * @returns Previous marker or undefined if not found
   */
  public getPreviousItem(currentId: string | number): Marker | undefined {
    // If currentId is a position number, use it directly
    if (typeof currentId === 'number') {
      return this.getPreviousMarker(currentId);
    }

    // If currentId is a string ID, find the marker first
    const marker = this.getItemById(currentId);
    if (marker) {
      return this.getPreviousMarker(marker.position);
    }

    return undefined;
  }

  /**
   * Refresh markers from REAPER
   * @returns Promise that resolves with the markers
   */
  public async refreshMarkers(): Promise<Marker[]> {
    return this.refreshItems();
  }

  /**
   * Implementation of abstract method from BaseService
   * Refresh items from REAPER
   * @returns Promise that resolves with the items
   */
  public async refreshItems(): Promise<Marker[]> {
    return this.withErrorHandling(async () => {
      logger.debug('Refreshing markers');

      // Get markers from REAPER connector
      const markers = await this.reaperConnector.refreshMarkers();

      // Update markers through the base class method
      this.handleItemsUpdate(markers);

      return this.items;
    }, 'refresh markers');
  }

  /**
   * Seek to marker
   * @param markerId - Marker ID
   * @returns Promise that resolves when the operation is complete
   */
  public async seekToMarker(markerId: string): Promise<void> {
    return this.withErrorHandling(async () => {
      logger.debug('Seeking to marker', { markerId });

      // Get marker
      const marker = this.getMarkerById(markerId);
      if (!marker) {
        throw new Error(`Marker not found: ${markerId}`);
      }

      // Seek to marker position using REAPER connector
      await this.reaperConnector.seekToPosition(marker.position);
    }, 'seek to marker', { markerId });
  }

  /**
   * Go to next marker
   * @param currentPosition - Current position in seconds
   * @returns Promise that resolves when the operation is complete
   */
  public async nextMarker(currentPosition: number): Promise<void> {
    return this.withErrorHandling(async () => {
      logger.debug('Going to next marker', { currentPosition });

      // Get next marker
      const nextMarker = this.getNextMarker(currentPosition);
      if (!nextMarker) {
        throw new Error('No next marker');
      }

      // Seek to marker position using REAPER connector
      await this.reaperConnector.seekToPosition(nextMarker.position);
    }, 'go to next marker', { currentPosition });
  }

  /**
   * Go to previous marker
   * @param currentPosition - Current position in seconds
   * @returns Promise that resolves when the operation is complete
   */
  public async previousMarker(currentPosition: number): Promise<void> {
    return this.withErrorHandling(async () => {
      logger.debug('Going to previous marker', { currentPosition });

      // Get previous marker
      const prevMarker = this.getPreviousMarker(currentPosition);
      if (!prevMarker) {
        throw new Error('No previous marker');
      }

      // Seek to marker position using REAPER connector
      await this.reaperConnector.seekToPosition(prevMarker.position);
    }, 'go to previous marker', { currentPosition });
  }
}
