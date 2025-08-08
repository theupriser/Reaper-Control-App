/**
 * Setlist Store
 * Manages the state of setlists and the current setlist
 */

import { writable, derived } from 'svelte/store';
import { projectId } from './projectStore';

/**
 * Store for the list of setlists
 */
export const setlists = writable([]);

/**
 * Store for the currently selected setlist
 */
export const currentSetlist = writable(null);

/**
 * Store for the loading state
 */
export const loading = writable(false);

/**
 * Store for any error messages
 */
export const error = writable(null);

/**
 * Derived store that combines the current setlist with the regions
 * to provide a complete view of the setlist with region details
 */
export const currentSetlistWithRegions = derived(
  [currentSetlist],
  ([$currentSetlist]) => {
    if (!$currentSetlist) return null;
    return $currentSetlist;
  }
);

/**
 * Fetch all setlists from the API
 * @returns {Promise<Array>} Array of setlists
 */
export async function fetchSetlists() {
  loading.set(true);
  error.set(null);
  
  try {
    const response = await fetch('/api/setlists');
    
    if (!response.ok) {
      throw new Error(`Error fetching setlists: ${response.statusText}`);
    }
    
    const data = await response.json();
    setlists.set(data);
    return data;
  } catch (err) {
    console.error('Error fetching setlists:', err);
    error.set(err.message);
    return [];
  } finally {
    loading.set(false);
  }
}

/**
 * Fetch a setlist by ID
 * @param {string} id - Setlist ID
 * @returns {Promise<Object|null>} Setlist object or null if not found
 */
export async function fetchSetlist(id) {
  loading.set(true);
  error.set(null);
  
  try {
    const response = await fetch(`/api/setlists/${id}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Error fetching setlist: ${response.statusText}`);
    }
    
    const data = await response.json();
    currentSetlist.set(data);
    return data;
  } catch (err) {
    console.error(`Error fetching setlist ${id}:`, err);
    error.set(err.message);
    return null;
  } finally {
    loading.set(false);
  }
}

/**
 * Create a new setlist
 * @param {string} name - Setlist name
 * @returns {Promise<Object|null>} Created setlist or null if creation failed
 */
export async function createSetlist(name) {
  loading.set(true);
  error.set(null);
  
  try {
    const response = await fetch('/api/setlists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    });
    
    if (!response.ok) {
      throw new Error(`Error creating setlist: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Update the setlists store
    setlists.update(current => [...current, data]);
    
    // Set as current setlist
    currentSetlist.set(data);
    
    return data;
  } catch (err) {
    console.error('Error creating setlist:', err);
    error.set(err.message);
    return null;
  } finally {
    loading.set(false);
  }
}

/**
 * Update a setlist
 * @param {string} id - Setlist ID
 * @param {string} name - New setlist name
 * @returns {Promise<Object|null>} Updated setlist or null if update failed
 */
export async function updateSetlist(id, name) {
  loading.set(true);
  error.set(null);
  
  try {
    const response = await fetch(`/api/setlists/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    });
    
    if (!response.ok) {
      throw new Error(`Error updating setlist: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Update the setlists store
    setlists.update(current => 
      current.map(setlist => setlist.id === id ? data : setlist)
    );
    
    // Update current setlist if it's the one being edited
    currentSetlist.update(current => 
      current && current.id === id ? data : current
    );
    
    return data;
  } catch (err) {
    console.error(`Error updating setlist ${id}:`, err);
    error.set(err.message);
    return null;
  } finally {
    loading.set(false);
  }
}

/**
 * Delete a setlist
 * @param {string} id - Setlist ID
 * @returns {Promise<boolean>} True if deletion was successful, false otherwise
 */
export async function deleteSetlist(id) {
  loading.set(true);
  error.set(null);
  
  try {
    const response = await fetch(`/api/setlists/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`Error deleting setlist: ${response.statusText}`);
    }
    
    // Update the setlists store
    setlists.update(current => 
      current.filter(setlist => setlist.id !== id)
    );
    
    // Clear current setlist if it's the one being deleted
    currentSetlist.update(current => 
      current && current.id === id ? null : current
    );
    
    return true;
  } catch (err) {
    console.error(`Error deleting setlist ${id}:`, err);
    error.set(err.message);
    return false;
  } finally {
    loading.set(false);
  }
}

/**
 * Add an item to a setlist
 * @param {string} setlistId - Setlist ID
 * @param {number} regionId - Region ID
 * @param {string} regionName - Region name
 * @param {number} position - Position in the setlist (optional)
 * @returns {Promise<Object|null>} Added item or null if addition failed
 */
export async function addSetlistItem(setlistId, regionId, regionName, position) {
  loading.set(true);
  error.set(null);
  
  // Create a temporary ID for the optimistic update
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  // Store original setlist in case we need to revert
  let originalSetlist = null;
  
  // Create a temporary item for the optimistic update
  const tempItem = {
    id: tempId,
    regionId: regionId,
    name: regionName || `Region ${regionId}`, // Use provided region name or a placeholder
    position: position !== undefined ? position : 9999 // Use a high position if not specified
  };
  
  // Optimistic UI update - add the item immediately
  currentSetlist.update(current => {
    if (!current || current.id !== setlistId) return current;
    
    // Store the original setlist in case we need to revert
    originalSetlist = { ...current, items: [...current.items] };
    
    // Add the temporary item
    const newItems = [...current.items, tempItem];
    
    // Sort by position if position was specified
    if (position !== undefined) {
      newItems.sort((a, b) => a.position - b.position);
    }
    
    // Return updated setlist with the new item
    return {
      ...current,
      items: newItems
    };
  });
  
  try {
    const response = await fetch(`/api/setlists/${setlistId}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ regionId, position })
    });
    
    if (!response.ok) {
      throw new Error(`Error adding setlist item: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Update the temporary item with the real one
    currentSetlist.update(current => {
      if (!current || current.id !== setlistId) return current;
      
      return {
        ...current,
        items: current.items.map(item => 
          item.id === tempId ? data : item
        )
      };
    });
    
    return data;
  } catch (err) {
    console.error(`Error adding item to setlist ${setlistId}:`, err);
    error.set(err.message);
    
    // Revert the optimistic update if the API call failed
    if (originalSetlist) {
      currentSetlist.set(originalSetlist);
    }
    
    return null;
  } finally {
    loading.set(false);
  }
}

/**
 * Remove an item from a setlist
 * @param {string} setlistId - Setlist ID
 * @param {string} itemId - Item ID
 * @returns {Promise<boolean>} True if removal was successful, false otherwise
 */
export async function removeSetlistItem(setlistId, itemId) {
  loading.set(true);
  error.set(null);
  
  // Optimistic UI update - remove the item immediately
  let originalSetlist = null;
  let removedItem = null;
  
  currentSetlist.update(current => {
    if (!current || current.id !== setlistId) return current;
    
    // Store the original setlist in case we need to revert
    originalSetlist = { ...current, items: [...current.items] };
    
    // Find the item to be removed
    removedItem = current.items.find(item => item.id === itemId);
    
    // Return updated setlist with the item removed
    return {
      ...current,
      items: current.items.filter(item => item.id !== itemId)
    };
  });
  
  try {
    const response = await fetch(`/api/setlists/${setlistId}/items/${itemId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`Error removing setlist item: ${response.statusText}`);
    }
    
    // No need to refresh the setlist as we've already updated the UI
    return true;
  } catch (err) {
    console.error(`Error removing item ${itemId} from setlist ${setlistId}:`, err);
    error.set(err.message);
    
    // Revert the optimistic update if the API call failed
    if (originalSetlist) {
      currentSetlist.set(originalSetlist);
    }
    
    return false;
  } finally {
    loading.set(false);
  }
}

/**
 * Move an item within a setlist
 * @param {string} setlistId - Setlist ID
 * @param {string} itemId - Item ID
 * @param {number} newPosition - New position for the item
 * @returns {Promise<boolean>} True if move was successful, false otherwise
 */
export async function moveSetlistItem(setlistId, itemId, newPosition) {
  loading.set(true);
  error.set(null);
  
  try {
    const response = await fetch(`/api/setlists/${setlistId}/items/${itemId}/move`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ position: newPosition })
    });
    
    if (!response.ok) {
      throw new Error(`Error moving setlist item: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Update current setlist with the returned data
    currentSetlist.set(data);
    
    // Also update the setlist in the setlists store
    setlists.update(current => 
      current.map(setlist => setlist.id === setlistId ? data : setlist)
    );
    
    return true;
  } catch (err) {
    console.error(`Error moving item ${itemId} in setlist ${setlistId}:`, err);
    error.set(err.message);
    return false;
  } finally {
    loading.set(false);
  }
}

/**
 * Clear any error message
 */
export function clearError() {
  error.set(null);
}

/**
 * Reset the setlist store
 */
export function resetSetlistStore() {
  setlists.set([]);
  currentSetlist.set(null);
  loading.set(false);
  error.set(null);
}

// Listen for project ID changes and refresh setlists
projectId.subscribe(async (id) => {
  if (id) {
    await fetchSetlists();
  } else {
    resetSetlistStore();
  }
});

// Export all functions
export default {
  setlists,
  currentSetlist,
  loading,
  error,
  currentSetlistWithRegions,
  fetchSetlists,
  fetchSetlist,
  createSetlist,
  updateSetlist,
  deleteSetlist,
  addSetlistItem,
  removeSetlistItem,
  moveSetlistItem,
  clearError,
  resetSetlistStore
};