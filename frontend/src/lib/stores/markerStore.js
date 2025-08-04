/**
 * Marker Store
 * Manages marker data from Reaper
 */

import { writable, derived } from 'svelte/store';
import socketService from '../services/socketService';

// Create a writable store for markers
export const markers = writable([]);

// Initialize the store with empty array
markers.set([]);

// Set up a handler for marker updates
// This will be called by the socket handler in socketService.js
export function updateMarkers(markerData) {
  markers.set(markerData);
}

// Register the marker update handler with the socket service
// This will be done when the app initializes

/**
 * Refresh markers from Reaper
 * @returns {Promise<void>}
 */
export function refreshMarkers() {
  if (socketService && typeof socketService.emit === 'function') {
    return socketService.emit('refreshMarkers');
  } else {
    console.error('Socket service not available or emit method not found');
    return Promise.resolve();
  }
}

/**
 * Find a marker by ID
 * @param {number} id - Marker ID
 * @returns {Object|null} Marker object or null if not found
 */
export function findMarkerById(id) {
  let result = null;
  markers.subscribe(markerList => {
    result = markerList.find(marker => marker.id === id);
  })();
  return result;
}

/**
 * Check if a marker only contains commands
 * @param {string} name - Marker name
 * @returns {boolean} True if marker only contains commands
 */
function isCommandOnlyMarker(name) {
  const trimmedName = name.trim();
  // Check if the marker name only contains numeric commands like !1008 or !1007
  if (/^![\d]+$/.test(trimmedName)) {
    return true;
  }
  // Check if the marker only contains a !length command
  if (/^!length:\d+(\.\d+)?$/.test(trimmedName)) {
    return true;
  }
  // Check if the marker only contains both !1008 and !length commands
  if (/^(!1008\s+!length:\d+(\.\d+)?|!length:\d+(\.\d+)?\s+!1008)$/.test(trimmedName)) {
    return true;
  }
  return false;
}

/**
 * Extract length from !length marker
 * @param {string} name - Marker name
 * @returns {number|null} Length in seconds or null if not a length marker
 */
function extractLengthFromMarker(name) {
  const lengthMatch = name.match(/!length:(\d+(\.\d+)?)/);
  return lengthMatch ? parseFloat(lengthMatch[1]) : null;
}

/**
 * Get all markers sorted by position
 * Filters out markers that only contain commands
 */
export const sortedMarkers = derived(markers, $markers => {
  return [...$markers]
    .filter(marker => !isCommandOnlyMarker(marker.name))
    .sort((a, b) => a.position - b.position);
});

/**
 * Get the custom length for a region if a !length marker is present
 * @param {Array} markers - List of markers
 * @param {Object} region - Region object
 * @returns {number|null} - Custom length in seconds or null if no !length marker
 */
export function getCustomLengthForRegion(markers, region) {
  if (!region || !markers || markers.length === 0) return null;
  
  // Find markers that are within the region and have a !length tag
  const lengthMarkers = markers.filter(marker => 
    marker.position >= region.start && 
    marker.position <= region.end
  );
  
  // Check each marker for !length tag
  for (const marker of lengthMarkers) {
    const length = extractLengthFromMarker(marker.name);
    if (length !== null) {
      console.log(`Found custom length marker: "${marker.name}" at position ${marker.position}, setting region length to ${length} seconds`);
      return length;
    }
  }
  
  return null;
}

/**
 * Check if a marker has the !1008 command
 * @param {string} name - Marker name
 * @returns {boolean} True if marker has !1008 command
 */
function has1008Command(name) {
  return name.includes('!1008');
}

/**
 * Check if a region has a !1008 marker
 * @param {Array} markers - List of markers
 * @param {Object} region - Region object
 * @returns {boolean} - True if region has a !1008 marker
 */
export function has1008MarkerInRegion(markers, region) {
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
 * Get the effective region length, considering !length markers
 * @param {Object} region - The current region
 * @param {Array} markerList - List of all markers
 * @returns {number} - The effective region length in seconds
 */
export function getEffectiveRegionLength(region, markerList) {
  if (!region) return 0;
  
  const customLength = getCustomLengthForRegion(markerList, region);
  return customLength !== null ? customLength : (region.end - region.start);
}