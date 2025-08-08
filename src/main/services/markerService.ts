/**
 * Marker Service
 * Manages markers in REAPER
 */
import { EventEmitter } from 'events';
import { Marker } from '../types';
import { ReaperConnector } from './reaperConnector';
import logger from '../utils/logger';

export class MarkerService extends EventEmitter {
  private markers: Marker[] = [];
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

    logger.info('Marker service initialized');
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen for markers updates from REAPER connector
    this.reaperConnector.on('markers', (markers: Marker[]) => {
      this.handleMarkersUpdate(markers);
    });

    // Listen for project changes
    this.reaperConnector.on('projectChanged', () => {
      this.refreshMarkers();
    });
  }

  /**
   * Handle markers update
   * @param markers - Updated markers
   */
  private handleMarkersUpdate(markers: Marker[]): void {
    logger.debug('Markers updated', { count: markers.length });

    // Update markers
    this.markers = markers;

    // Emit markers update event
    this.emit('markers', this.markers);
  }

  /**
   * Get all markers
   * @returns All markers
   */
  public getMarkers(): Marker[] {
    return this.markers;
  }

  /**
   * Get marker by ID
   * @param id - Marker ID
   * @returns Marker or undefined if not found
   */
  public getMarkerById(id: string): Marker | undefined {
    return this.markers.find(marker => marker.id === id);
  }

  /**
   * Get marker at position
   * @param position - Position in seconds
   * @param tolerance - Tolerance in seconds (default: 0.1)
   * @returns Marker or undefined if not found
   */
  public getMarkerAtPosition(position: number, tolerance: number = 0.1): Marker | undefined {
    return this.markers.find(marker =>
      Math.abs(marker.position - position) <= tolerance
    );
  }

  /**
   * Get markers in range
   * @param start - Start position in seconds
   * @param end - End position in seconds
   * @returns Markers in range
   */
  public getMarkersInRange(start: number, end: number): Marker[] {
    return this.markers.filter(marker =>
      marker.position >= start && marker.position <= end
    );
  }

  /**
   * Get next marker
   * @param position - Current position in seconds
   * @returns Next marker or undefined if not found
   */
  public getNextMarker(position: number): Marker | undefined {
    const nextMarkers = this.markers
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
    const prevMarkers = this.markers
      .filter(marker => marker.position < position)
      .sort((a, b) => b.position - a.position);

    return prevMarkers.length > 0 ? prevMarkers[0] : undefined;
  }

  /**
   * Refresh markers from REAPER
   * @returns Promise that resolves with the markers
   */
  public async refreshMarkers(): Promise<Marker[]> {
    try {
      logger.debug('Refreshing markers');

      // Get markers from REAPER connector
      const markers = await this.reaperConnector.refreshMarkers();

      // Update markers
      this.markers = markers;

      // Emit markers update event
      this.emit('markers', this.markers);

      return this.markers;
    } catch (error) {
      logger.error('Failed to refresh markers', { error });
      throw error;
    }
  }

  /**
   * Seek to marker
   * @param markerId - Marker ID
   * @returns Promise that resolves when the operation is complete
   */
  public async seekToMarker(markerId: string): Promise<void> {
    try {
      logger.debug('Seeking to marker', { markerId });

      // Get marker
      const marker = this.getMarkerById(markerId);
      if (!marker) {
        throw new Error(`Marker not found: ${markerId}`);
      }

      // Seek to marker position using REAPER connector
      await this.reaperConnector.seekToPosition(marker.position);
    } catch (error) {
      logger.error('Failed to seek to marker', { error, markerId });
      throw error;
    }
  }

  /**
   * Go to next marker
   * @param currentPosition - Current position in seconds
   * @returns Promise that resolves when the operation is complete
   */
  public async nextMarker(currentPosition: number): Promise<void> {
    try {
      logger.debug('Going to next marker', { currentPosition });

      // Get next marker
      const nextMarker = this.getNextMarker(currentPosition);
      if (!nextMarker) {
        throw new Error('No next marker');
      }

      // Seek to marker position using REAPER connector
      await this.reaperConnector.seekToPosition(nextMarker.position);
    } catch (error) {
      logger.error('Failed to go to next marker', { error, currentPosition });
      throw error;
    }
  }

  /**
   * Go to previous marker
   * @param currentPosition - Current position in seconds
   * @returns Promise that resolves when the operation is complete
   */
  public async previousMarker(currentPosition: number): Promise<void> {
    try {
      logger.debug('Going to previous marker', { currentPosition });

      // Get previous marker
      const prevMarker = this.getPreviousMarker(currentPosition);
      if (!prevMarker) {
        throw new Error('No previous marker');
      }

      // Seek to marker position using REAPER connector
      await this.reaperConnector.seekToPosition(prevMarker.position);
    } catch (error) {
      logger.error('Failed to go to previous marker', { error, currentPosition });
      throw error;
    }
  }
}
