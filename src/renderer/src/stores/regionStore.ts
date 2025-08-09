/**
 * Region Store
 * Manages the state of regions and the current region
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import { playbackState } from './playbackStore';
import logger from '../lib/utils/logger';
import { getStoreValue, findItemById, getNextItem, getPreviousItem, safeStoreUpdate } from '../lib/utils/storeUtils';

/**
 * Interface for region
 */
export interface Region {
  id: number;
  name: string;
  start: number;
  end: number;
  color?: string;
}

/**
 * Store for the list of regions
 */
export const regions: Writable<Region[]> = writable([]);

/**
 * Derived store for the current region
 * Combines regions and playbackState to determine the current region
 */
export const currentRegion: Readable<Region | null> = derived(
  [regions, playbackState],
  ([$regions, $playbackState]) => {
    if (!$playbackState.currentRegionId) return null;
    return $regions.find(region => region.id === $playbackState.currentRegionId) || null;
  }
);

/**
 * Updates the regions store with new data
 * @param data - Array of region objects
 * @returns True if update was successful
 */
export function updateRegions(data: Region[] | null | undefined): boolean {
  return safeStoreUpdate<Region>(
    regions.set,
    data,
    region => ({
      ...region,
      id: typeof region.id === 'string' ? parseInt(region.id, 10) : region.id
    })
  );
}

/**
 * Finds a region by its ID
 * @param regionId - The ID of the region to find
 * @returns The region object or null if not found
 */
export function findRegionById(regionId: number): Region | null {
  return findItemById<Region>(regions, regionId);
}

/**
 * Gets the next region based on the current region
 * @returns The next region or null if there is no next region
 */
export function getNextRegion(): Region | null {
  const currentRegionValue = getStoreValue(currentRegion);
  const regionsValue = getStoreValue(regions);

  if (!currentRegionValue) return null;

  return getNextItem<Region>(regionsValue, currentRegionValue.id);
}

/**
 * Gets the previous region based on the current region
 * @returns The previous region or null if there is no previous region
 */
export function getPreviousRegion(): Region | null {
  const currentRegionValue = getStoreValue(currentRegion);
  const regionsValue = getStoreValue(regions);

  if (!currentRegionValue) return null;

  return getPreviousItem<Region>(regionsValue, currentRegionValue.id);
}

/**
 * Derived store for the next region
 * For now, this is a simplified version without setlist support
 */
export const nextRegion: Readable<Region | null> = derived(
  [currentRegion, regions],
  ([$currentRegion, $regions]) => {
    if (!$currentRegion) return null;

    // Get the next region from all regions
    const currentIndex = $regions.findIndex(r => r.id === $currentRegion.id);
    return currentIndex !== -1 && currentIndex < $regions.length - 1 ?
      $regions[currentIndex + 1] : null;
  }
);

/**
 * Derived store for the next region
 * For now, this is a simplified version without setlist support
 */
export const previousRegion: Readable<Region | null> = derived(
  [currentRegion, regions],
  ([$currentRegion, $regions]) => {
    if (!$currentRegion) return null;

    // Get the next region from all regions
    const currentIndex = $regions.findIndex(r => r.id === $currentRegion.id);
    return currentIndex !== -1 && currentIndex > 0 ?
      $regions[currentIndex - 1] : null;
  }
);
