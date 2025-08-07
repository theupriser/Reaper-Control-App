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
  getCustomLengthForRegion,
  has1008MarkerInRegion,
  getEffectiveRegionLength,
  type Marker
} from './markerStore';
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

  // Find markers that are within the region and have a !length tag
  const lengthMarkers = markerList.filter(marker =>
    marker.position >= region.start &&
    marker.position <= region.end
  );

  // Check each marker for !length tag
  for (const marker of lengthMarkers) {
    const length = extractLengthFromMarker(marker.name);
    if (length !== null) {
      return marker;
    }
  }

  return null;
}

/**
 * Helper function to extract length from marker name
 * @param name - The marker name
 * @returns The extracted length or null if not found
 */
export function extractLengthFromMarker(name: string): number | null {
  const lengthMatch = name.match(/!length:(\d+(\.\d+)?)/);
  return lengthMatch ? parseFloat(lengthMatch[1]) : null;
}

/**
 * Format time in seconds to MM:SS format
 * @param seconds - The time in seconds
 * @returns The formatted time
 */
export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || seconds === null) return '--:--';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format time in seconds to HH:MM:SS format for longer durations (omits hours if zero)
 * @param seconds - The time in seconds
 * @returns The formatted time
 */
export function formatLongTime(seconds: number | undefined): string {
  if (seconds === undefined || seconds === null) return '--:--';

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  // Only include hours in the output if they are non-zero
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * Toggle play/pause
 */
export function togglePlay(): void {
  safeTransportAction(ipcService.togglePlay);
}

/**
 * Go to next region
 */
export function nextRegionHandler(): void {
  safeTransportAction(ipcService.nextRegion);
}

/**
 * Go to previous region
 */
export function previousRegionHandler(): void {
  safeTransportAction(ipcService.previousRegion);
}

/**
 * Toggle autoplay
 */
export function toggleAutoplayHandler(): void {
  safeTransportAction(() => {
    // This will be implemented with IPC in the future
    // For now, just toggle the store directly
    autoplayEnabled.update(current => !current);
  });
}

/**
 * Toggle count-in
 */
export function toggleCountInHandler(): void {
  safeTransportAction(() => {
    // This will be implemented with IPC in the future
    // For now, just toggle the store directly
    countInEnabled.update(current => !current);
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
  } else {
    // Default to the start of the region if we somehow didn't set finalPosition
    finalPosition = currentRegionValue.start;
  }

  // Seek to the position (either marker position or calculated position)
  // Use safeTransportAction to prevent multiple rapid clicks
  safeTransportAction(ipcService.seekToPosition, finalPosition.toString());

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
      const customLength = getCustomLengthForRegion(markersValue, currentRegionValue);
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
