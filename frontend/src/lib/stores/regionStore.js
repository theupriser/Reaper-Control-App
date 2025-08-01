/**
 * Region Store
 * Manages the state of regions and the current region
 */

import { writable, derived } from 'svelte/store';
import { playbackState } from './playbackStore';

/**
 * Store for the list of regions
 */
export const regions = writable([]);

/**
 * Derived store for the current region
 * Combines regions and playbackState to determine the current region
 */
export const currentRegion = derived(
  [regions, playbackState],
  ([$regions, $playbackState]) => {
    if (!$playbackState.currentRegionId) return null;
    return $regions.find(region => region.id === $playbackState.currentRegionId);
  }
);

/**
 * Updates the regions store with new data
 * @param {Array} data - Array of region objects
 * @returns {boolean} - True if update was successful
 */
export function updateRegions(data) {
  try {
    // Validate the data
    if (!data) {
      console.warn('No regions data received');
      regions.set([]);
      return false;
    }
    
    // Ensure data is an array
    if (!Array.isArray(data)) {
      console.error('Received regions data is not an array:', data);
      regions.set([]);
      return false;
    }
    
    // Log the first region for debugging
    if (data.length > 0) {
      console.log('First region:', data[0]);
      
      // Validate region structure
      const firstRegion = data[0];
      if (!firstRegion.id || !firstRegion.name || firstRegion.start === undefined || firstRegion.end === undefined) {
        console.warn('Region data may be malformed:', firstRegion);
      }
    } else {
      console.warn('No regions received (empty array)');
    }
    
    // Update the regions store
    regions.set(data);
    return true;
  } catch (error) {
    console.error('Error processing regions data:', error);
    regions.set([]);
    return false;
  }
}

/**
 * Finds a region by its ID
 * @param {number} regionId - The ID of the region to find
 * @returns {Object|null} - The region object or null if not found
 */
export function findRegionById(regionId) {
  let result = null;
  
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
 * @returns {Object|null} - The next region or null if there is no next region
 */
export function getNextRegion() {
  let result = null;
  let currentRegionValue = null;
  let regionsValue = [];
  
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
 * @returns {Object|null} - The previous region or null if there is no previous region
 */
export function getPreviousRegion() {
  let result = null;
  let currentRegionValue = null;
  let regionsValue = [];
  
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