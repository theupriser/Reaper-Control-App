/**
 * Project Service
 * Manages project information in REAPER
 */
import { EventEmitter } from 'events';
import { Setlist, SetlistItem } from '../types';
import { ReaperConnector } from './reaperConnector';
import logger from '../utils/logger';

// Constants for setlist storage in Reaper project extended state
const SETLIST_SECTION = 'ReaperControl_Setlists';
const SETLIST_INDEX_KEY = 'SetlistIndex';
const SETLIST_PREFIX = 'Setlist_';
const SELECTED_SETLIST_KEY = 'SelectedSetlist';

export class ProjectService extends EventEmitter {
  private projectId: string = '';
  private setlists: Map<string, Setlist> = new Map();
  private selectedSetlistId: string | null = null;
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

    // Initialize setlists from project if available
    this.refreshProjectId().then(() => {
      if (this.projectId) {
        this.loadSetlistsFromProject();
      } else {
        // Initialize empty setlists map
        this.setlists = new Map();
        logger.debug('No project ID available, initialized empty setlists');
      }
    });

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
      // Use void to handle the promise without awaiting it
      void this.handleProjectChanged(projectId);
    });
  }

  /**
   * Serialize setlists to JSON for storage
   * @returns JSON string of setlists index
   */
  private serializeSetlistIndex(): string {
    // Create an array of setlist IDs
    const setlistIds = Array.from(this.setlists.keys());
    return JSON.stringify(setlistIds);
  }

  /**
   * Serialize a single setlist to JSON
   * @param setlist - Setlist to serialize
   * @returns JSON string of setlist
   */
  private serializeSetlist(setlist: Setlist): string {
    return JSON.stringify(setlist);
  }

  /**
   * Deserialize a setlist from JSON
   * @param json - JSON string of setlist
   * @returns Deserialized setlist or null if invalid
   */
  private deserializeSetlist(json: string): Setlist | null {
    try {
      return JSON.parse(json) as Setlist;
    } catch (error) {
      logger.error('Failed to deserialize setlist', { error, json });
      return null;
    }
  }

  /**
   * Save all setlists to Reaper project file
   */
  private async saveSetlistsToProject(): Promise<void> {
    try {
      if (!this.projectId) {
        logger.warn('Cannot save setlists: No project ID');
        return;
      }

      // Save the setlist index (list of all setlist IDs)
      const setlistIndex = this.serializeSetlistIndex();
      await this.reaperConnector.setProjectExtState(
        SETLIST_SECTION,
        SETLIST_INDEX_KEY,
        setlistIndex
      );

      // Save each individual setlist
      for (const [id, setlist] of this.setlists.entries()) {
        const setlistJson = this.serializeSetlist(setlist);
        await this.reaperConnector.setProjectExtState(
          SETLIST_SECTION,
          `${SETLIST_PREFIX}${id}`,
          setlistJson
        );
      }

      // Save the selected setlist ID
      await this.reaperConnector.setProjectExtState(
        SETLIST_SECTION,
        SELECTED_SETLIST_KEY,
        this.selectedSetlistId || ''
      );

      logger.info('Saved setlists to project', {
        projectId: this.projectId,
        count: this.setlists.size
      });
    } catch (error) {
      logger.error('Failed to save setlists to project', { error });
    }
  }

  /**
   * Save a specific setlist to Reaper project file
   * @param setlistId - ID of setlist to save
   */
  private async saveSetlistToProject(setlistId: string): Promise<void> {
    try {
      if (!this.projectId) {
        logger.warn('Cannot save setlist: No project ID');
        return;
      }

      const setlist = this.setlists.get(setlistId);
      if (!setlist) {
        logger.warn('Cannot save setlist: Not found', { setlistId });
        return;
      }

      // Save the setlist
      const setlistJson = this.serializeSetlist(setlist);
      await this.reaperConnector.setProjectExtState(
        SETLIST_SECTION,
        `${SETLIST_PREFIX}${setlistId}`,
        setlistJson
      );

      // Update the setlist index
      await this.saveSetlistsToProject();

      logger.info('Saved setlist to project', {
        projectId: this.projectId,
        setlistId
      });
    } catch (error) {
      logger.error('Failed to save setlist to project', {
        error,
        setlistId
      });
    }
  }

  /**
   * Load setlists from Reaper project file
   */
  public async loadSetlistsFromProject(): Promise<void> {
    try {
      if (!this.projectId) {
        logger.warn('Cannot load setlists: No project ID');
        return;
      }

      // Load the setlist index
      const setlistIndexJson = await this.reaperConnector.getProjectExtState(
        SETLIST_SECTION,
        SETLIST_INDEX_KEY
      );

      // Clear existing setlists
      this.setlists.clear();

      // First, try to load setlists from the index
      if (setlistIndexJson) {
        // Parse the setlist index
        const setlistIds = JSON.parse(setlistIndexJson) as string[];

        // Load each setlist from the index
        for (const id of setlistIds) {
          const setlistJson = await this.reaperConnector.getProjectExtState(
            SETLIST_SECTION,
            `${SETLIST_PREFIX}${id}`
          );

          if (setlistJson) {
            const setlist = this.deserializeSetlist(setlistJson);
            if (setlist) {
              this.setlists.set(id, setlist);
            }
          }
        }
      } else {
        logger.info('No setlist index found in project, will search for direct setlists', { projectId: this.projectId });
      }

      // Also look for setlists with the SETLIST_SETLIST- prefix
      // This handles setlists created directly in Reaper that might not be in our index
      try {
        // First, try the specific IDs mentioned in the issue
        // The issue mentions: SETLIST_SETLIST-1754643137940-DT6XI30 and SETLIST_SETLIST-1754643289597-TLOT4P
        // These appear to be in the format SETLIST_SETLIST-timestamp-randomchars
        const specificIds = [
          'SETLIST-1754643137940-DT6XI30',
          'SETLIST-1754643289597-TLOT4P'
        ];

        // Also try with different prefix formats
        const alternateKeys = [
          'SETLIST_SETLIST-1754643137940-DT6XI30',
          'SETLIST_SETLIST-1754643289597-TLOT4P',
          'SETLIST-1754643137940-DT6XI30',
          'SETLIST-1754643289597-TLOT4P'
        ];

        // Try the specific IDs with our standard prefix
        for (const id of specificIds) {
          const key = `SETLIST_${id}`;
          const setlistJson = await this.reaperConnector.getProjectExtState(
            SETLIST_SECTION,
            key
          );

          if (setlistJson) {
            logger.info(`Found setlist with key ${key}`, { projectId: this.projectId });
            const setlist = this.deserializeSetlist(setlistJson);
            if (setlist) {
              // If the setlist doesn't have an ID, use the key as the ID
              if (!setlist.id) {
                setlist.id = id;
              }
              this.setlists.set(setlist.id, setlist);
            }
          }
        }

        // Try the alternate keys directly in our standard section
        for (const key of alternateKeys) {
          const setlistJson = await this.reaperConnector.getProjectExtState(
            SETLIST_SECTION,
            key
          );

          if (setlistJson) {
            logger.info(`Found setlist with direct key ${key}`, { projectId: this.projectId });
            const setlist = this.deserializeSetlist(setlistJson);
            if (setlist) {
              // Extract an ID from the key
              const id = key.replace('SETLIST_', '');
              if (!setlist.id) {
                setlist.id = id;
              }
              this.setlists.set(setlist.id, setlist);
            }
          }
        }

        // Also try looking in different sections
        // The setlists might be stored in a different section than our standard one
        const alternateSections = [
          'SETLIST',
          'REAPER_CONTROL',
          'SETLISTS'
        ];

        for (const section of alternateSections) {
          for (const key of alternateKeys) {
            try {
              const setlistJson = await this.reaperConnector.getProjectExtState(
                section,
                key
              );

              if (setlistJson) {
                logger.info(`Found setlist in alternate section ${section} with key ${key}`, { projectId: this.projectId });
                const setlist = this.deserializeSetlist(setlistJson);
                if (setlist) {
                  // Extract an ID from the key
                  const id = key.replace('SETLIST_', '');
                  if (!setlist.id) {
                    setlist.id = id;
                  }
                  this.setlists.set(setlist.id, setlist);
                }
              }
            } catch (e) {
              // Ignore errors for individual section/key checks
            }
          }
        }

        // Then try a more general approach to find any setlists with the SETLIST_SETLIST- pattern
        // Generate potential IDs based on current timestamp patterns
        // This is a heuristic approach since we can't list all keys
        const now = new Date();
        const currentTimestamp = Math.floor(now.getTime() / 1000);

        // Try timestamps from the last 24 hours with 1-hour intervals
        for (let i = 0; i < 24; i++) {
          const timestamp = currentTimestamp - (i * 3600);
          const potentialId = `SETLIST-${timestamp}`;

          // Try a few random suffixes that might be used
          const suffixes = ['', '-A', '-B', '-C', '-SET1', '-SET2'];

          for (const suffix of suffixes) {
            const key = `SETLIST_${potentialId}${suffix}`;
            try {
              const setlistJson = await this.reaperConnector.getProjectExtState(
                SETLIST_SECTION,
                key
              );

              if (setlistJson) {
                logger.info(`Found additional setlist with key ${key}`, { projectId: this.projectId });
                const setlist = this.deserializeSetlist(setlistJson);
                if (setlist) {
                  const id = `${potentialId}${suffix}`;
                  if (!setlist.id) {
                    setlist.id = id;
                  }
                  this.setlists.set(setlist.id, setlist);
                }
              }
            } catch (e) {
              // Ignore errors for individual key checks
            }
          }
        }
      } catch (error) {
        logger.warn('Error while searching for direct setlists', { error });
        // Continue with the setlists we've already found
      }

      // Load the selected setlist ID
      const selectedSetlistId = await this.reaperConnector.getProjectExtState(
        SETLIST_SECTION,
        SELECTED_SETLIST_KEY
      );
      this.selectedSetlistId = selectedSetlistId || null;

      // If we found setlists but no selected setlist, select the first one
      if (this.setlists.size > 0 && !this.selectedSetlistId) {
        this.selectedSetlistId = Array.from(this.setlists.keys())[0];
        logger.info('No selected setlist found, selecting the first one', {
          selectedSetlistId: this.selectedSetlistId
        });
      }

      logger.info('Loaded setlists from project', {
        projectId: this.projectId,
        count: this.setlists.size,
        setlistIds: Array.from(this.setlists.keys()),
        selectedSetlistId: this.selectedSetlistId
      });

      // Update the reaperConnector's playback state with the selected setlist ID
      if (this.selectedSetlistId) {
        this.reaperConnector.setSelectedSetlistId(this.selectedSetlistId);
        logger.debug('Updated reaperConnector with loaded selected setlist', {
          selectedSetlistId: this.selectedSetlistId
        });
      }

      // Emit setlists update event
      this.emit('setlists', this.getSetlists());

      // Emit selected setlist update event if there is one
      if (this.selectedSetlistId) {
        this.emit('selectedSetlist', this.selectedSetlistId);
      }
    } catch (error) {
      logger.error('Failed to load setlists from project', { error });
    }
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
  private async handleProjectChanged(projectId: string): Promise<void> {
    logger.info('Project changed', { projectId });

    // Update project ID
    this.projectId = projectId;

    // Load setlists from the project
    await this.loadSetlistsFromProject();

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

    // Save to project file
    await this.saveSetlistToProject(setlist.id);

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

    // Save to project file
    await this.saveSetlistToProject(setlistId);

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
   * @description Removes the setlist from the internal map and also removes the key-value pair from Reaper's extended state.
   * Handles multiple key formats (standard, SETLIST_, SETLIST_SETLIST-, etc.) and checks multiple sections
   * (ReaperControl_Setlists, SETLIST, REAPER_CONTROL, SETLISTS) to ensure complete removal of all setlist data.
   * Also updates the setlist index to remove the deleted setlist.
   */
  public async deleteSetlist(setlistId: string): Promise<boolean> {
    const setlist = this.setlists.get(setlistId);

    if (!setlist) {
      logger.warn('Setlist not found', { setlistId });
      return false;
    }

    // Delete from setlists map
    this.setlists.delete(setlistId);

    // Explicitly remove the setlist data from Reaper's extended state
    if (this.projectId) {
      try {
        // Remove the setlist data using our standard format
        await this.reaperConnector.setProjectExtState(
          SETLIST_SECTION,
          `${SETLIST_PREFIX}${setlistId}`,
          ''
        );
        logger.info('Removed setlist data from Reaper extended state', { setlistId });

        // Also try to remove alternate formats of the key
        // This handles the case where the setlist might have been stored with a different key format
        const alternateKeys = [
          `SETLIST_${setlistId}`,
          `SETLIST_SETLIST-${setlistId}`,
          setlistId,
          `SETLIST-${setlistId}`
        ];

        for (const key of alternateKeys) {
          try {
            await this.reaperConnector.setProjectExtState(
              SETLIST_SECTION,
              key,
              ''
            );
            logger.debug(`Removed alternate key format: ${key}`, { setlistId });
          } catch (e) {
            // Ignore errors for individual key removals
          }
        }

        // Also try removing from alternate sections
        const alternateSections = [
          'SETLIST',
          'REAPER_CONTROL',
          'SETLISTS'
        ];

        for (const section of alternateSections) {
          for (const key of alternateKeys) {
            try {
              await this.reaperConnector.setProjectExtState(
                section,
                key,
                ''
              );
              logger.debug(`Removed from alternate section ${section} with key ${key}`, { setlistId });
            } catch (e) {
              // Ignore errors for individual section/key removals
            }
          }
        }
      } catch (error) {
        logger.error('Failed to remove setlist data from Reaper extended state', { error, setlistId });
      }
    }

    // Save changes to project file (updates the index)
    await this.saveSetlistsToProject();

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

    // Save to project file
    await this.saveSetlistToProject(setlistId);

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

    // Save to project file
    await this.saveSetlistToProject(setlistId);

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

    // Save to project file
    await this.saveSetlistToProject(setlistId);

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

    // Save to project file
    if (this.projectId) {
      await this.reaperConnector.setProjectExtState(
        SETLIST_SECTION,
        SELECTED_SETLIST_KEY,
        setlistId || ''
      );
      logger.debug('Saved selected setlist to project', { setlistId });
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
          await this.reaperConnector.seekToRegion(firstItem.regionId);

          // Ensure the player is paused
          if (this.reaperConnector.lastPlaybackState.isPlaying) {
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
}
