import { writable } from 'svelte/store';
import { 
  regions, 
  setlists, 
  currentSetlist, 
  setlistLoading, 
  setlistError,
  fetchSetlists, 
  fetchSetlist, 
  createSetlist, 
  updateSetlist, 
  deleteSetlist, 
  addSetlistItem, 
  removeSetlistItem, 
  moveSetlistItem,
  clearSetlistError
} from '$lib/stores';
import { socketControl } from '$lib/stores/socket';

// Local state as stores
export const _newSetlistName = writable('');
export const _editingSetlistId = writable(null);
export const _editingSetlistName = writable('');
export const _showConfirmDelete = writable(false);
export const _setlistToDelete = writable(null);

// Button processing states
export const _processingAddButtons = writable(new Set());
export const _processingRemoveButtons = writable(new Set());

/**
 * Initialize the page
 * - Fetches setlists
 * - Refreshes regions from Reaper
 */
export function _initializePage() {
  fetchSetlists();
  socketControl.refreshRegions();
}

/**
 * Handle creating a new setlist
 * @param {string} name - The name of the new setlist
 */
export async function _handleCreateSetlist(name) {
  if (!name.trim()) return;
  
  await createSetlist(name);
  _newSetlistName.set('');
}

/**
 * Start editing a setlist
 * @param {Object} setlist - The setlist to edit
 */
export function _startEditingSetlist(setlist) {
  _editingSetlistId.set(setlist.id);
  _editingSetlistName.set(setlist.name);
}

/**
 * Cancel editing a setlist
 */
export function _cancelEditingSetlist() {
  _editingSetlistId.set(null);
  _editingSetlistName.set('');
}

/**
 * Save setlist edits
 * @param {string} id - The ID of the setlist being edited
 * @param {string} name - The new name for the setlist
 */
export async function _saveSetlistEdits(id, name) {
  if (!name.trim()) return;
  
  await updateSetlist(id, name);
  _editingSetlistId.set(null);
  _editingSetlistName.set('');
}

/**
 * Show delete confirmation
 * @param {Object} setlist - The setlist to delete
 */
export function _confirmDeleteSetlist(setlist) {
  _setlistToDelete.set(setlist);
  _showConfirmDelete.set(true);
}

/**
 * Cancel delete
 */
export function _cancelDelete() {
  _setlistToDelete.set(null);
  _showConfirmDelete.set(false);
}

/**
 * Delete setlist
 * @param {string} id - The ID of the setlist to delete
 */
export async function _handleDeleteSetlist(id) {
  if (!id) return;
  
  await deleteSetlist(id);
  _setlistToDelete.set(null);
  _showConfirmDelete.set(false);
}

/**
 * Select a setlist
 * @param {string} id - The ID of the setlist to select
 */
export async function _selectSetlist(id) {
  await fetchSetlist(id);
}

/**
 * Add a region to the current setlist
 * @param {string} regionId - The ID of the region to add
 * @param {string} regionName - The name of the region to add
 */
export async function _addRegionToSetlist(regionId, regionName) {
  let currentSetlistValue;
  currentSetlist.subscribe(value => { currentSetlistValue = value; })();
  
  if (!currentSetlistValue) return;
  
  // Set processing state
  _processingAddButtons.update(set => {
    set.add(regionId);
    return set;
  });
  
  try {
    await addSetlistItem(currentSetlistValue.id, regionId, regionName);
  } finally {
    // Clear processing state
    _processingAddButtons.update(set => {
      set.delete(regionId);
      return set;
    });
  }
}

/**
 * Remove an item from the current setlist
 * @param {string} itemId - The ID of the item to remove
 */
export async function _removeItemFromSetlist(itemId) {
  let currentSetlistValue;
  currentSetlist.subscribe(value => { currentSetlistValue = value; })();
  
  if (!currentSetlistValue) return;
  
  // Set processing state
  _processingRemoveButtons.update(set => {
    set.add(itemId);
    return set;
  });
  
  try {
    await removeSetlistItem(currentSetlistValue.id, itemId);
  } finally {
    // Clear processing state
    _processingRemoveButtons.update(set => {
      set.delete(itemId);
      return set;
    });
  }
}

/**
 * Move an item up in the setlist
 * @param {string} itemId - The ID of the item to move
 * @param {number} currentPosition - The current position of the item
 */
export async function _moveItemUp(itemId, currentPosition) {
  let currentSetlistValue;
  currentSetlist.subscribe(value => { currentSetlistValue = value; })();
  
  if (!currentSetlistValue || currentPosition <= 0) return;
  
  await moveSetlistItem(currentSetlistValue.id, itemId, currentPosition - 1);
}

/**
 * Move an item down in the setlist
 * @param {string} itemId - The ID of the item to move
 * @param {number} currentPosition - The current position of the item
 */
export async function _moveItemDown(itemId, currentPosition) {
  let currentSetlistValue;
  currentSetlist.subscribe(value => { currentSetlistValue = value; })();
  
  if (!currentSetlistValue || currentPosition >= currentSetlistValue.items.length - 1) return;
  
  await moveSetlistItem(currentSetlistValue.id, itemId, currentPosition + 1);
}

/**
 * Check if a region is already in the current setlist
 * @param {string} regionId - The ID of the region to check
 * @returns {boolean} - True if the region is in the setlist, false otherwise
 */
export function _isRegionInSetlist(regionId) {
  let currentSetlistValue;
  currentSetlist.subscribe(value => { currentSetlistValue = value; })();
  
  if (!currentSetlistValue) return false;
  return currentSetlistValue.items.some(item => item.regionId === regionId);
}