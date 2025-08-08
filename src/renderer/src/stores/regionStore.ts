/**
 * Region Store
 * Manages the state of regions and the current region
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import { playbackState, type PlaybackState } from './playbackStore';
import logger from '../lib/utils/logger';

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
  try {
    // Validate the data
    if (!data) {
      logger.warn('No regions data received');
      regions.set([]);
      return false;
    }

    // Ensure data is an array
    if (!Array.isArray(data)) {
      logger.error('Received regions data is not an array:', data);
      regions.set([]);
      return false;
    }

    // Convert region IDs from strings to numbers if needed
    const convertedRegions = data.map(region => ({
      ...region,
      id: typeof region.id === 'string' ? parseInt(region.id, 10) : region.id
    }));

    // Log the first region for debugging
    if (!convertedRegions.length) {
      logger.warn('No regions received (empty array)');
    }

    // Sort regions by position (start time) before updating the store
    const sortedRegions = [...convertedRegions].sort((a, b) => a.start - b.start);

    // Update the regions store
    regions.set(sortedRegions);
    return true;
  } catch (error) {
    logger.error('Error processing regions data:', error);
    regions.set([]);
    return false;
  }
}

/**
 * Finds a region by its ID
 * @param regionId - The ID of the region to find
 * @returns The region object or null if not found
 */
export function findRegionById(regionId: number): Region | null {
  let result: Region | null = null;

  // Get the current regions
  const unsubscribe = regions.subscribe(currentRegions => {
    result = currentRegions.find(region => region.id === regionId) || null;
  });

  // Clean up subscription
  unsubscribe();

  return result;
}

/**
 * Gets the next region based on the current region
 * @returns The next region or null if there is no next region
 */
export function getNextRegion(): Region | null {
  let result: Region | null = null;
  let currentRegionValue: Region | null = null;
  let regionsValue: Region[] = [];

  // Get current region and regions
  const unsubscribeCurrentRegion = currentRegion.subscribe(value => {
    currentRegionValue = value;
  });

  const unsubscribeRegions = regions.subscribe(value => {
    regionsValue = value;
  });

  // Clean up subscriptions
  unsubscribeCurrentRegion();
  unsubscribeRegions();

  if (currentRegionValue && regionsValue.length > 0) {
    const currentIndex = regionsValue.findIndex(region => region.id === currentRegionValue.id);
    if (currentIndex !== -1 && currentIndex < regionsValue.length - 1) {
      result = regionsValue[currentIndex + 1];
    }
  }

  return result;
}

/**
 * Gets the previous region based on the current region
 * @returns The previous region or null if there is no previous region
 */
export function getPreviousRegion(): Region | null {
  let result: Region | null = null;
  let currentRegionValue: Region | null = null;
  let regionsValue: Region[] = [];

  // Get current region and regions
  const unsubscribeCurrentRegion = currentRegion.subscribe(value => {
    currentRegionValue = value;
  });

  const unsubscribeRegions = regions.subscribe(value => {
    regionsValue = value;
  });

  // Clean up subscriptions
  unsubscribeCurrentRegion();
  unsubscribeRegions();

  if (currentRegionValue && regionsValue.length > 0) {
    const currentIndex = regionsValue.findIndex(region => region.id === currentRegionValue.id);
    if (currentIndex > 0) {
      result = regionsValue[currentIndex - 1];
    }
  }

  return result;
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
