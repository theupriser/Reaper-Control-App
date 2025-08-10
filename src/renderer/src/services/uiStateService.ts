/**
 * UI State Service
 *
 * This service manages shared UI state for transport components like loading indicators
 * and popovers. It centralizes UI logic that was previously duplicated across components.
 */

import { writable, type Writable } from 'svelte/store';
import { sortedMarkers } from '../stores/markerStore';
import logger from '../lib/utils/logger';

// Loading state
export const isLoading: Writable<boolean> = writable(true);

// Progress bar click handling
export const popoverVisible: Writable<boolean> = writable(false);
export const popoverPosition: Writable<{x: number, y: number}> = writable({ x: 0, y: 0 });
export const popoverTime: Writable<number> = writable(0);

/**
 * Initializes loading state by watching for data and setting a timeout
 * @returns Cleanup function to unsubscribe from stores and clear timeout
 */
export function initializeLoadingState(): { unsubscribe: () => void } {
  // Set loading state to false once we have data
  const unsubscribeMarkers = sortedMarkers.subscribe(value => {
    if (value && value.length > 0) {
      isLoading.set(false);
    }
  });

  // Add a timeout to clear loading state after 5 seconds
  // This ensures the UI doesn't stay in loading state indefinitely
  const loadingTimeout = setTimeout(() => {
    isLoading.set(false);
    logger.log('Loading timeout reached, clearing loading state');
  }, 5000);

  return {
    unsubscribe: () => {
      unsubscribeMarkers();
      clearTimeout(loadingTimeout);
    }
  };
}

/**
 * Shows a time popover at the specified position
 * @param position - The x and y coordinates
 * @param time - The time to display in the popover
 */
export function showPopover(position: {x: number, y: number}, time: number): void {
  popoverPosition.set(position);
  popoverTime.set(time);
  popoverVisible.set(true);

  // Hide the popover after 2 seconds
  setTimeout(() => {
    popoverVisible.set(false);
  }, 2000);
}

/**
 * Calculates popover position based on click position
 * @param clickX - The X coordinate of the click
 * @param containerWidth - The width of the container
 * @param containerTop - The top position of the container
 * @returns The calculated position
 */
export function calculatePopoverPosition(
  clickX: number,
  containerWidth: number,
  containerTop: number
): {x: number, y: number} {
  // Ensure popover doesn't go off the left or right edge
  // Assuming popover width is about 60px
  const popoverWidth = 60;
  const minX = popoverWidth / 2;
  const maxX = containerWidth - (popoverWidth / 2);

  let popoverX = clickX;
  if (popoverX < minX) popoverX = minX;
  if (popoverX > maxX) popoverX = maxX;

  // No offset needed for Y position because the CSS transform: translate(-50%, -100%)
  // will position the popover above the cursor automatically
  return {
    x: popoverX,
    y: containerTop
  };
}
