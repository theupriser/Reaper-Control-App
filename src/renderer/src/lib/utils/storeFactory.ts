/**
 * Store Factory
 * Creates consistent store interfaces for different data types
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import { getStoreValue, findItemById, getNextItem, getPreviousItem, safeStoreUpdate } from './storeUtils';
import logger from './logger';

/**
 * Generic item interface with id
 */
export interface IdentifiableItem {
  id: number | string;
  [key: string]: any;
}

/**
 * Store factory result with common store operations
 */
export interface StoreFactory<T extends IdentifiableItem> {
  // Base store
  store: Writable<T[]>;

  // Derived stores
  currentItem: Readable<T | null>;
  nextItem: Readable<T | null>;
  previousItem: Readable<T | null>;

  // Helper functions
  updateItems: (data: T[] | null | undefined, converter?: (item: any) => T) => boolean;
  findItemById: (id: number | string) => T | null;
  getNextItem: () => T | null;
  getPreviousItem: () => T | null;
}

/**
 * Factory options
 */
export interface StoreFactoryOptions<T extends IdentifiableItem> {
  // Optional store name for logging
  name?: string;

  // Optional converter function for updating items
  converter?: (item: any) => T;

  // Optional initial values
  initialValues?: T[];

  // Required store for the current item ID (or null if none selected)
  currentIdStore: Readable<number | string | null>;
}

/**
 * Create a store factory with common operations for a specific item type
 * @param options - Configuration options for the store factory
 * @returns A store factory object with stores and operations
 */
export function createStoreFactory<T extends IdentifiableItem>(
  options: StoreFactoryOptions<T>
): StoreFactory<T> {
  const storeName = options.name || 'Generic';

  // Create the main store
  const store: Writable<T[]> = writable(options.initialValues || []);

  // Derived store for the current item
  const currentItem: Readable<T | null> = derived(
    [store, options.currentIdStore],
    ([$store, $currentId]) => {
      if (!$currentId) return null;
      return $store.find(item => item.id === $currentId) || null;
    }
  );

  // Helper function to update items
  function updateItems(data: T[] | null | undefined, converter?: (item: any) => T): boolean {
    return safeStoreUpdate<T>(
      store.set,
      data,
      converter || options.converter,
      []
    );
  }

  // Helper function to find an item by ID
  function findItemById(id: number | string): T | null {
    return findItemById<T>(store, id);
  }

  // Helper function to get the next item
  function getNextItemFn(): T | null {
    const currentItemValue = getStoreValue(currentItem);
    const storeValue = getStoreValue(store);

    if (!currentItemValue) return null;

    return getNextItem<T>(storeValue, currentItemValue.id);
  }

  // Helper function to get the previous item
  function getPreviousItemFn(): T | null {
    const currentItemValue = getStoreValue(currentItem);
    const storeValue = getStoreValue(store);

    if (!currentItemValue) return null;

    return getPreviousItem<T>(storeValue, currentItemValue.id);
  }

  // Derived store for the next item
  const nextItem: Readable<T | null> = derived(
    [currentItem, store],
    ([$currentItem, $store]) => {
      if (!$currentItem) return null;

      // Get the next item from all items
      const currentIndex = $store.findIndex(item => item.id === $currentItem.id);
      return currentIndex !== -1 && currentIndex < $store.length - 1 ?
        $store[currentIndex + 1] : null;
    }
  );

  // Derived store for the previous item
  const previousItem: Readable<T | null> = derived(
    [currentItem, store],
    ([$currentItem, $store]) => {
      if (!$currentItem) return null;

      // Get the previous item from all items
      const currentIndex = $store.findIndex(item => item.id === $currentItem.id);
      return currentIndex !== -1 && currentIndex > 0 ?
        $store[currentIndex - 1] : null;
    }
  );

  return {
    store,
    currentItem,
    nextItem,
    previousItem,
    updateItems,
    findItemById,
    getNextItem: getNextItemFn,
    getPreviousItem: getPreviousItemFn
  };
}
