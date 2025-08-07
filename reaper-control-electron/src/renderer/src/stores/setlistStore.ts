/**
 * Setlist Store
 * Manages the state of setlists and the current setlist
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import { projectId } from './projectStore';
import logger from '../lib/utils/logger';
import ipcService from '../services/ipcService';

// Define interfaces for the data types
export interface SetlistItem {
  id: string;
  regionId: string;
  name: string;
  position: number;
}

export interface Setlist {
  id: string;
  name: string;
  projectId: string;
  items: SetlistItem[];
}

/**
 * Store for the list of setlists
 */
export const setlists: Writable<Setlist[]> = writable([]);

/**
 * Store for the currently selected setlist
 */
export const currentSetlist: Writable<Setlist | null> = writable(null);

/**
 * Store for the loading state
 */
export const setlistLoading: Writable<boolean> = writable(false);

/**
 * Store for any error messages
 */
export const setlistError: Writable<string | null> = writable(null);

/**
 * Derived store that combines the current setlist with the regions
 * to provide a complete view of the setlist with region details
 */
export const currentSetlistWithRegions: Readable<Setlist | null> = derived(
  [currentSetlist],
  ([$currentSetlist]) => {
    if (!$currentSetlist) return null;
    return $currentSetlist;
  }
);

/**
 * Initialize the setlist store
 * Sets up event listeners for setlist updates
 */
export function initializeSetlistStore(): void {
  logger.log('Initializing setlist store');

  // Set up event listeners for setlist updates
  window.electronAPI.onSetlistsUpdate((data: Setlist[]) => {
    logger.log('Received setlists update:', data);
    setlists.set(data);
  });

  window.electronAPI.onSetlistUpdate((data: Setlist) => {
    logger.log('Received setlist update:', data);

    // Update the current setlist if it's the one being updated
    currentSetlist.update(current => {
      if (current && current.id === data.id) {
        return data;
      }
      return current;
    });

    // Update the setlist in the setlists store
    setlists.update(current =>
      current.map(setlist => setlist.id === data.id ? data : setlist)
    );
  });

  // Listen for project ID changes and refresh setlists
  projectId.subscribe(async (id) => {
    if (id) {
      await fetchSetlists();
    } else {
      resetSetlistStore();
    }
  });
}

/**
 * Fetch all setlists from the main process
 * @returns Promise that resolves with the setlists
 */
export async function fetchSetlists(): Promise<Setlist[]> {
  setlistLoading.set(true);
  setlistError.set(null);

  try {
    const data = await window.electronAPI.getSetlists();
    setlists.set(data);
    return data;
  } catch (err) {
    logger.error('Error fetching setlists:', err);
    setlistError.set(err instanceof Error ? err.message : String(err));
    return [];
  } finally {
    setlistLoading.set(false);
  }
}

/**
 * Fetch a setlist by ID
 * @param id - Setlist ID
 * @returns Promise that resolves with the setlist or null if not found
 */
export async function fetchSetlist(id: string): Promise<Setlist | null> {
  setlistLoading.set(true);
  setlistError.set(null);

  try {
    const data = await window.electronAPI.getSetlist(id);

    if (data) {
      currentSetlist.set(data);
    } else {
      currentSetlist.set(null);
      setlistError.set(`Setlist with ID ${id} not found`);
    }

    return data;
  } catch (err) {
    logger.error(`Error fetching setlist ${id}:`, err);
    setlistError.set(err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    setlistLoading.set(false);
  }
}

/**
 * Create a new setlist
 * @param name - Setlist name
 * @returns Promise that resolves with the created setlist or null if creation failed
 */
export async function createSetlist(name: string): Promise<Setlist | null> {
  setlistLoading.set(true);
  setlistError.set(null);

  try {
    const data = await window.electronAPI.createSetlist(name);

    // Set as current setlist
    currentSetlist.set(data);

    return data;
  } catch (err) {
    logger.error('Error creating setlist:', err);
    setlistError.set(err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    setlistLoading.set(false);
  }
}

/**
 * Update a setlist
 * @param id - Setlist ID
 * @param name - New setlist name
 * @returns Promise that resolves with the updated setlist or null if update failed
 */
export async function updateSetlist(id: string, name: string): Promise<Setlist | null> {
  setlistLoading.set(true);
  setlistError.set(null);

  try {
    const data = await window.electronAPI.updateSetlist(id, name);
    return data;
  } catch (err) {
    logger.error(`Error updating setlist ${id}:`, err);
    setlistError.set(err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    setlistLoading.set(false);
  }
}

/**
 * Delete a setlist
 * @param id - Setlist ID
 * @returns Promise that resolves with true if deletion was successful, false otherwise
 */
export async function deleteSetlist(id: string): Promise<boolean> {
  setlistLoading.set(true);
  setlistError.set(null);

  try {
    const success = await window.electronAPI.deleteSetlist(id);

    if (success) {
      // Clear current setlist if it's the one being deleted
      currentSetlist.update(current =>
        current && current.id === id ? null : current
      );
    }

    return success;
  } catch (err) {
    logger.error(`Error deleting setlist ${id}:`, err);
    setlistError.set(err instanceof Error ? err.message : String(err));
    return false;
  } finally {
    setlistLoading.set(false);
  }
}

/**
 * Add an item to a setlist
 * @param setlistId - Setlist ID
 * @param regionId - Region ID
 * @param regionName - Region name
 * @param position - Position in the setlist (optional)
 * @returns Promise that resolves with the added item or null if addition failed
 */
export async function addSetlistItem(
  setlistId: string,
  regionId: string,
  regionName?: string,
  position?: number
): Promise<SetlistItem | null> {
  setlistLoading.set(true);
  setlistError.set(null);

  try {
    const item = await window.electronAPI.addSetlistItem(setlistId, regionId, regionName, position);
    return item;
  } catch (err) {
    logger.error(`Error adding item to setlist ${setlistId}:`, err);
    setlistError.set(err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    setlistLoading.set(false);
  }
}

/**
 * Remove an item from a setlist
 * @param setlistId - Setlist ID
 * @param itemId - Item ID
 * @returns Promise that resolves with true if removal was successful, false otherwise
 */
export async function removeSetlistItem(setlistId: string, itemId: string): Promise<boolean> {
  setlistLoading.set(true);
  setlistError.set(null);

  try {
    const success = await window.electronAPI.removeSetlistItem(setlistId, itemId);
    return success;
  } catch (err) {
    logger.error(`Error removing item ${itemId} from setlist ${setlistId}:`, err);
    setlistError.set(err instanceof Error ? err.message : String(err));
    return false;
  } finally {
    setlistLoading.set(false);
  }
}

/**
 * Move an item within a setlist
 * @param setlistId - Setlist ID
 * @param itemId - Item ID
 * @param newPosition - New position for the item
 * @returns Promise that resolves with the updated setlist or null if move failed
 */
export async function moveSetlistItem(
  setlistId: string,
  itemId: string,
  newPosition: number
): Promise<Setlist | null> {
  setlistLoading.set(true);
  setlistError.set(null);

  try {
    const updatedSetlist = await window.electronAPI.moveSetlistItem(setlistId, itemId, newPosition);
    return updatedSetlist;
  } catch (err) {
    logger.error(`Error moving item ${itemId} in setlist ${setlistId}:`, err);
    setlistError.set(err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    setlistLoading.set(false);
  }
}

/**
 * Set the selected setlist
 * @param setlistId - Setlist ID or null to clear selection
 */
export async function setSelectedSetlist(setlistId: string | null): Promise<void> {
  try {
    await window.electronAPI.setSelectedSetlist(setlistId);

    // If a setlist is selected, fetch it to update the currentSetlist store
    if (setlistId) {
      await fetchSetlist(setlistId);
    } else {
      currentSetlist.set(null);
    }
  } catch (err) {
    logger.error(`Error setting selected setlist to ${setlistId}:`, err);
    setlistError.set(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Clear any error message
 */
export function clearSetlistError(): void {
  setlistError.set(null);
}

/**
 * Reset the setlist store
 */
export function resetSetlistStore(): void {
  setlists.set([]);
  currentSetlist.set(null);
  setlistLoading.set(false);
  setlistError.set(null);
}

// Export all functions
export default {
  setlists,
  currentSetlist,
  setlistLoading,
  setlistError,
  currentSetlistWithRegions,
  initializeSetlistStore,
  fetchSetlists,
  fetchSetlist,
  createSetlist,
  updateSetlist,
  deleteSetlist,
  addSetlistItem,
  removeSetlistItem,
  moveSetlistItem,
  setSelectedSetlist,
  clearSetlistError,
  resetSetlistStore
};
