/**
 * Marker Utilities
 * Helper functions for processing marker data
 */

import { type Region } from '../../stores/regionStore';
import { type Marker } from '../../stores/markerStore';
import logger from './logger';

/**
 * Check if a marker only contains commands
 * @param name - Marker name
 * @returns True if marker only contains commands
 */
export function isCommandOnlyMarker(name: string): boolean {
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
export function extractLengthFromMarker(name: string): number | null {
  const lengthMatch = name.match(/!length:(\d+(\.\d+)?)/);
  return lengthMatch ? parseFloat(lengthMatch[1]) : null;
}

/**
 * Extract BPM from !bpm marker
 * @param name - Marker name
 * @returns BPM value or null if not a BPM marker
 */
export function extractBpmFromMarker(name: string): number | null {
  const bpmMatch = name.match(/!bpm:(\d+(\.\d+)?)/);
  return bpmMatch ? parseFloat(bpmMatch[1]) : null;
}

/**
 * Check if a marker has the !1008 command
 * @param name - Marker name
 * @returns True if marker has !1008 command
 */
export function has1008Command(name: string): boolean {
  return name.includes('!1008');
}

/**
 * Check if a region has a !1008 marker
 * @param markers - List of markers
 * @param region - Region object
 * @returns True if region has a !1008 marker
 */
export function has1008MarkerInRegion(markers: Marker[] | any, region: Region): boolean {
  // Check if region exists
  if (!region) return false;

  // Ensure markers is an array
  if (!markers || !Array.isArray(markers) || markers.length === 0) {
    return false;
  }

  // Find markers that are within the region
  const regionMarkers = getMarkersInRegion(markers, region);

  // Check each marker for !1008 command
  for (const marker of regionMarkers) {
    if (has1008Command(marker.name)) {
      return true;
    }
  }

  return false;
}

/**
 * Get markers that are within a region
 * @param markers - List of markers
 * @param region - Region object
 * @returns List of markers within the region
 */
export function getMarkersInRegion(markers: Marker[] | any, region: Region): Marker[] {
  if (!region || !markers || !Array.isArray(markers)) {
    return [];
  }

  return markers.filter((marker: Marker) =>
    marker.position >= region.start &&
    marker.position <= region.end
  );
}

/**
 * Get the BPM for a region if a !bpm marker is present
 * @param markers - List of markers
 * @param region - Region object
 * @returns BPM value or null if no !bpm marker
 */
export function getBpmForRegion(markers: Marker[] | any, region: Region): number | null {
  // Check if region exists
  if (!region) return null;

  // Ensure markers is an array
  if (!markers || !Array.isArray(markers) || markers.length === 0) {
    logger.warn('getBpmForRegion: markers is not a valid array', {
      isArray: Array.isArray(markers),
      value: markers
    });
    return null;
  }

  // Find markers that are within the region
  const regionMarkers = getMarkersInRegion(markers, region);

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
 * Get the custom length for a region if a !length marker is present
 * @param region - Region object
 * @param markerList - List of markers
 * @returns Custom length in seconds or null if no !length marker
 */
export function getCustomLengthForRegion(region: Region, markerList: Marker[] | any): number | null {
  // Check if region exists
  if (!region) return null;

  // Ensure markerList is an array
  if (!markerList || !Array.isArray(markerList) || markerList.length === 0) {
    return null;
  }

  // Find markers that are within the region
  const lengthMarkers = getMarkersInRegion(markerList, region);

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
 * Get the effective region length, considering !length markers
 * @param region - The current region
 * @param markerList - List of all markers
 * @returns The effective region length in seconds
 */
export function getEffectiveRegionLength(region: Region, markerList: Marker[] | any): number {
  // Check if region exists
  if (!region) return 0;

  // Ensure markerList is an array
  if (!markerList || !Array.isArray(markerList)) {
    logger.warn('getEffectiveRegionLength: markerList is not a valid array', {
      isArray: Array.isArray(markerList),
      value: markerList
    });
    return region.end - region.start; // Default to region length if no valid markerList
  }

  const customLength = getCustomLengthForRegion(region, markerList);
  return customLength !== null ? customLength : (region.end - region.start);
}
