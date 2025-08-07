/**
 * Marker Store
 * Manages marker data from Reaper
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import logger from '../lib/utils/logger';
import { type Region } from './regionStore';

/**
 * Interface for marker
 */
export interface Marker {
  id: number;
  name: string;
  position: number;
  color?: string;
}

// Create a writable store for markers
export const markers: Writable<Marker[]> = writable([]);

// Initialize the store with empty array
markers.set([]);

/**
 * Update markers with new data
 * @param markerData - Array of marker objects
 */
export function updateMarkers(markerData: Marker[]): void {
  markers.set(markerData);
}

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
 * Find a marker by ID
 * @param id - Marker ID
 * @returns Marker object or null if not found
 */
export function findMarkerById(id: number): Marker | null {
  let result: Marker | null = null;
  const unsubscribe = markers.subscribe(markerList => {
    result = markerList.find(marker => marker.id === id) || null;
  });
  unsubscribe();
  return result;
}

/**
 * Check if a marker only contains commands
 * @param name - Marker name
 * @returns True if marker only contains commands
 */
function isCommandOnlyMarker(name: string): boolean {
  const trimmedName = name.trim();
  // Check if the marker name only contains numeric commands like !1008 or !1007
  if (/^![\d]+$/.test(trimmedName)) {
    return true;
  }
  // Check if the marker only contains a !length command
  if (/^!length:\d+(\.\d+)?$/.test(trimmedName)) {
    return true;
  }
  // Check if the marker only contains a !bpm command
  if (/^!bpm:\d+(\.\d+)?$/.test(trimmedName)) {
    return true;
  }
  // Check if the marker only contains both !1008 and !length commands
  if (/^(!1008\s+!length:\d+(\.\d+)?|!length:\d+(\.\d+)?\s+!1008)$/.test(trimmedName)) {
    return true;
  }
  // Check if the marker only contains both !1008 and !bpm commands
  if (/^(!1008\s+!bpm:\d+(\.\d+)?|!bpm:\d+(\.\d+)?\s+!1008)$/.test(trimmedName)) {
    return true;
  }
  // Check if the marker only contains both !length and !bpm commands
  if (/^(!length:\d+(\.\d+)?\s+!bpm:\d+(\.\d+)?|!bpm:\d+(\.\d+)?\s+!length:\d+(\.\d+)?)$/.test(trimmedName)) {
    return true;
  }
  // Check if the marker only contains !1008, !length, and !bpm commands in any order
  if (/^(!1008\s+!length:\d+(\.\d+)?\s+!bpm:\d+(\.\d+)?|!1008\s+!bpm:\d+(\.\d+)?\s+!length:\d+(\.\d+)?|!length:\d+(\.\d+)?\s+!1008\s+!bpm:\d+(\.\d+)?|!length:\d+(\.\d+)?\s+!bpm:\d+(\.\d+)?\s+!1008|!bpm:\d+(\.\d+)?\s+!1008\s+!length:\d+(\.\d+)?|!bpm:\d+(\.\d+)?\s+!length:\d+(\.\d+)?\s+!1008)$/.test(trimmedName)) {
    return true;
  }
  return false;
}

/**
 * Extract length from !length marker
 * @param name - Marker name
 * @returns Length in seconds or null if not a length marker
 */
function extractLengthFromMarker(name: string): number | null {
  const lengthMatch = name.match(/!length:(\d+(\.\d+)?)/);
  return lengthMatch ? parseFloat(lengthMatch[1]) : null;
}

/**
 * Extract BPM from !bpm marker
 * @param name - Marker name
 * @returns BPM value or null if not a BPM marker
 */
function extractBpmFromMarker(name: string): number | null {
  const bpmMatch = name.match(/!bpm:(\d+(\.\d+)?)/);
  return bpmMatch ? parseFloat(bpmMatch[1]) : null;
}

/**
 * Get all markers sorted by position
 * Filters out markers that only contain commands
 */
export const sortedMarkers: Readable<Marker[]> = derived(markers, $markers => {
  return [...$markers]
    .filter(marker => !isCommandOnlyMarker(marker.name))
    .sort((a, b) => a.position - b.position);
});

/**
 * Get the custom length for a region if a !length marker is present
 * @param region - Region object
 * @param markerList - List of markers
 * @returns Custom length in seconds or null if no !length marker
 */
export function getCustomLengthForRegion(region: Region, markerList: Marker[]): number | null {
  if (!region || !markerList || markerList.length === 0) return null;

  // Find markers that are within the region and have a !length tag
  const lengthMarkers = markerList.filter(marker =>
    marker.position >= region.start &&
    marker.position <= region.end
  );

  // Check each marker for !length tag
  for (const marker of lengthMarkers) {
    const length = extractLengthFromMarker(marker.name);
    if (length !== null) {
      return length;
    }
  }

  return null;
}

/**
 * Check if a marker has the !1008 command
 * @param name - Marker name
 * @returns True if marker has !1008 command
 */
function has1008Command(name: string): boolean {
  return name.includes('!1008');
}

/**
 * Check if a region has a !1008 marker
 * @param markers - List of markers
 * @param region - Region object
 * @returns True if region has a !1008 marker
 */
export function has1008MarkerInRegion(markers: Marker[], region: Region): boolean {
  if (!region || !markers || markers.length === 0) return false;

  // Find markers that are within the region
  const regionMarkers = markers.filter(marker =>
    marker.position >= region.start &&
    marker.position <= region.end
  );

  // Check each marker for !1008 command
  for (const marker of regionMarkers) {
    if (has1008Command(marker.name)) {
      return true;
    }
  }

  return false;
}

/**
 * Get the BPM for a region if a !bpm marker is present
 * @param markers - List of markers
 * @param region - Region object
 * @returns BPM value or null if no !bpm marker
 */
export function getBpmForRegion(markers: Marker[], region: Region): number | null {
  if (!region || !markers || markers.length === 0) return null;

  // Find markers that are within the region and have a !bpm tag
  const regionMarkers = markers.filter(marker =>
    marker.position >= region.start &&
    marker.position <= region.end
  );

  // Check each marker for !bpm tag
  for (const marker of regionMarkers) {
    const bpm = extractBpmFromMarker(marker.name);
    if (bpm !== null) {
      return bpm;
    }
  }

  return null;
}

/**
 * Get the effective region length, considering !length markers
 * @param region - The current region
 * @param markerList - List of all markers
 * @returns The effective region length in seconds
 */
export function getEffectiveRegionLength(region: Region, markerList: Marker[]): number {
  if (!region) return 0;

  const customLength = getCustomLengthForRegion(region, markerList);
  return customLength !== null ? customLength : (region.end - region.start);
}
