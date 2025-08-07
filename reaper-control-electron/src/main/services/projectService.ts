/**
 * Project Service
 * Manages project information in REAPER
 */
import { EventEmitter } from 'events';
import { Setlist, SetlistItem } from '../types';
import { ReaperConnector } from './reaperConnector';
import logger from '../utils/logger';

export class ProjectService extends EventEmitter {
  private projectId: string = '';
  private setlists: Map<string, Setlist> = new Map();
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

    // Initialize mock setlists
    this.initializeMockSetlists();

    logger.info('Project service initialized');
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen for project ID updates from REAPER connector
    this.reaperConnector.on('projectId', (projectId: string) => {
      this.handleProjectIdUpdate(projectId);
    });

    // Listen for project changes
    this.reaperConnector.on('projectChanged', (projectId: string) => {
      this.handleProjectChanged(projectId);
    });
  }

  /**
   * Initialize mock setlists
   */
  private initializeMockSetlists(): void {
    // Create a sample setlist
    const sampleSetlist: Setlist = {
      id: 'setlist-1',
      name: 'Sample Setlist',
      projectId: 'mock-project-id',
      items: [
        { id: 'item-1', regionId: '1', name: 'Intro', position: 0 },
        { id: 'item-2', regionId: '2', name: 'Verse 1', position: 1 },
        { id: 'item-3', regionId: '3', name: 'Chorus', position: 2 }
      ]
    };

    // Add to setlists map
    this.setlists.set(sampleSetlist.id, sampleSetlist);

    logger.debug('Initialized mock setlists', { count: this.setlists.size });
  }

  /**
   * Handle project ID update
   * @param projectId - Project ID
   */
  private handleProjectIdUpdate(projectId: string): void {
    logger.debug('Project ID updated', { projectId });

    // Update project ID
    this.projectId = projectId;

    // Emit project ID update event
    this.emit('projectId', this.projectId);
  }

  /**
   * Handle project changed
   * @param projectId - Project ID
   */
  private handleProjectChanged(projectId: string): void {
    logger.info('Project changed', { projectId });

    // Update project ID
    this.projectId = projectId;

    // Emit project changed event
    this.emit('projectChanged', this.projectId);

    // Emit project ID update event
    this.emit('projectId', this.projectId);
  }

  /**
   * Get project ID
   * @returns Project ID
   */
  public getProjectId(): string {
    return this.projectId;
  }

  /**
   * Refresh project ID from REAPER
   * @returns Promise that resolves with the project ID
   */
  public async refreshProjectId(): Promise<string> {
    try {
      logger.debug('Refreshing project ID');

      // Get project ID from REAPER connector
      const projectId = await this.reaperConnector.refreshProjectId();

      // Update project ID
      this.projectId = projectId;

      // Emit project ID update event
      this.emit('projectId', this.projectId);

      return this.projectId;
    } catch (error) {
      logger.error('Failed to refresh project ID', { error });
      throw error;
    }
  }

  /**
   * Get all setlists for the current project
   * @returns Setlists for the current project
   */
  public getSetlists(): Setlist[] {
    // Filter setlists by current project ID
    const projectSetlists = Array.from(this.setlists.values())
      .filter(setlist => setlist.projectId === this.projectId);

    // Emit setlists update event
    this.emit('setlists', projectSetlists);

    return projectSetlists;
  }

  /**
   * Get setlist by ID
   * @param setlistId - Setlist ID
   * @returns Setlist or null if not found
   */
  public getSetlist(setlistId: string): Setlist | null {
    const setlist = this.setlists.get(setlistId);

    if (!setlist) {
      logger.warn('Setlist not found', { setlistId });
      return null;
    }

    return setlist;
  }

  /**
   * Create a new setlist
   * @param name - Setlist name
   * @returns Created setlist
   */
  public createSetlist(name: string): Setlist {
    // Generate a unique ID
    const id = `setlist-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Create the setlist
    const setlist: Setlist = {
      id,
      name,
      projectId: this.projectId,
      items: []
    };

    // Add to setlists map
    this.setlists.set(id, setlist);

    logger.info('Created setlist', { id, name });

    // Emit setlist update event
    this.emit('setlistCreated', setlist);

    // Emit setlists update event
    this.emit('setlists', this.getSetlists());

    return setlist;
  }

  /**
   * Update a setlist
   * @param setlistId - Setlist ID
   * @param name - New name
   * @returns Updated setlist or null if not found
   */
  public updateSetlist(setlistId: string, name: string): Setlist | null {
    const setlist = this.setlists.get(setlistId);

    if (!setlist) {
      logger.warn('Setlist not found', { setlistId });
      return null;
    }

    // Update the setlist
    setlist.name = name;

    // Update in setlists map
    this.setlists.set(setlistId, setlist);

    logger.info('Updated setlist', { setlistId, name });

    // Emit setlist update event
    this.emit('setlistUpdated', setlist);

    // Emit setlists update event
    this.emit('setlists', this.getSetlists());

    return setlist;
  }

  /**
   * Delete a setlist
   * @param setlistId - Setlist ID
   * @returns True if deleted, false if not found
   */
  public deleteSetlist(setlistId: string): boolean {
    const setlist = this.setlists.get(setlistId);

    if (!setlist) {
      logger.warn('Setlist not found', { setlistId });
      return false;
    }

    // Delete from setlists map
    this.setlists.delete(setlistId);

    logger.info('Deleted setlist', { setlistId, name: setlist.name });

    // Emit setlist deleted event
    this.emit('setlistDeleted', setlistId);

    // Emit setlists update event
    this.emit('setlists', this.getSetlists());

    return true;
  }

  /**
   * Add an item to a setlist
   * @param setlistId - Setlist ID
   * @param regionId - Region ID
   * @param regionName - Region name
   * @param position - Position in the setlist (optional)
   * @returns Added item or null if setlist not found
   */
  public addSetlistItem(setlistId: string, regionId: string, regionName: string, position?: number): SetlistItem | null {
    const setlist = this.setlists.get(setlistId);

    if (!setlist) {
      logger.warn('Setlist not found', { setlistId });
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
      name: regionName,
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

    // Update in setlists map
    this.setlists.set(setlistId, setlist);

    logger.info('Added item to setlist', { setlistId, regionId, position: itemPosition });

    // Emit setlist update event
    this.emit('setlistUpdated', setlist);

    return item;
  }

  /**
   * Remove an item from a setlist
   * @param setlistId - Setlist ID
   * @param itemId - Item ID
   * @returns True if removed, false if not found
   */
  public removeSetlistItem(setlistId: string, itemId: string): boolean {
    const setlist = this.setlists.get(setlistId);

    if (!setlist) {
      logger.warn('Setlist not found', { setlistId });
      return false;
    }

    // Find the item
    const itemIndex = setlist.items.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
      logger.warn('Item not found in setlist', { setlistId, itemId });
      return false;
    }

    // Get the item name for logging
    const itemName = setlist.items[itemIndex].name;

    // Remove from setlist
    setlist.items.splice(itemIndex, 1);

    // Update positions of subsequent items
    for (let i = itemIndex; i < setlist.items.length; i++) {
      setlist.items[i].position = i;
    }

    // Update in setlists map
    this.setlists.set(setlistId, setlist);

    logger.info('Removed item from setlist', { setlistId, itemId, name: itemName });

    // Emit setlist update event
    this.emit('setlistUpdated', setlist);

    return true;
  }

  /**
   * Move an item within a setlist
   * @param setlistId - Setlist ID
   * @param itemId - Item ID
   * @param newPosition - New position
   * @returns Updated setlist or null if not found
   */
  public moveSetlistItem(setlistId: string, itemId: string, newPosition: number): Setlist | null {
    const setlist = this.setlists.get(setlistId);

    if (!setlist) {
      logger.warn('Setlist not found', { setlistId });
      return null;
    }

    // Find the item
    const itemIndex = setlist.items.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
      logger.warn('Item not found in setlist', { setlistId, itemId });
      return null;
    }

    // Validate new position
    if (newPosition < 0 || newPosition >= setlist.items.length) {
      logger.warn('Invalid position', { setlistId, itemId, newPosition });
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

    // Update in setlists map
    this.setlists.set(setlistId, setlist);

    logger.info('Moved item in setlist', { setlistId, itemId, newPosition });

    // Emit setlist update event
    this.emit('setlistUpdated', setlist);

    return setlist;
  }

  /**
   * Set selected setlist
   * @param setlistId - Setlist ID or null to clear selection
   */
  public setSelectedSetlist(setlistId: string | null): void {
    logger.info('Selected setlist', { setlistId });

    // Emit selected setlist event
    this.emit('selectedSetlist', setlistId);
  }
}
