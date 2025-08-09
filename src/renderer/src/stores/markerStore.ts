/**
 * Marker Store
 * Manages marker data from Reaper
 * Uses storeFactory for common store operations and markerUtils for marker processing
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import logger from '../lib/utils/logger';
import { type Region } from './regionStore';
import { createStoreFactory, type IdentifiableItem } from '../lib/utils/storeFactory';
import {
  isCommandOnlyMarker,
  getCustomLengthForRegion,
  has1008MarkerInRegion,
  getBpmForRegion,
  getEffectiveRegionLength
} from '../lib/utils/markerUtils';

/**
 * Interface for marker
 */
export interface Marker extends IdentifiableItem {
  id: number;
  name: string;
  position: number;
  color?: string;
}

// Mock markers for when no real markers are available
export const mockMarkers: Marker[] = [
  { id: 1, name: 'Intro', position: 0, color: '#FFC107' },
  { id: 2, name: 'Verse', position: 30, color: '#FF9800' },
  { id: 3, name: 'Chorus', position: 60, color: '#F44336' },
  { id: 4, name: 'Bridge', position: 120, color: '#9C27B0' },
  { id: 5, name: 'Outro', position: 150, color: '#2196F3' }
];

// Create the marker store factory
const markerStoreFactory = createStoreFactory<Marker>({
  name: 'Marker',
  initialValues: [],
  // No currentIdStore needed as we don't track a "current marker"
  currentIdStore: writable(null),
  converter: marker => ({
    ...marker,
    id: typeof marker.id === 'string' ? parseInt(marker.id, 10) : marker.id
  })
});

// Export the main store
export const markers = markerStoreFactory.store;

// Export helper functions
export const updateMarkers = markerStoreFactory.updateItems;
export const findMarkerById = markerStoreFactory.findItemById;

/**
 * Refresh markers from Reaper
 * @returns Promise that resolves when markers are refreshed
 */
export function refreshMarkers(): Promise<void> {
  if (window.electronAPI) {
    logger.log('Refreshing markers via IPC');
    return window.electronAPI.refreshMarkers();
  } else {
    logger.error('Electron API not available');
    return Promise.resolve();
  }
}

/**
 * Get all markers or mock markers if none are available
 * This is the primary store that should be used by components
 */
export const displayMarkers: Readable<Marker[]> = derived(markers, $markers => {
  return $markers.length > 0 ? [...$markers] : [...mockMarkers];
});

/**
 * Get all markers sorted by position
 * Filters out markers that only contain commands
 * Uses mock markers if no real markers are available
 */
export const sortedMarkers: Readable<Marker[]> = derived(displayMarkers, $displayMarkers => {
  return [...$displayMarkers]
    .filter(marker => !isCommandOnlyMarker(marker.name))
    .sort((a, b) => a.position - b.position);
});

// Re-export marker utility functions for backwards compatibility
export {
  getCustomLengthForRegion,
  has1008MarkerInRegion,
  getBpmForRegion,
  getEffectiveRegionLength
};
