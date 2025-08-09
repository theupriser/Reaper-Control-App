/**
 * Store Utilities
 * Helper functions for working with Svelte stores
 */

import type { Readable } from 'svelte/store';
import logger from './logger';

/**
 * Get the current value from a store
 * @param store - Svelte readable store
 * @returns Current value of the store
 */
export function getStoreValue<T>(store: Readable<T>): T {
  let value!: T;
  const unsubscribe = store.subscribe(currentValue => {
    value = currentValue;
  });
  unsubscribe();
  return value;
}

/**
 * Find an item in a store by its ID
 * @param store - Svelte readable store containing an array of items
 * @param id - ID to find
 * @param idField - Name of the ID field (default: 'id')
 * @returns Found item or null
 */
export function findItemById<T extends Record<string, any>>(
  store: Readable<T[]>,
  id: number | string,
  idField: string = 'id'
): T | null {
  const items = getStoreValue(store);
  const idToFind = typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id;
  return items.find(item => {
    const itemId = item[idField];
    const normalizedItemId = typeof itemId === 'string' && !isNaN(Number(itemId))
      ? Number(itemId)
      : itemId;
    return normalizedItemId === idToFind;
  }) || null;
}

/**
 * Find the next item in a sequence
 * @param items - Array of items
 * @param currentId - Current item ID
 * @param idField - Name of the ID field (default: 'id')
 * @param sortField - Field to sort by before finding next item (optional)
 * @returns Next item or null
 */
export function getNextItem<T extends Record<string, any>>(
  items: T[],
  currentId: number | string,
  idField: string = 'id',
  sortField?: string
): T | null {
  if (!items.length) return null;

  // Sort the items if a sort field is provided
  const sortedItems = sortField
    ? [...items].sort((a, b) => a[sortField] - b[sortField])
    : items;

  // Find the current item's index
  const currentIdToFind = typeof currentId === 'string' && !isNaN(Number(currentId))
    ? Number(currentId)
    : currentId;

  const currentIndex = sortedItems.findIndex(item => {
    const itemId = item[idField];
    const normalizedItemId = typeof itemId === 'string' && !isNaN(Number(itemId))
      ? Number(itemId)
      : itemId;
    return normalizedItemId === currentIdToFind;
  });

  // Return the next item if it exists
  if (currentIndex !== -1 && currentIndex < sortedItems.length - 1) {
    return sortedItems[currentIndex + 1];
  }

  return null;
}

/**
 * Find the previous item in a sequence
 * @param items - Array of items
 * @param currentId - Current item ID
 * @param idField - Name of the ID field (default: 'id')
 * @param sortField - Field to sort by before finding previous item (optional)
 * @returns Previous item or null
 */
export function getPreviousItem<T extends Record<string, any>>(
  items: T[],
  currentId: number | string,
  idField: string = 'id',
  sortField?: string
): T | null {
  if (!items.length) return null;

  // Sort the items if a sort field is provided
  const sortedItems = sortField
    ? [...items].sort((a, b) => a[sortField] - b[sortField])
    : items;

  // Find the current item's index
  const currentIdToFind = typeof currentId === 'string' && !isNaN(Number(currentId))
    ? Number(currentId)
    : currentId;

  const currentIndex = sortedItems.findIndex(item => {
    const itemId = item[idField];
    const normalizedItemId = typeof itemId === 'string' && !isNaN(Number(itemId))
      ? Number(itemId)
      : itemId;
    return normalizedItemId === currentIdToFind;
  });

  // Return the previous item if it exists
  if (currentIndex > 0) {
    return sortedItems[currentIndex - 1];
  }

  return null;
}

/**
 * Safely update a store with new data, handling validation and conversion
 * @param setter - Function to set store value
 * @param data - Data to update the store with
 * @param converter - Optional function to convert data items
 * @returns True if update was successful, false otherwise
 */
export function safeStoreUpdate<T>(
  setter: (value: T[]) => void,
  data: T[] | null | undefined,
  converter?: (item: any) => T
): boolean {
  try {
    // Validate data
    if (!data || !Array.isArray(data)) {
      setter([]);
      return false;
    }

    // Convert data if converter is provided
    const processedData = converter
      ? data.map(item => converter(item))
      : data;

    // Update the store
    setter(processedData);
    return true;
  } catch (error) {
    logger.error('Error updating store:', error);
    setter([]);
    return false;
  }
}
