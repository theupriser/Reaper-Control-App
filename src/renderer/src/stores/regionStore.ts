/**
 * Region Store
 * Manages the state of regions and the current region
 * Uses storeFactory for common store operations
 */

import { derived, type Readable } from 'svelte/store';
import { playbackState } from './playbackStore';
import { createStoreFactory, type IdentifiableItem } from '../lib/utils/storeFactory';

/**
 * Interface for region
 */
export interface Region extends IdentifiableItem {
  id: number;
  name: string;
  start: number;
  end: number;
  color?: string;
}

/**
 * Create a derived store for the current region ID from playbackState
 */
const currentRegionId: Readable<number | null> = derived(
  playbackState,
  $playbackState => $playbackState.currentRegionId
);

/**
 * Create region store factory with all common operations
 */
const regionStoreFactory = createStoreFactory<Region>({
  name: 'Region',
  currentIdStore: currentRegionId,
  converter: region => ({
    ...region,
    id: typeof region.id === 'string' ? parseInt(region.id, 10) : region.id
  })
});

// Export the main store and derived stores
export const regions = regionStoreFactory.store;
export const currentRegion = regionStoreFactory.currentItem;
export const nextRegion = regionStoreFactory.nextItem;
export const previousRegion = regionStoreFactory.previousItem;

// Export helper functions
export const updateRegions = regionStoreFactory.updateItems;
export const findRegionById = regionStoreFactory.findItemById;
export const getNextRegion = regionStoreFactory.getNextItem;
export const getPreviousRegion = regionStoreFactory.getPreviousItem;
