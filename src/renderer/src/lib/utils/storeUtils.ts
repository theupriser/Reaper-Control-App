/**
 * Store Utilities
 * Helper functions for working with Svelte stores
 */

import type { Readable, Writable } from 'svelte/store';
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
 * Normalize an ID that could be either string or number
 * @param id - ID to normalize
 * @returns Normalized ID (converted to number if it's a numeric string)
 */
export function normalizeId(id: string | number): string | number {
  return typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id;
}

/**
 * Find an item by ID with proper type normalization
 * @param items - Array of items to search in
 * @param id - ID to find
 * @param idField - Name of the ID field (default: 'id')
 * @returns Found item or null
 */
export function findItemByIdInArray<T extends Record<string, any>>(
  items: T[],
  id: number | string,
  idField: string = 'id'
): T | null {
  const idToFind = normalizeId(id);

  return items.find(item => {
    const itemId = normalizeId(item[idField]);
    return itemId === idToFind;
  }) || null;
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
  return findItemByIdInArray(items, id, idField);
}

/**
 * Sort items by a specified field if provided
 * @param items - Array of items to sort
 * @param sortField - Field to sort by (optional)
 * @returns Sorted array (new array if sorted, original array if not)
 */
export function sortItemsByField<T extends Record<string, any>>(
  items: T[],
  sortField?: string
): T[] {
  if (!sortField) return items;
  return [...items].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    return typeof aValue === 'number' && typeof bValue === 'number'
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue));
  });
}

/**
 * Find the index of an item by ID in an array
 * @param items - Array of items
 * @param id - ID to find
 * @param idField - Name of the ID field (default: 'id')
 * @returns Index of the item or -1 if not found
 */
export function findItemIndexById<T extends Record<string, any>>(
  items: T[],
  id: number | string,
  idField: string = 'id'
): number {
  const idToFind = normalizeId(id);

  return items.findIndex(item => {
    const itemId = normalizeId(item[idField]);
    return itemId === idToFind;
  });
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
  const sortedItems = sortItemsByField(items, sortField);

  // Find the current item's index
  const currentIndex = findItemIndexById(sortedItems, currentId, idField);

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
  const sortedItems = sortItemsByField(items, sortField);

  // Find the current item's index
  const currentIndex = findItemIndexById(sortedItems, currentId, idField);

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
 * @param fallbackValue - Optional fallback value if data is invalid (default: empty array)
 * @returns True if update was successful, false otherwise
 */
export function safeStoreUpdate<T>(
  setter: (value: T[]) => void,
  data: T[] | null | undefined,
  converter?: (item: any) => T,
  fallbackValue: T[] = []
): boolean {
  try {
    // Validate data
    if (!data || !Array.isArray(data)) {
      setter(fallbackValue);
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
    setter(fallbackValue);
    return false;
  }
}

/**
 * Safely update a single value store, handling errors
 * @param store - Writable store to update
 * @param value - New value
 * @param fallbackValue - Optional fallback value if an error occurs
 * @returns True if update was successful, false otherwise
 */
export function safeStoreSet<T>(
  store: Writable<T>,
  value: T,
  fallbackValue?: T
): boolean {
  try {
    store.set(value);
    return true;
  } catch (error) {
    logger.error('Error setting store value:', error);
    if (fallbackValue !== undefined) {
      try {
        store.set(fallbackValue);
      } catch (fallbackError) {
        logger.error('Error setting fallback value:', fallbackError);
      }
    }
    return false;
  }
}
