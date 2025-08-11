/**
 * Project Service
 * Manages project information in REAPER
 */
import { EventEmitter } from 'events';
import { Setlist, SetlistItem } from '../types';
import { ReaperConnector } from './reaperConnector';
import { SetlistStorage } from './setlistStorage';
import logger from '../utils/logger';

export class ProjectService extends EventEmitter {
  private projectId: string = '';
  private setlists: Map<string, Setlist> = new Map();
  private selectedSetlistId: string | null = null;
  private reaperConnector: ReaperConnector;
  private setlistStorage: SetlistStorage;
  private hasCleanedUp: boolean = false;

  /**
   * Constructor
   * @param reaperConnector - REAPER connector instance
   */
  constructor(reaperConnector: ReaperConnector) {
    super();
    this.reaperConnector = reaperConnector;
    this.setlistStorage = new SetlistStorage();

    // Set up event listeners
    this.setupEventListeners();

    // Initialize setlists from file storage if available
    this.initializeSetlists().catch(error => {
      logger.error('Failed to initialize setlists', { error });
    });

    logger.info('Project service initialized');
  }

  /**
   * Initialize setlists - separate method to better handle async initialization
   */
  private async initializeSetlists(): Promise<void> {
    try {
      // Get project ID
      await this.refreshProjectId();

      if (this.projectId) {
        logger.debug('Initializing setlists for project', { projectId: this.projectId });

        // Load setlists from disk
        await this.loadSetlistsFromDisk();

        // Note: loadSetlistsFromDisk already updates the reaperConnector with selectedSetlistId
        // (including setting to null if needed), so no need to do it again here
      } else {
        // Initialize empty setlists map
        this.setlists = new Map();
        this.selectedSetlistId = null;

        // Make sure reaperConnector has null selected setlist ID
        this.reaperConnector.setSelectedSetlistId(null);
        logger.debug('No project ID available, initialized empty setlists and cleared selected setlist ID');
      }
    } catch (error) {
      logger.error('Error during setlists initialization', { error });
      // Initialize empty setlists map in case of error
      this.setlists = new Map();
      this.selectedSetlistId = null;
    }
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
    this.reaperConnector.on('projectChanged', async (projectId: string) => {
      // Properly await project change handling to ensure setlists are fully loaded
      // before any regions are loaded and filtered
      await this.handleProjectChanged(projectId);
    });
  }

  /**
   * Save all setlists to disk
   */
  private async saveSetlistsToDisk(): Promise<void> {
    try {
      if (!this.projectId) {
        logger.warn('Cannot save setlists: No project ID');
        return;
      }

      // Use the setlistStorage to save the setlists
      await this.setlistStorage.saveSetlists(
        this.projectId,
        this.setlists,
        this.selectedSetlistId
      );

      logger.info('Saved setlists to disk', {
        projectId: this.projectId,
        count: this.setlists.size
      });
    } catch (error) {
      logger.error('Failed to save setlists to disk', { error });
    }
  }


  /**
   * Load setlists from disk
   */
  public async loadSetlistsFromDisk(): Promise<void> {
    try {
      if (!this.projectId) {
        logger.warn('Cannot load setlists: No project ID');
        return;
      }

      // Use the setlistStorage to load the setlists
      const { setlists, selectedSetlistId } = await this.setlistStorage.loadSetlists(this.projectId);

      // Update the internal state
      this.setlists = setlists;
      this.selectedSetlistId = selectedSetlistId;

      logger.info('Loaded setlists from disk', {
        projectId: this.projectId,
        count: this.setlists.size,
        setlistIds: Array.from(this.setlists.keys()),
        selectedSetlistId: this.selectedSetlistId
      });

      // Always update the reaperConnector's playback state with the selected setlist ID
      // If selectedSetlistId is null or undefined, it will clear the selection in the playback state
      this.reaperConnector.setSelectedSetlistId(this.selectedSetlistId);
      logger.debug('Updated reaperConnector with loaded selected setlist', {
        selectedSetlistId: this.selectedSetlistId
      });

      // Emit setlists update event
      this.emit('setlists', this.getSetlists());

      // Emit selected setlist update event if there is one
      if (this.selectedSetlistId) {
        this.emit('selectedSetlist', this.selectedSetlistId);
      }
    } catch (error) {
      logger.error('Failed to load setlists from disk', { error });
    }
  }




  /**
   * Handle project ID update
   * @param projectId - Project ID
   */
  private async handleProjectIdUpdate(projectId: string): Promise<void> {
    logger.debug('Project ID updated', { projectId });

    // Update project ID
    this.projectId = projectId;

    // Load setlists from disk to ensure metadata (including selectedSetlistId) is loaded
    if (this.projectId) {
      // Await loading setlists to ensure selectedSetlistId is available before continuing
      await this.loadSetlistsFromDisk();

      // Note: loadSetlistsFromDisk already updates the reaperConnector with selectedSetlistId
      // (including setting to null if needed), so no need to do it again here
    }

    // Emit project ID update event
    this.emit('projectId', this.projectId);
  }

  /**
   * Handle project changed
   * @param projectId - Project ID
   */
  private async handleProjectChanged(projectId: string): Promise<void> {
    logger.info('Project changed', { projectId });

    // Update project ID
    this.projectId = projectId;

    // Load setlists from disk for the new project
    await this.loadSetlistsFromDisk();

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
  public async createSetlist(name: string): Promise<Setlist> {
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

    // Save to disk
    await this.saveSetlistsToDisk();

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
  public async updateSetlist(setlistId: string, name: string): Promise<Setlist | null> {
    const setlist = this.setlists.get(setlistId);

    if (!setlist) {
      logger.warn('Setlist not found', { setlistId });
      return null;
    }

    // Update the setlist
    setlist.name = name;

    // Update in setlists map
    this.setlists.set(setlistId, setlist);

    // Save to disk
    await this.saveSetlistsToDisk();

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
  public async deleteSetlist(setlistId: string): Promise<boolean> {
    const setlist = this.setlists.get(setlistId);

    if (!setlist) {
      logger.warn('Setlist not found', { setlistId });
      return false;
    }

    // Delete from setlists map
    this.setlists.delete(setlistId);

    // If the deleted setlist was the selected one, clear the selection
    if (this.selectedSetlistId === setlistId) {
      this.selectedSetlistId = null;
    }

    // Save changes to disk
    await this.saveSetlistsToDisk();

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
  public async addSetlistItem(setlistId: string, regionId: string, regionName: string, position?: number): Promise<SetlistItem | null> {
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

    // Save to disk
    await this.saveSetlistsToDisk();

    logger.info('Added item to setlist', { setlistId, regionId, position: itemPosition, name: regionName });

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
  public async removeSetlistItem(setlistId: string, itemId: string): Promise<boolean> {
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

    // Save to disk
    await this.saveSetlistsToDisk();

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
  public async moveSetlistItem(setlistId: string, itemId: string, newPosition: number): Promise<Setlist | null> {
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

    // Save to disk
    await this.saveSetlistsToDisk();

    logger.info('Moved item in setlist', { setlistId, itemId, newPosition });

    // Emit setlist update event
    this.emit('setlistUpdated', setlist);

    return setlist;
  }

  /**
   * Set selected setlist
   * When a setlist is selected, the first region in the setlist is selected and the player is paused
   * @param setlistId - Setlist ID or null to clear selection
   */
  public async setSelectedSetlist(setlistId: string | null): Promise<void> {
    logger.info('Selected setlist', { setlistId });

    // Store the selected setlist ID
    this.selectedSetlistId = setlistId;

    // Save to disk
    if (this.projectId) {
      await this.saveSetlistsToDisk();
      logger.debug('Saved selected setlist to disk', { setlistId });
    }

    // Update the reaperConnector's playback state
    this.reaperConnector.setSelectedSetlistId(setlistId);
    logger.debug('Updated reaperConnector with selected setlist', { setlistId });

    // If a setlist is selected, select the first region and pause playback
    if (setlistId) {
      try {
        // Get the setlist
        const setlist = this.getSetlist(setlistId);

        // If the setlist has items, select the first region
        if (setlist && setlist.items.length > 0) {
          const firstItem = setlist.items[0];
          logger.info(`Selecting first region in setlist: ${firstItem.name}`);

          // Seek to the first region
          // Skip region refresh since we're just changing views and already have the region data
          await this.reaperConnector.seekToRegion(firstItem.regionId, true);

          // Ensure the player is paused
          if (this.reaperConnector.getLastPlaybackState().isPlaying) {
            await this.reaperConnector.togglePlay();
          }

          logger.debug('Selected first region and ensured playback is paused');
        }
      } catch (error) {
        logger.error('Error selecting first region in setlist', { error, setlistId });
      }
    }

    // Emit selected setlist event
    this.emit('selectedSetlist', setlistId);
  }

  /**
   * Get the currently selected setlist ID
   * @returns The selected setlist ID or null if none is selected
   */
  public getSelectedSetlistId(): string | null {
    return this.selectedSetlistId;
  }

  /**
   * Get the next item in a setlist based on the current region
   * @param currentRegionId - ID of the current region
   * @returns Next setlist item or null if at the end or no setlist is selected
   */
  public getNextSetlistItem(currentRegionId: string): SetlistItem | null {
    try {
      // Check if a setlist is selected
      if (!this.selectedSetlistId) {
        logger.debug('No setlist selected, cannot get next item');
        return null;
      }

      // Get the selected setlist
      const setlist = this.getSetlist(this.selectedSetlistId);
      if (!setlist || setlist.items.length === 0) {
        logger.debug('Selected setlist not found or empty', { setlistId: this.selectedSetlistId });
        return null;
      }

      // If no current region, return the first item in the setlist
      if (!currentRegionId) {
        logger.debug('No current region, returning first item in setlist');
        return setlist.items[0];
      }

      // Find the current item in the setlist
      // Use String() to ensure type consistency when comparing IDs
      const currentItemIndex = setlist.items.findIndex(item => String(item.regionId) === String(currentRegionId));

      // If current region is not in the setlist or it's the last item, return null
      if (currentItemIndex === -1 || currentItemIndex >= setlist.items.length - 1) {
        logger.debug('Current region not in setlist or at the end', { currentRegionId, currentItemIndex });
        return null;
      }

      // Return the next item
      const nextItem = setlist.items[currentItemIndex + 1];
      logger.debug('Found next setlist item', {
        currentRegionId,
        nextRegionId: nextItem.regionId,
        nextItemName: nextItem.name
      });
      return nextItem;
    } catch (error) {
      logger.error('Error getting next setlist item', { error, currentRegionId });
      return null;
    }
  }

  /**
   * Get the previous item in a setlist based on the current region
   * @param currentRegionId - ID of the current region
   * @returns Previous setlist item or null if at the beginning or no setlist is selected
   */
  public getPreviousSetlistItem(currentRegionId: string): SetlistItem | null {
    try {
      // Check if a setlist is selected
      if (!this.selectedSetlistId) {
        logger.debug('No setlist selected, cannot get previous item');
        return null;
      }

      // Get the selected setlist
      const setlist = this.getSetlist(this.selectedSetlistId);
      if (!setlist || setlist.items.length === 0) {
        logger.debug('Selected setlist not found or empty', { setlistId: this.selectedSetlistId });
        return null;
      }

      // If no current region, return the first item in the setlist
      if (!currentRegionId) {
        logger.debug('No current region, returning first item in setlist');
        return setlist.items[0];
      }

      // Find the current item in the setlist
      // Use String() to ensure type consistency when comparing IDs
      const currentItemIndex = setlist.items.findIndex(item => String(item.regionId) === String(currentRegionId));

      // If current region is not in the setlist or it's the first item, return null
      if (currentItemIndex <= 0) {
        logger.debug('Current region not in setlist or at the beginning', { currentRegionId, currentItemIndex });
        return null;
      }

      // Return the previous item
      const prevItem = setlist.items[currentItemIndex - 1];
      logger.debug('Found previous setlist item', {
        currentRegionId,
        prevRegionId: prevItem.regionId,
        prevItemName: prevItem.name
      });
      return prevItem;
    } catch (error) {
      logger.error('Error getting previous setlist item', { error, currentRegionId });
      return null;
    }
  }

  /**
   * Clean up resources and event listeners
   * This method should be called when the service is no longer needed
   * to prevent memory leaks from unremoved event listeners
   */
  public cleanup(): void {
    // Prevent multiple cleanups
    if (this.hasCleanedUp) {
      logger.debug('ProjectService already cleaned up, skipping');
      return;
    }

    logger.debug('Cleaning up ProjectService event listeners');

    // Remove event listeners from reaperConnector
    this.reaperConnector.removeAllListeners('projectId');
    this.reaperConnector.removeAllListeners('projectChanged');

    // Remove all listeners from this instance
    this.removeAllListeners();

    // Mark as cleaned up
    this.hasCleanedUp = true;

    logger.info('ProjectService cleanup complete');
  }
}
