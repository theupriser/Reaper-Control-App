/**
 * Performer Store
 * Manages the state and logic for the Performer Mode component
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import {
  regions,
  currentRegion,
  type Region
} from './regionStore';
import {
  playbackState,
  autoplayEnabled,
  countInEnabled
} from './playbackStore';
import {
  markers,
  sortedMarkers,
  displayMarkers,
  type Marker
} from './markerStore';
import {
  getCustomLengthForRegion,
  has1008MarkerInRegion,
  getEffectiveRegionLength,
  extractLengthFromMarker,
  getMarkersInRegion
} from '../lib/utils/markerUtils';
import { formatTime, formatLongTime } from '../lib/utils/timeUtils';
import {
  currentSetlist,
  type Setlist
} from './setlistStore';
import ipcService from '../services/ipcService';
import logger from '../lib/utils/logger';

// Store to track disabled state of transport buttons
export const transportButtonsDisabled: Writable<boolean> = writable(false);

// Last playback state update timestamp
let lastPlaybackStateUpdate = Date.now();

// Local timer state
export const localTimer: Writable<NodeJS.Timeout | null> = writable(null);
export const localPosition: Writable<number> = writable(0);
export const useLocalTimer: Writable<boolean> = writable(false);
export const timerStartTime: Writable<number> = writable(0);
export const timerStartPosition: Writable<number> = writable(0);
export const atHardStop: Writable<boolean> = writable(false);

// Store previous playback state to detect significant changes
let previousPlaybackPosition = 0;
let previousPlaybackIsPlaying = false;

// Store previous region ID to detect actual region changes
let previousRegionId: number | null = null;

// Store for the current time
export const currentTime: Writable<Date> = writable(new Date());

/**
 * Safely execute a transport control function with button disabling
 * This prevents multiple rapid clicks from causing the application to freeze
 *
 * The issue: When transport buttons (especially play) are clicked multiple times rapidly,
 * many commands are sent to Reaper before receiving playback state updates, causing
 * race conditions that can freeze the application.
 *
 * The solution:
 * 1. Immediately disable all transport controls when any action is triggered
 * 2. Execute the requested transport action (which sends a command to Reaper)
 * 3. Store the timestamp of when the action was triggered
 * 4. Set a safety timeout to re-enable controls after 2 seconds (in case no update is received)
 * 5. Re-enable controls when a playback state update is received (in the reactive statement)
 *
 * @param actionFn - The transport control function to execute
 * @param args - Arguments to pass to the function
 */
export function safeTransportAction(actionFn: Function, ...args: any[]): void {
  // Step 1: Disable all transport buttons
  transportButtonsDisabled.set(true);

  // Step 2: Execute the transport action
  actionFn(...args);

  // Step 3: Store the current timestamp when the action was triggered
  // This is used in the reactive statement to ensure we don't re-enable too early
  lastPlaybackStateUpdate = Date.now();

  // Step 4: Set a safety timeout to re-enable buttons after a maximum wait time
  // This ensures buttons don't stay disabled if something goes wrong with the backend
  setTimeout(() => {
    transportButtonsDisabled.set(false);
  }, 2000); // 2 seconds maximum wait time

  // Step 5 happens in the updateTimer function that watches playbackState changes
  // When a playback state update is received, buttons are re-enabled
}

/**
 * Function to start the local timer
 * @param startPosition - The position to start the timer from
 */
export function startLocalTimer(startPosition: number): void {
  // Clear any existing timer
  let timer: NodeJS.Timeout | null = null;
  localTimer.update(current => {
    if (current) {
      clearInterval(current);
    }
    return null;
  });

  // Set the start time and position
  timerStartTime.set(Date.now());
  timerStartPosition.set(startPosition);

  // Initialize the local position to match the current playback position
  // This ensures a smooth transition when the local timer takes over
  localPosition.set(startPosition);

  // Start the timer
  timer = setInterval(() => {
    // Get current values from stores
    let timerStartTimeValue: number = 0;
    let timerStartPositionValue: number = 0;
    const unsubscribeTime = timerStartTime.subscribe(value => { timerStartTimeValue = value; });
    const unsubscribePosition = timerStartPosition.subscribe(value => { timerStartPositionValue = value; });
    unsubscribeTime();
    unsubscribePosition();

    // Calculate the elapsed time
    const elapsed = (Date.now() - timerStartTimeValue) / 1000;

    // Calculate the current position
    const currentPos = timerStartPositionValue + elapsed;

    // Update the local position
    localPosition.set(currentPos);

    // Check if we've reached the end of the length marker or if we have a !1008 marker
    let currentRegionValue: Region | null = null;
    const unsubscribeRegion = currentRegion.subscribe(value => {
      currentRegionValue = value;
    });
    unsubscribeRegion();

    if (currentRegionValue) {
      let markersValue: Marker[] = [];
      const unsubscribeDisplayMarkers = displayMarkers.subscribe(value => {
        markersValue = value;
      });
      unsubscribeDisplayMarkers();

      const customLength = getCustomLengthForRegion(currentRegionValue, markersValue);
      const has1008Marker = has1008MarkerInRegion(markersValue, currentRegionValue);

      // For length markers, set the hard stop flag and stop the timer at the custom length
      if (has1008Marker && (customLength !== null && (currentPos - currentRegionValue.start) >= customLength)) {
        // Set the hard stop flag
        atHardStop.set(true);

        // When hard stop is reached, we should stop at the fake hard stop marker
        // which is at the end of the custom length
        const hardStopPosition = currentRegionValue.start + customLength;
        localPosition.set(hardStopPosition);
      }
    }
  }, 100); // Update every 100ms for smooth display

  localTimer.set(timer);
}

/**
 * Function to stop the local timer
 */
export function stopLocalTimer(): void {
  localTimer.update(current => {
    if (current) {
      clearInterval(current);
    }
    return null;
  });
}

/**
 * Function to find the length marker in the current region
 * @param markerList - The markers array
 * @param region - The current region
 * @returns The length marker or null if not found
 */
export function findLengthMarkerInRegion(markerList: Marker[], region: Region): Marker | null {
  if (!region || !markerList || markerList.length === 0) return null;

  // Find markers that are within the region
  const lengthMarkers = getMarkersInRegion(markerList, region);

  // Check each marker for !length tag
  for (const marker of lengthMarkers) {
    const length = extractLengthFromMarker(marker.name);
    if (length !== null) {
      return marker;
    }
  }

  return null;
}

// Time formatting functions are now imported from timeUtils

/**
 * Toggle play/pause
 * If a setlist is selected but no region is active, starts from the first setlist item
 */
export function togglePlay(): void {
  safeTransportAction(async () => {
    // Get current playback state
    let playbackStateValue: any = null;
    const unsubscribePlayback = playbackState.subscribe(value => { playbackStateValue = value; });
    unsubscribePlayback();

    // Get current setlist if one is selected
    let currentSetlistValue: Setlist | null = null;
    const unsubscribeSetlist = currentSetlist.subscribe(value => { currentSetlistValue = value; });
    unsubscribeSetlist();

    // If not in a region and a setlist is selected, start from the first item
    if (!playbackStateValue.currentRegionId && playbackStateValue.selectedSetlistId && currentSetlistValue) {
      logger.log('Not in a region and setlist is selected, checking for first item');

      if (currentSetlistValue.items.length > 0) {
        logger.log(`Found setlist with ${currentSetlistValue.items.length} items`);

        const firstItem = currentSetlistValue.items[0];
        logger.log(`First item: ${firstItem.name || firstItem.regionId}`);

        // Find the region for the first setlist item
        let regionsValue: Region[] = [];
        const unsubscribeRegions = regions.subscribe(value => { regionsValue = value; });
        unsubscribeRegions();

        const region = regionsValue.find(r => r.id === Number(firstItem.regionId));

        if (region) {
          logger.log(`Found region: ${region.name}`);

          // Seek to the first region and play
          try {
            await ipcService.seekToRegion(region.id.toString());
            await ipcService.togglePlay();
            return;
          } catch (error) {
            logger.error('Error seeking to first setlist item:', error);
          }
        } else {
          logger.log('Region not found for first setlist item');
        }
      } else {
        logger.log('Setlist is empty');
      }
    }

    // Toggle the playback state immediately for better UI feedback
    playbackState.update(state => ({
      ...state,
      isPlaying: !state.isPlaying
    }));

    // Then send the command to the backend
    ipcService.togglePlay();
  });
}

/**
 * Go to next region
 */
export function nextRegionHandler(): void {
  // Get the current nextRegion value
  let nextRegionValue: Region | null = null;
  const unsubscribeNextRegion = nextRegion.subscribe(value => {
    nextRegionValue = value;
  });
  unsubscribeNextRegion();

  // Only proceed if there is a next region
  if (nextRegionValue) {
    safeTransportAction(async () => {
      try {
        const success = await ipcService.nextRegion();
        if (!success) {
          logger.warn('Next region navigation failed');
          // Force a refresh of regions to ensure the UI is up-to-date
          await ipcService.refreshRegions();
        }
      } catch (error) {
        logger.error('Error in nextRegionHandler:', error);
        // Force a refresh of regions to ensure the UI is up-to-date
        await ipcService.refreshRegions();
      }
    });
  } else {
    logger.log('No next region available');
  }
}

/**
 * Go to previous region
 */
export function previousRegionHandler(): void {
  // Get the current region value
  let currentRegionValue: Region | null = null;
  const unsubscribeCurrentRegion = currentRegion.subscribe(value => {
    currentRegionValue = value;
  });
  unsubscribeCurrentRegion();

  // Get the previous region value
  let previousRegionValue: Region | null = null;
  const unsubscribePreviousRegion = previousRegion.subscribe(value => {
    previousRegionValue = value;
  });
  unsubscribePreviousRegion();

  // Only proceed if there is a current region and a previous region
  if (currentRegionValue && previousRegionValue) {
    safeTransportAction(async () => {
      try {
        const success = await ipcService.previousRegion();
        if (!success) {
          logger.warn('Previous region navigation failed');
          // Force a refresh of regions to ensure the UI is up-to-date
          await ipcService.refreshRegions();
        }
      } catch (error) {
        logger.error('Error in previousRegionHandler:', error);
        // Force a refresh of regions to ensure the UI is up-to-date
        await ipcService.refreshRegions();
      }
    });
  } else {
    logger.log('No previous region available');
  }
}

/**
 * Toggle autoplay
 */
export function toggleAutoplayHandler(): void {
  safeTransportAction(() => {
    // Get the current value
    let current: boolean;
    const unsubscribe = autoplayEnabled.subscribe(value => {
      current = value;
    });
    unsubscribe();

    // Toggle the value
    const newValue = !current;

    // Update the local store
    autoplayEnabled.set(newValue);

    // Send to main process via IPC
    if (window.electronAPI) {
      window.electronAPI.setAutoplayEnabled(newValue);
      logger.log(`Sent autoplay enabled (${newValue}) to main process`);
    } else {
      logger.warn('Electron API not available, autoplay enabled not sent to main process');
    }
  });
}

/**
 * Toggle count-in
 */
export function toggleCountInHandler(): void {
  safeTransportAction(() => {
    // Get the current value
    let current: boolean;
    const unsubscribe = countInEnabled.subscribe(value => {
      current = value;
    });
    unsubscribe();

    // Toggle the value
    const newValue = !current;

    // Update the local store
    countInEnabled.set(newValue);

    // Send to main process via IPC
    if (window.electronAPI) {
      window.electronAPI.setCountInEnabled(newValue);
      logger.log(`Sent count-in enabled (${newValue}) to main process`);
    } else {
      logger.warn('Electron API not available, count-in enabled not sent to main process');
    }
  });
}

/**
 * Handle progress bar click
 * @param event - The mouse event
 */
export function handleProgressBarClick(event: MouseEvent): void {
  let currentRegionValue: Region | null = null;
  const unsubscribeRegion = currentRegion.subscribe(value => {
    currentRegionValue = value;
  });
  unsubscribeRegion();

  if (!currentRegionValue) return;

  // Get popover state from the component if available
  const popoverVisible = (window as any).performerPopoverVisible;
  const popoverPosition = (window as any).performerPopoverPosition;
  const popoverTime = (window as any).performerPopoverTime;

  // Get the click position relative to the progress container
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const containerWidth = rect.width;

  // Calculate the percentage of the click position
  const percentage = Math.max(0, Math.min(1, clickX / containerWidth));

  // Check if the click is near a marker
  let finalPosition: number;
  let isNearMarker = false;
  const clickThreshold = 10; // Pixel threshold for considering a click "on" a marker

  // Get current values from stores
  let sortedMarkersValue: Marker[] = [];
  let markersValue: Marker[] = [];
  const unsubscribeSortedMarkers = sortedMarkers.subscribe(value => {
    sortedMarkersValue = value;
  });
  const unsubscribeDisplayMarkers = displayMarkers.subscribe(value => {
    markersValue = value;
  });
  unsubscribeSortedMarkers();
  unsubscribeDisplayMarkers();

  // Find markers within the current region
  const markersInRegion = sortedMarkersValue.filter(marker =>
    marker.position >= currentRegionValue!.start &&
    marker.position <= currentRegionValue!.end
  );

  // Check if click is near any marker
  for (const marker of markersInRegion) {
    // Calculate marker's pixel position in the progress bar
    const regionDuration = getEffectiveRegionLength(currentRegionValue, markersValue);
    const markerPercentage = (marker.position - currentRegionValue.start) / regionDuration;
    const markerPixelPosition = markerPercentage * containerWidth;

    // Check if click is within threshold of marker
    if (Math.abs(clickX - markerPixelPosition) <= clickThreshold) {
      // Click is near a marker, use exact marker position
      finalPosition = marker.position;
      isNearMarker = true;

      // Log that we're using exact marker position
      logger.log(`Click near marker "${marker.name}" at position ${marker.position}s, using exact marker position`);
      break;
    }
  }

  // If not near a marker, calculate position based on click percentage
  if (!isNearMarker) {
    const regionDuration = getEffectiveRegionLength(currentRegionValue, markersValue);
    finalPosition = currentRegionValue.start + (percentage * regionDuration);
  }

  // Seek to the position (either marker position or calculated position)
  // If the click was on a marker and count-in is enabled, use count-in
  let countInEnabledValue: boolean = false;
  const unsubscribeCountIn = countInEnabled.subscribe(value => { countInEnabledValue = value; });
  unsubscribeCountIn();

  if (isNearMarker && countInEnabledValue) {
    logger.log(`Using count-in for marker click at position ${finalPosition}`);
    safeTransportAction(() => ipcService.seekToPosition(finalPosition, true));
  } else {
    // Otherwise, just seek to the position without count-in
    safeTransportAction(() => ipcService.seekToPosition(finalPosition, false));
  }

  // Check if we should use the local timer based on the position
  const customLength = getCustomLengthForRegion(currentRegionValue, markersValue);
  if (customLength !== null) {
    // Find the actual length marker to get its position
    const lengthMarker = findLengthMarkerInRegion(markersValue, currentRegionValue);

    if (lengthMarker && finalPosition >= lengthMarker.position) {
      // Position is past the length marker, use local timer
      useLocalTimer.set(true);

      // Update the local position immediately for a smooth transition
      localPosition.set(finalPosition);

      // Restart the timer from the position
      startLocalTimer(finalPosition);
    } else {
      // Position is before the length marker
      useLocalTimer.set(false);
      stopLocalTimer();
    }
  }

  // Check if we're in a region with a !1008 marker
  const has1008Marker = has1008MarkerInRegion(markersValue, currentRegionValue);
  if (has1008Marker) {
    // Calculate if the seek position is at the end of the region
    const regionEnd = currentRegionValue.end;
    const isAtEnd = Math.abs(finalPosition - regionEnd) < 0.5;

    // Calculate if the seek position is near the end (within 99% of region length)
    const regionLength = currentRegionValue.end - currentRegionValue.start;
    const positionInRegion = finalPosition - currentRegionValue.start;
    const isNearEnd = positionInRegion / regionLength > 0.99;

    // Only set atHardStop to true if we're at or near the end
    if (isAtEnd || isNearEnd) {
      atHardStop.set(true);
    } else {
      // If we're seeking to a position before the end, reset the hard stop flag
      atHardStop.set(false);
    }
  }
}

/**
 * Handle keyboard shortcuts
 * @param event - The keyboard event
 */
export function handleKeydown(event: KeyboardEvent): void {
  if (event.key === ' ') {
    // Space bar - toggle play/pause
    togglePlay();
    event.preventDefault();
  } else if (event.key === 'ArrowRight') {
    // Right arrow - next region
    nextRegionHandler();
    event.preventDefault();
  } else if (event.key === 'ArrowLeft') {
    // Left arrow - previous region
    previousRegionHandler();
    event.preventDefault();
  } else if (event.key === 'a') {
    // 'a' key - toggle autoplay
    toggleAutoplayHandler();
    event.preventDefault();
  }
}

/**
 * Initialize the page
 * - Sets up keyboard event listeners
 * @returns Cleanup function
 */
export function initializePage(): () => void {
  // Add keyboard event listener
  window.addEventListener('keydown', handleKeydown);

  // Return a cleanup function
  return () => {
    window.removeEventListener('keydown', handleKeydown);
    stopLocalTimer();
  };
}

/**
 * Update timer based on playback state and current region
 * This function should be called whenever playbackState or currentRegion changes
 */
export function updateTimer(): void {
  let currentRegionValue: Region | null = null;
  let playbackStateValue: any = null;
  let markersValue: Marker[] = [];

  // Get current values from stores
  const unsubscribeRegion = currentRegion.subscribe(value => { currentRegionValue = value; });
  const unsubscribePlayback = playbackState.subscribe(value => { playbackStateValue = value; });
  const unsubscribeDisplayMarkers = displayMarkers.subscribe(value => { markersValue = value; });
  unsubscribeRegion();
  unsubscribePlayback();
  unsubscribeDisplayMarkers();

  if (currentRegionValue) {
    const customLength = getCustomLengthForRegion(currentRegionValue, markersValue);

    // If there's a length marker, check if we should use the local timer
    if (customLength !== null) {
      // Find the actual length marker to get its position
      const lengthMarker = findLengthMarkerInRegion(markersValue, currentRegionValue);

      if (lengthMarker) {
        // Only start the timer if playback position has passed the marker position
        if (playbackStateValue.currentPosition >= lengthMarker.position) {
          // Check if we're transitioning from regular playback to local timer
          let wasUsingLocalTimer: boolean = false;
          const unsubscribeUseLocalTimer = useLocalTimer.subscribe(value => { wasUsingLocalTimer = value; });
          unsubscribeUseLocalTimer();

          // Set the flag to use local timer
          useLocalTimer.set(true);

          // If we're just transitioning to local timer or the timer isn't running, start it
          let localTimerValue: NodeJS.Timeout | null = null;
          const unsubscribeLocalTimer = localTimer.subscribe(value => { localTimerValue = value; });
          unsubscribeLocalTimer();

          if (!wasUsingLocalTimer || !localTimerValue) {
            // Initialize with current playback position for smooth transition
            startLocalTimer(playbackStateValue.currentPosition);
          } else {
            // Only restart timer if position changed significantly (e.g., due to seeking)
            // We don't restart on play/pause changes since timer should continue regardless
            const positionChanged = Math.abs(playbackStateValue.currentPosition - previousPlaybackPosition) > 0.5;

            if (positionChanged) {
              startLocalTimer(playbackStateValue.currentPosition);
              // Reset hard stop flag when seeking
              atHardStop.set(false);
            }
          }
        } else {
          // Playback hasn't reached the length marker yet, use regular playback state
          useLocalTimer.set(false);
          stopLocalTimer();
          // Reset hard stop flag
          atHardStop.set(false);
        }
      }
    } else {
      // No length marker, use the regular playback state
      useLocalTimer.set(false);
      stopLocalTimer();

      // Check if there's a !1008 marker in the region
      const has1008Marker = has1008MarkerInRegion(markersValue, currentRegionValue);

      if (has1008Marker) {
        // If we have a !1008 marker and we're at the end of the region, set hard stop flag
        const regionEnd = currentRegionValue.end;
        // Increase the tolerance to 0.5 seconds to be more lenient
        const isAtEnd = Math.abs(playbackStateValue.currentPosition - regionEnd) < 0.5;
        // Also check if we're very close to the end (within 99% of region length)
        const regionLength = currentRegionValue.end - currentRegionValue.start;
        const positionInRegion = playbackStateValue.currentPosition - currentRegionValue.start;
        const isNearEnd = positionInRegion / regionLength > 0.99;

        // Check if position changed significantly (e.g., due to seeking)
        const positionChanged = Math.abs(playbackStateValue.currentPosition - previousPlaybackPosition) > 0.5;

        if (positionChanged) {
          // If position changed significantly due to seeking, check if we're at the end
          if ((isAtEnd || isNearEnd) && !playbackStateValue.isPlaying) {
            // We're at the end of the region after seeking, set hard stop flag
            atHardStop.set(true);
          } else {
            // We're not at the end after seeking, reset hard stop flag
            atHardStop.set(false);
          }
        } else {
          // No significant position change, use normal logic
          // Set hard stop if we're at the end OR near the end, and not playing
          if ((isAtEnd || isNearEnd) && !playbackStateValue.isPlaying) {
            // We're at the end of the region with a !1008 marker and not playing, set hard stop flag
            atHardStop.set(true);
          } else if (playbackStateValue.isPlaying) {
            // If we're playing, reset the hard stop flag
            atHardStop.set(false);
          }
        }
      } else {
        // No !1008 marker, reset hard stop flag
        atHardStop.set(false);
      }
    }
  } else {
    // No current region, use the regular playback state
    useLocalTimer.set(false);
    stopLocalTimer();
    // Reset hard stop flag
    atHardStop.set(false);
  }

  // If playback state changes from stopped to playing, reset hard stop flag
  if (playbackStateValue.isPlaying && !previousPlaybackIsPlaying) {
    atHardStop.set(false);
  }

  // Update previous state values
  previousPlaybackPosition = playbackStateValue.currentPosition;
  previousPlaybackIsPlaying = playbackStateValue.isPlaying;

  // Step 5 of safeTransportAction: Re-enable transport buttons when playback state updates
  // This is the key part of preventing freezes - we only re-enable controls after
  // receiving confirmation from the backend that our previous action was processed

  // Only re-enable if at least 100ms have passed since the last action
  // This small delay prevents re-enabling too early if multiple updates arrive in quick succession
  if (Date.now() - lastPlaybackStateUpdate > 100) {
    transportButtonsDisabled.set(false);
  }
}

/**
 * Update timer when region changes
 * This function should be called whenever currentRegion changes
 */
export function updateTimerOnRegionChange(): void {
  let currentRegionValue: Region | null = null;
  let playbackStateValue: any = null;
  let markersValue: Marker[] = [];

  // Get current values from stores
  const unsubscribeRegion = currentRegion.subscribe(value => { currentRegionValue = value; });
  const unsubscribePlayback = playbackState.subscribe(value => { playbackStateValue = value; });
  const unsubscribeDisplayMarkers = displayMarkers.subscribe(value => { markersValue = value; });
  unsubscribeRegion();
  unsubscribePlayback();
  unsubscribeDisplayMarkers();

  if (currentRegionValue) {
    // Only reset timer if the region ID actually changed
    if (previousRegionId !== currentRegionValue.id) {
      previousRegionId = currentRegionValue.id;

      // Check if the new region has a length marker
      const customLength = getCustomLengthForRegion(currentRegionValue, markersValue);
      if (customLength !== null) {
        // Find the actual length marker to get its position
        const lengthMarker = findLengthMarkerInRegion(markersValue, currentRegionValue);

        if (lengthMarker && playbackStateValue.currentPosition >= lengthMarker.position) {
          // Set the flag to use local timer
          useLocalTimer.set(true);

          // Initialize with current playback position for smooth transition
          localPosition.set(playbackStateValue.currentPosition);
          startLocalTimer(playbackStateValue.currentPosition);
        } else {
          // Playback hasn't reached the length marker yet
          useLocalTimer.set(false);
          stopLocalTimer();
          // Reset hard stop flag
          atHardStop.set(false);
        }
      } else {
        useLocalTimer.set(false);
        stopLocalTimer();
        // Reset hard stop flag
        atHardStop.set(false);
      }
    }
  }
}

// Derived stores for computed values

/**
 * Derived store for the next region
 * Takes setlists into account when determining the next region
 */
export const nextRegion: Readable<Region | null> = derived(
  [currentRegion, playbackState, currentSetlist, regions],
  ([$currentRegion, $playbackState, $currentSetlist, $regions]) => {
    if (!$currentRegion) return null;

    if ($playbackState.selectedSetlistId && $currentSetlist) {
      // If a setlist is selected, get the next item from the setlist
      const currentItemIndex = $currentSetlist.items.findIndex(item => Number(item.regionId) === $currentRegion.id);
      if (currentItemIndex !== -1 && currentItemIndex < $currentSetlist.items.length - 1) {
        const nextItem = $currentSetlist.items[currentItemIndex + 1];
        return $regions.find(region => region.id === Number(nextItem.regionId)) || null;
      }
      return null;
    } else {
      // Otherwise, get the next region from all regions
      const currentIndex = $regions.findIndex(r => r.id === $currentRegion.id);
      return currentIndex !== -1 && currentIndex < $regions.length - 1 ?
        $regions[currentIndex + 1] : null;
    }
  }
);

/**
 * Derived store for the previous region
 * Takes setlists into account when determining the previous region
 */
export const previousRegion: Readable<Region | null> = derived(
  [currentRegion, playbackState, currentSetlist, regions],
  ([$currentRegion, $playbackState, $currentSetlist, $regions]) => {
    if (!$currentRegion) {
      logger.debug('previousRegion: No current region, returning null');
      return null;
    }

    // Log current state for debugging
    logger.debug('previousRegion calculation:', {
      currentRegionId: $currentRegion.id,
      currentRegionName: $currentRegion.name,
      hasSetlist: Boolean($playbackState.selectedSetlistId && $currentSetlist),
      selectedSetlistId: $playbackState.selectedSetlistId,
      regionsCount: $regions.length
    });

    if ($playbackState.selectedSetlistId && $currentSetlist) {
      // If a setlist is selected, get the previous item from the setlist
      const currentItemIndex = $currentSetlist.items.findIndex(item => Number(item.regionId) === $currentRegion.id);
      logger.debug('previousRegion: In setlist mode, current item index:', currentItemIndex);

      if (currentItemIndex !== -1 && currentItemIndex > 0) {
        const prevItem = $currentSetlist.items[currentItemIndex - 1];
        const prevRegion = $regions.find(region => region.id === Number(prevItem.regionId)) || null;
        logger.debug('previousRegion: Found previous region in setlist:', prevRegion ? prevRegion.name : 'null');
        return prevRegion;
      }
      logger.debug('previousRegion: No previous region in setlist, returning null');
      return null;
    } else {
      // Otherwise, get the previous region from all regions
      const currentIndex = $regions.findIndex(r => r.id === $currentRegion.id);
      logger.debug('previousRegion: In regular mode, current index:', currentIndex);

      // Explicitly check if this is the first region (index 0)
      if (currentIndex === 0) {
        logger.debug('previousRegion: This is the first region, returning null');
        return null;
      }

      if (currentIndex !== -1 && currentIndex > 0) {
        const prevRegion = $regions[currentIndex - 1];
        logger.debug('previousRegion: Found previous region:', prevRegion.name);
        return prevRegion;
      }
      logger.debug('previousRegion: No previous region, returning null');
      return null;
    }
  }
);

/**
 * Derived store for the total time of all regions or setlist items
 */
export const totalRegionsTime: Readable<number> = derived(
  [playbackState, currentSetlist, regions, displayMarkers],
  ([$playbackState, $currentSetlist, $regions, $displayMarkers]) => {
    if ($playbackState.selectedSetlistId && $currentSetlist) {
      // If a setlist is selected, calculate total time from setlist items
      return $currentSetlist.items.reduce((total, item) => {
        const region = $regions.find(r => r.id === Number(item.regionId));
        return total + (region ? getEffectiveRegionLength(region, $displayMarkers) : 0);
      }, 0);
    } else {
      // Otherwise, calculate from all regions
      return $regions.reduce((total, region) => total + getEffectiveRegionLength(region, $displayMarkers), 0);
    }
  }
);

/**
 * Derived store for the elapsed time before the current region
 */
export const elapsedTimeBeforeCurrentRegion: Readable<number> = derived(
  [currentRegion, playbackState, currentSetlist, regions, displayMarkers],
  ([$currentRegion, $playbackState, $currentSetlist, $regions, $displayMarkers]) => {
    if (!$currentRegion) return 0;

    if ($playbackState.selectedSetlistId && $currentSetlist) {
      // If a setlist is selected, calculate elapsed time from setlist items
      return $currentSetlist.items
        .filter((_item, index) => {
          const currentItemIndex = $currentSetlist.items.findIndex(i => Number(i.regionId) === $currentRegion.id);
          return currentItemIndex !== -1 && index < currentItemIndex;
        })
        .reduce((total, item) => {
          const region = $regions.find(r => r.id === Number(item.regionId));
          return total + (region ? getEffectiveRegionLength(region, $displayMarkers) : 0);
        }, 0);
    } else {
      // Otherwise, calculate from all regions
      return $regions
        .filter(region => $regions.findIndex(r => r.id === region.id) < $regions.findIndex(r => r.id === $currentRegion.id))
        .reduce((total, region) => total + getEffectiveRegionLength(region, $displayMarkers), 0);
    }
  }
);

/**
 * Derived store for the total elapsed time
 */
export const totalElapsedTime: Readable<number> = derived(
  [currentRegion, elapsedTimeBeforeCurrentRegion, useLocalTimer, localPosition, playbackState],
  ([$currentRegion, $elapsedTimeBeforeCurrentRegion, $useLocalTimer, $localPosition, $playbackState]) => {
    if (!$currentRegion) return 0;
    return $elapsedTimeBeforeCurrentRegion + Math.max(0, ($useLocalTimer ? $localPosition : $playbackState.currentPosition) - $currentRegion.start);
  }
);

/**
 * Derived store for the total remaining time
 */
export const totalRemainingTime: Readable<number> = derived(
  [totalRegionsTime, totalElapsedTime],
  ([$totalRegionsTime, $totalElapsedTime]) => {
    return Math.max(0, $totalRegionsTime - $totalElapsedTime);
  }
);

/**
 * Derived store for the current song time
 */
export const currentSongTime: Readable<number> = derived(
  [currentRegion, useLocalTimer, localPosition, playbackState],
  ([$currentRegion, $useLocalTimer, $localPosition, $playbackState]) => {
    if (!$currentRegion) return 0;
    return Math.max(0, ($useLocalTimer ? $localPosition : $playbackState.currentPosition) - $currentRegion.start);
  }
);

/**
 * Derived store for the song duration
 */
export const songDuration: Readable<number> = derived(
  [currentRegion, displayMarkers],
  ([$currentRegion, $displayMarkers]) => {
    if (!$currentRegion) return 0;
    return getEffectiveRegionLength($currentRegion, $displayMarkers);
  }
);

/**
 * Derived store for the song remaining time
 */
export const songRemainingTime: Readable<number> = derived(
  [songDuration, currentSongTime],
  ([$songDuration, $currentSongTime]) => {
    return Math.max(0, $songDuration - $currentSongTime);
  }
);
