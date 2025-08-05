import { writable, derived } from 'svelte/store';
import { 
  regions, 
  currentRegion, 
  playbackState, 
  autoplayEnabled,
  currentSetlist,
  sortedMarkers,
  getCustomLengthForRegion
} from '$lib/stores';
import { socketControl } from '$lib/stores/socket';
import { markers, getEffectiveRegionLength, has1008MarkerInRegion } from '$lib/stores/markerStore';
import { initializeSetlistHandling } from '$lib/services/setlistService';

// Local timer state
export const _localTimer = writable(null);
export const _localPosition = writable(0);
export const _useLocalTimer = writable(false);
export const _timerStartTime = writable(0);
export const _timerStartPosition = writable(0);
export const _atHardStop = writable(false);

// Store previous playback state to detect significant changes
let previousPlaybackPosition = 0;
let previousPlaybackIsPlaying = false;

// Store previous region ID to detect actual region changes
let previousRegionId = null;

/**
 * Function to start the local timer
 * @param {number} startPosition - The position to start the timer from
 */
export function _startLocalTimer(startPosition) {
  // Clear any existing timer
  let timer = null;
  _localTimer.update(current => {
    if (current) {
      clearInterval(current);
    }
    return null;
  });

  // Set the start time and position
  _timerStartTime.set(Date.now());
  _timerStartPosition.set(startPosition);

  // Initialize the local position to match the current playback position
  // This ensures a smooth transition when the local timer takes over
  _localPosition.set(startPosition);

  // Start the timer
  timer = setInterval(() => {
    // Get current values from stores
    let timerStartTimeValue;
    let timerStartPositionValue;
    _timerStartTime.subscribe(value => { timerStartTimeValue = value; })();
    _timerStartPosition.subscribe(value => { timerStartPositionValue = value; })();
    
    // Calculate the elapsed time
    const elapsed = (Date.now() - timerStartTimeValue) / 1000;
  
    // Calculate the current position
    const currentPos = timerStartPositionValue + elapsed;
  
    // Update the local position
    _localPosition.set(currentPos);
  
    // Check if we've reached the end of the length marker or if we have a !1008 marker
    let currentRegionValue;
    currentRegion.subscribe(value => {
      currentRegionValue = value;
    })();
    
    if (currentRegionValue) {
      let markersValue;
      markers.subscribe(value => {
        markersValue = value;
      })();
      
      const customLength = getCustomLengthForRegion(markersValue, currentRegionValue);
      const has1008Marker = has1008MarkerInRegion(markersValue, currentRegionValue);
      
      // For length markers, set the hard stop flag and stop the timer at the custom length
      if (has1008Marker && (customLength !== null && (currentPos - currentRegionValue.start) >= customLength)) {
        // Set the hard stop flag
        _atHardStop.set(true);
        
        // When hard stop is reached, we should stop at the fake hard stop marker
        // which is at the end of the custom length
        const hardStopPosition = currentRegionValue.start + customLength;
        _localPosition.set(hardStopPosition);
      }
    }
  }, 100); // Update every 100ms for smooth display
  
  _localTimer.set(timer);
}

/**
 * Function to stop the local timer
 */
export function _stopLocalTimer() {
  _localTimer.update(current => {
    if (current) {
      clearInterval(current);
    }
    return null;
  });
}

/**
 * Function to find the length marker in the current region
 * @param {Array} markers - The markers array
 * @param {Object} region - The current region
 * @returns {Object|null} - The length marker or null if not found
 */
export function _findLengthMarkerInRegion(markers, region) {
  if (!region || !markers || markers.length === 0) return null;

  // Find markers that are within the region and have a !length tag
  const lengthMarkers = markers.filter(marker => 
    marker.position >= region.start && 
    marker.position <= region.end
  );

  // Check each marker for !length tag
  for (const marker of lengthMarkers) {
    const length = _extractLengthFromMarker(marker.name);
    if (length !== null) {
      return marker;
    }
  }

  return null;
}

/**
 * Helper function to extract length from marker name
 * @param {string} name - The marker name
 * @returns {number|null} - The extracted length or null if not found
 */
export function _extractLengthFromMarker(name) {
  const lengthMatch = name.match(/!length:(\d+(\.\d+)?)/);
  return lengthMatch ? parseFloat(lengthMatch[1]) : null;
}

/**
 * Format time in seconds to MM:SS format
 * @param {number} seconds - The time in seconds
 * @returns {string} - The formatted time
 */
export function _formatTime(seconds) {
  if (!seconds && seconds !== 0) return '--:--';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format time in seconds to HH:MM:SS format for longer durations (omits hours if zero)
 * @param {number} seconds - The time in seconds
 * @returns {string} - The formatted time
 */
export function _formatLongTime(seconds) {
  if (!seconds && seconds !== 0) return '--:--';

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
export function _togglePlay() {
  socketControl.togglePlay();
}

/**
 * Go to next region
 */
export function _nextRegionHandler() {
  socketControl.nextRegion();
}

/**
 * Go to previous region
 */
export function _previousRegionHandler() {
  socketControl.previousRegion();
}

/**
 * Toggle autoplay
 */
export function _toggleAutoplay() {
  socketControl.toggleAutoplay();
}

/**
 * Toggle count-in
 */
export function _toggleCountIn() {
  socketControl.toggleCountIn();
}

/**
 * Handle progress bar click
 * @param {MouseEvent} event - The mouse event
 */
export function _handleProgressBarClick(event) {
  if (!currentRegion.get()) return;
  
  // Get the click position relative to the progress container
  const rect = event.currentTarget.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const containerWidth = rect.width;
  
  // Calculate the percentage of the click position
  const percentage = Math.max(0, Math.min(1, clickX / containerWidth));
  
  // Check if the click is near a marker
  let finalPosition;
  let isNearMarker = false;
  const clickThreshold = 10; // Pixel threshold for considering a click "on" a marker
  
  // Get current values from stores
  const currentRegionValue = currentRegion.get();
  const sortedMarkersValue = sortedMarkers.get();
  const markersValue = markers.get();
  
  // Find markers within the current region
  const markersInRegion = sortedMarkersValue.filter(marker => 
    marker.position >= currentRegionValue.start && 
    marker.position <= currentRegionValue.end
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
      console.log(`Click near marker "${marker.name}" at position ${marker.position}s, using exact marker position`);
      break;
    }
  }
  
  // If not near a marker, calculate position based on click percentage
  if (!isNearMarker) {
    const regionDuration = getEffectiveRegionLength(currentRegionValue, markersValue);
    finalPosition = currentRegionValue.start + (percentage * regionDuration);
  }
  
  // Seek to the position (either marker position or calculated position)
  // Pass isNearMarker flag to indicate whether the click was on a marker
  socketControl.seekToPosition(finalPosition, isNearMarker);
}

// Helper function to get the current value of a store
function get(store) {
  let value;
  const unsubscribe = store.subscribe(v => { value = v; });
  unsubscribe();
  return value;
}

// Add get method to stores
currentRegion.get = () => get(currentRegion);
sortedMarkers.get = () => get(sortedMarkers);
markers.get = () => get(markers);

/**
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} event - The keyboard event
 */
export function _handleKeydown(event) {
  if (event.key === ' ') {
    // Space bar - toggle play/pause
    _togglePlay();
    event.preventDefault();
  } else if (event.key === 'ArrowRight') {
    // Right arrow - next region
    _nextRegionHandler();
    event.preventDefault();
  } else if (event.key === 'ArrowLeft') {
    // Left arrow - previous region
    _previousRegionHandler();
    event.preventDefault();
  } else if (event.key === 'a') {
    // 'a' key - toggle autoplay
    _toggleAutoplay();
    event.preventDefault();
  }
}

/**
 * Initialize the page
 * - Sets up keyboard event listeners
 * - Initializes setlist handling
 * @returns {Function} - Cleanup function
 */
export function _initializePage() {
  // Add keyboard event listener
  window.addEventListener('keydown', _handleKeydown);
  
  // Use the shared service to initialize setlist handling
  // Don't refresh regions or fetch all setlists in performer mode
  const setlistUnsubscribe = initializeSetlistHandling({
    refreshRegions: false,
    fetchAllSetlists: false
  });
  
  // Return a cleanup function
  return () => {
    window.removeEventListener('keydown', _handleKeydown);
    setlistUnsubscribe();
    _stopLocalTimer();
  };
}

/**
 * Update timer based on playback state and current region
 * This function should be called whenever playbackState or currentRegion changes
 */
export function _updateTimer() {
  let currentRegionValue;
  let playbackStateValue;
  let markersValue;
  
  // Get current values from stores
  currentRegion.subscribe(value => { currentRegionValue = value; })();
  playbackState.subscribe(value => { playbackStateValue = value; })();
  markers.subscribe(value => { markersValue = value; })();
  
  if (currentRegionValue) {
    const customLength = getCustomLengthForRegion(markersValue, currentRegionValue);
  
    // If there's a length marker, check if we should use the local timer
    if (customLength !== null) {
      // Find the actual length marker to get its position
      const lengthMarker = _findLengthMarkerInRegion(markersValue, currentRegionValue);
    
      if (lengthMarker) {
        // Only start the timer if playback position has passed the marker position
        if (playbackStateValue.currentPosition >= lengthMarker.position) {
          // Check if we're transitioning from regular playback to local timer
          let wasUsingLocalTimer;
          _useLocalTimer.subscribe(value => { wasUsingLocalTimer = value; })();
        
          // Set the flag to use local timer
          _useLocalTimer.set(true);
        
          // If we're just transitioning to local timer or the timer isn't running, start it
          let localTimerValue;
          _localTimer.subscribe(value => { localTimerValue = value; })();
          
          if (!wasUsingLocalTimer || !localTimerValue) {
            // Initialize with current playback position for smooth transition
            _startLocalTimer(playbackStateValue.currentPosition);
          } else {
            // Only restart timer if position changed significantly (e.g., due to seeking)
            // We don't restart on play/pause changes since timer should continue regardless
            const positionChanged = Math.abs(playbackStateValue.currentPosition - previousPlaybackPosition) > 0.5;
          
            if (positionChanged) {
              _startLocalTimer(playbackStateValue.currentPosition);
              // Reset hard stop flag when seeking
              _atHardStop.set(false);
            }
          }
        } else {
          // Playback hasn't reached the length marker yet, use regular playback state
          _useLocalTimer.set(false);
          _stopLocalTimer();
          // Reset hard stop flag
          _atHardStop.set(false);
        }
      }
    } else {
      // No length marker, use the regular playback state
      _useLocalTimer.set(false);
      _stopLocalTimer();
      
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
        
        // Set hard stop if we're at the end OR near the end, and not playing
        if ((isAtEnd || isNearEnd) && !playbackStateValue.isPlaying) {
          // We're at the end of the region with a !1008 marker and not playing, set hard stop flag
          _atHardStop.set(true);
        } else if (playbackStateValue.isPlaying) {
          // If we're playing, reset the hard stop flag
          _atHardStop.set(false);
        }
      } else {
        // No !1008 marker, reset hard stop flag
        _atHardStop.set(false);
      }
    }
  } else {
    // No current region, use the regular playback state
    _useLocalTimer.set(false);
    _stopLocalTimer();
    // Reset hard stop flag
    _atHardStop.set(false);
  }
  
  // If playback state changes from stopped to playing, reset hard stop flag
  if (playbackStateValue.isPlaying && !previousPlaybackIsPlaying) {
    _atHardStop.set(false);
  }

  // Update previous state values
  previousPlaybackPosition = playbackStateValue.currentPosition;
  previousPlaybackIsPlaying = playbackStateValue.isPlaying;
}

/**
 * Update timer when region changes
 * This function should be called whenever currentRegion changes
 */
export function _updateTimerOnRegionChange() {
  let currentRegionValue;
  let playbackStateValue;
  let markersValue;
  
  // Get current values from stores
  currentRegion.subscribe(value => { currentRegionValue = value; })();
  playbackState.subscribe(value => { playbackStateValue = value; })();
  markers.subscribe(value => { markersValue = value; })();
  
  if (currentRegionValue) {
    // Only reset timer if the region ID actually changed
    if (previousRegionId !== currentRegionValue.id) {
      previousRegionId = currentRegionValue.id;
    
      // Check if the new region has a length marker
      const customLength = getCustomLengthForRegion(markersValue, currentRegionValue);
      if (customLength !== null) {
        // Find the actual length marker to get its position
        const lengthMarker = _findLengthMarkerInRegion(markersValue, currentRegionValue);
      
        if (lengthMarker && playbackStateValue.currentPosition >= lengthMarker.position) {
          // Set the flag to use local timer
          _useLocalTimer.set(true);
        
          // Initialize with current playback position for smooth transition
          _localPosition.set(playbackStateValue.currentPosition);
          _startLocalTimer(playbackStateValue.currentPosition);
        } else {
          // Playback hasn't reached the length marker yet
          _useLocalTimer.set(false);
          _stopLocalTimer();
          // Reset hard stop flag
          _atHardStop.set(false);
        }
      } else {
        _useLocalTimer.set(false);
        _stopLocalTimer();
        // Reset hard stop flag
        _atHardStop.set(false);
      }
    }
  }
}

// Derived stores for computed values
export const _nextRegion = derived(
  [currentRegion, playbackState, currentSetlist, regions],
  ([$currentRegion, $playbackState, $currentSetlist, $regions]) => {
    if (!$currentRegion) return null;
    
    if ($playbackState.selectedSetlistId && $currentSetlist) {
      // If a setlist is selected, get the next item from the setlist
      const currentItemIndex = $currentSetlist.items.findIndex(item => item.regionId === $currentRegion.id);
      if (currentItemIndex !== -1 && currentItemIndex < $currentSetlist.items.length - 1) {
        const nextItem = $currentSetlist.items[currentItemIndex + 1];
        return $regions.find(region => region.id === nextItem.regionId);
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

export const _totalRegionsTime = derived(
  [playbackState, currentSetlist, regions, markers],
  ([$playbackState, $currentSetlist, $regions, $markers]) => {
    if ($playbackState.selectedSetlistId && $currentSetlist) {
      // If a setlist is selected, calculate total time from setlist items
      return $currentSetlist.items.reduce((total, item) => {
        const region = $regions.find(r => r.id === item.regionId);
        return total + (region ? getEffectiveRegionLength(region, $markers) : 0);
      }, 0);
    } else {
      // Otherwise, calculate from all regions
      return $regions.reduce((total, region) => total + getEffectiveRegionLength(region, $markers), 0);
    }
  }
);

export const _elapsedTimeBeforeCurrentRegion = derived(
  [currentRegion, playbackState, currentSetlist, regions, markers],
  ([$currentRegion, $playbackState, $currentSetlist, $regions, $markers]) => {
    if (!$currentRegion) return 0;
    
    if ($playbackState.selectedSetlistId && $currentSetlist) {
      // If a setlist is selected, calculate elapsed time from setlist items
      return $currentSetlist.items
        .filter((item, index) => {
          const currentItemIndex = $currentSetlist.items.findIndex(i => i.regionId === $currentRegion.id);
          return currentItemIndex !== -1 && index < currentItemIndex;
        })
        .reduce((total, item) => {
          const region = $regions.find(r => r.id === item.regionId);
          return total + (region ? getEffectiveRegionLength(region, $markers) : 0);
        }, 0);
    } else {
      // Otherwise, calculate from all regions
      return $regions
        .filter(region => $regions.findIndex(r => r.id === region.id) < $regions.findIndex(r => r.id === $currentRegion.id))
        .reduce((total, region) => total + getEffectiveRegionLength(region, $markers), 0);
    }
  }
);

export const _totalElapsedTime = derived(
  [currentRegion, _elapsedTimeBeforeCurrentRegion, _useLocalTimer, _localPosition, playbackState],
  ([$currentRegion, $elapsedTimeBeforeCurrentRegion, $useLocalTimer, $localPosition, $playbackState]) => {
    if (!$currentRegion) return 0;
    return $elapsedTimeBeforeCurrentRegion + Math.max(0, ($useLocalTimer ? $localPosition : $playbackState.currentPosition) - $currentRegion.start);
  }
);

export const _totalRemainingTime = derived(
  [_totalRegionsTime, _totalElapsedTime],
  ([$totalRegionsTime, $totalElapsedTime]) => {
    return $totalRegionsTime - $totalElapsedTime;
  }
);

export const _currentSongTime = derived(
  [currentRegion, _useLocalTimer, _localPosition, playbackState],
  ([$currentRegion, $useLocalTimer, $localPosition, $playbackState]) => {
    if (!$currentRegion) return 0;
    return Math.max(0, ($useLocalTimer ? $localPosition : $playbackState.currentPosition) - $currentRegion.start);
  }
);

export const _songDuration = derived(
  [currentRegion, markers],
  ([$currentRegion, $markers]) => {
    if (!$currentRegion) return 0;
    return getEffectiveRegionLength($currentRegion, $markers);
  }
);

export const _songRemainingTime = derived(
  [_songDuration, _currentSongTime],
  ([$songDuration, $currentSongTime]) => {
    return Math.max(0, $songDuration - $currentSongTime);
  }
);

// Create a store for the current time
export const _currentTime = writable(new Date());