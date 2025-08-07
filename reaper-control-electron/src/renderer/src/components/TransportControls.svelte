<script lang="ts">
  /**
   * TransportControls Component
   *
   * This component provides playback controls for Reaper DAW.
   *
   * IMPORTANT: To prevent the application from freezing when buttons are clicked rapidly,
   * all transport actions are protected by the safeTransportAction function which:
   * 1. Disables all transport controls immediately after a click
   * 2. Executes the requested action
   * 3. Re-enables controls only after receiving a playback state update from the backend
   * 4. Has a safety timeout to re-enable controls after 2 seconds if no update is received
   *
   * This prevents race conditions that can occur when multiple commands are sent to Reaper
   * in rapid succession before the previous command has been processed.
   */
  import {
    playbackState,
    currentRegion,
    autoplayEnabled,
    countInEnabled,
    markers,
    nextRegion,
    getEffectiveRegionLength,
    getCustomLengthForRegion,
    has1008MarkerInRegion,
    type Region,
    type Marker
  } from '../stores';
  import ipcService from '../services/ipcService';
  import logger from '../lib/utils/logger';
  import { writable, type Writable } from 'svelte/store';
  import { onMount, onDestroy } from 'svelte';

  // Track loading state
  const isLoading: Writable<boolean> = writable(true);

  // Store to track disabled state of transport buttons
  const transportButtonsDisabled: Writable<boolean> = writable(false);

  // Last playback state update timestamp
  let lastPlaybackStateUpdate = Date.now();

  // Local timer state
  let localTimer: NodeJS.Timeout | null = null;
  let localPosition: Writable<number> = writable(0);
  let useLocalTimer: Writable<boolean> = writable(false);
  let timerStartTime = 0;
  let timerStartPosition = 0;

  // Variable to track if we've reached a hard stop at a length marker
  const atHardStop: Writable<boolean> = writable(false);

  // Progress bar click handling
  const popoverVisible: Writable<boolean> = writable(false);
  const popoverPosition: Writable<{x: number, y: number}> = writable({ x: 0, y: 0 });
  const popoverTime: Writable<number> = writable(0);

  // Get sorted markers (visible markers only)
  const sortedMarkers = markers;

  // Store previous playback state to detect significant changes
  let previousPlaybackPosition = 0;
  let previousPlaybackIsPlaying = false;

  // Store previous region ID to detect actual region changes
  let previousRegionId: string | null = null;

  // Set up loading state handling
  onMount(() => {
    // Set loading state to false once we have data
    const unsubscribeRegions = markers.subscribe(value => {
      if (value && value.length > 0) {
        isLoading.set(false);
      }
    });

    return () => {
      unsubscribeRegions();
    };
  });

  // Use real data or null if not available
  $: displayRegion = $currentRegion;
  $: displayNextRegion = $nextRegion;
  $: displayMarkers = $markers;

  // Initialize playback position if not available
  $: currentPosition = $useLocalTimer ? $localPosition : ($playbackState ? $playbackState.currentPosition || 0 : 0);

  // Helper function to check if we have data
  $: hasData = $markers && $markers.length > 0;

  /**
   * Safely execute a transport control function with button disabling
   * This prevents multiple rapid clicks from causing the application to freeze
   *
   * @param actionFn - The transport control function to execute
   * @param args - Arguments to pass to the function
   */
  function safeTransportAction(actionFn: Function, ...args: any[]): void {
    // Step 1: Disable all transport buttons
    transportButtonsDisabled.set(true);

    // Step 2: Execute the transport action
    actionFn(...args);

    // Step 3: Store the current timestamp when the action was triggered
    lastPlaybackStateUpdate = Date.now();

    // Step 4: Set a safety timeout to re-enable buttons after a maximum wait time
    setTimeout(() => {
      transportButtonsDisabled.set(false);
    }, 2000); // 2 seconds maximum wait time
  }

  // Format time in seconds to MM:SS format
  function formatTime(seconds: number | undefined | null): string {
    if (seconds === undefined || seconds === null) return '--:--';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Toggle autoplay function
  function toggleAutoplay(): void {
    logger.log('Toggling autoplay');
    safeTransportAction(() => {
      // This will be implemented with IPC
      // For now, just toggle the store directly
      autoplayEnabled.update(value => !value);
    });
  }

  // Toggle count-in function
  function toggleCountIn(): void {
    logger.log('Toggling count-in');
    safeTransportAction(() => {
      // This will be implemented with IPC
      // For now, just toggle the store directly
      countInEnabled.update(value => !value);
    });
  }

  // Function to start the local timer
  function startLocalTimer(startPosition: number): void {
    // Clear any existing timer
    if (localTimer) {
      clearInterval(localTimer);
    }

    // Set the start time and position
    timerStartTime = Date.now();
    timerStartPosition = startPosition;

    // Initialize the local position to match the current playback position
    // This ensures a smooth transition when the local timer takes over
    localPosition.set(startPosition);

    // Start the timer
    localTimer = setInterval(() => {
      // Calculate the elapsed time
      const elapsed = (Date.now() - timerStartTime) / 1000;

      // Calculate the current position
      const currentPos = timerStartPosition + elapsed;

      // Update the local position
      localPosition.set(currentPos);

      // Check if we've reached the end of the length marker or if we have a !1008 marker
      if ($currentRegion) {
        const customLength = getCustomLengthForRegion($markers, $currentRegion);
        const has1008Marker = has1008MarkerInRegion($markers, $currentRegion);

        // For length markers, set the hard stop flag but continue the timer
        if (has1008Marker && (customLength !== null && (currentPos - $currentRegion.start) >= customLength)) {
          // Set the hard stop flag
          atHardStop.set(true);

          // When hard stop is reached, we should stop at the fake hard stop marker
          // which is at the end of the custom length
          const hardStopPosition = $currentRegion.start + customLength;
          localPosition.set(hardStopPosition);
        }
      }
    }, 100); // Update every 100ms for smooth display
  }

  // Function to stop the local timer
  function stopLocalTimer(): void {
    if (localTimer) {
      clearInterval(localTimer);
      localTimer = null;
    }
  }

  // Function to find the length marker in the current region
  function findLengthMarkerInRegion(markerList: Marker[], region: Region): Marker | null {
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

  // Helper function to extract length from marker name
  function extractLengthFromMarker(name: string): number | null {
    const lengthMatch = name.match(/!length:(\d+(\.\d+)?)/);
    return lengthMatch ? parseFloat(lengthMatch[1]) : null;
  }

  // Progress bar click handling
  function handleProgressBarClick(event: MouseEvent): void {
    if (!$currentRegion) return;

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

    // Find markers within the current region
    const markersInRegion = $markers.filter(marker =>
      marker.position >= $currentRegion!.start &&
      marker.position <= $currentRegion!.end
    );

    // Check if click is near any marker
    for (const marker of markersInRegion) {
      // Calculate marker's pixel position in the progress bar
      const regionDuration = getEffectiveRegionLength($currentRegion!, $markers);
      const markerPercentage = (marker.position - $currentRegion!.start) / regionDuration;
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
      const regionDuration = getEffectiveRegionLength($currentRegion!, $markers);
      finalPosition = $currentRegion!.start + (percentage * regionDuration);
    }

    // Calculate popover position, ensuring it stays within viewport
    let popoverX = clickX;

    // Ensure popover doesn't go off the left or right edge
    // Assuming popover width is about 60px
    const popoverWidth = 60;
    const minX = popoverWidth / 2;
    const maxX = containerWidth - (popoverWidth / 2);

    if (popoverX < minX) popoverX = minX;
    if (popoverX > maxX) popoverX = maxX;

    // Set the popover position and time
    popoverPosition.set({
      x: popoverX,
      y: rect.top - 30 // Position above the progress bar
    });
    popoverTime.set(finalPosition - $currentRegion!.start); // Time relative to region start
    popoverVisible.set(true);

    // Seek to the position (either marker position or calculated position)
    // Pass isNearMarker flag to indicate whether the click was on a marker
    safeTransportAction(() => ipcService.seekToPosition(finalPosition.toString(), isNearMarker));

    // Check if we should use the local timer based on the position
    const customLength = getCustomLengthForRegion($markers, $currentRegion!);
    if (customLength !== null) {
      // Find the actual length marker to get its position
      const lengthMarker = findLengthMarkerInRegion($markers, $currentRegion!);

      if (lengthMarker && finalPosition >= lengthMarker.position) {
        // Position is past the length marker, use local timer
        const wasUsingLocalTimer = $useLocalTimer;
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
    const has1008Marker = has1008MarkerInRegion($markers, $currentRegion!);
    if (has1008Marker) {
      // Calculate if the seek position is at the end of the region
      const regionEnd = $currentRegion!.end;
      const isAtEnd = Math.abs(finalPosition - regionEnd) < 0.5;

      // Calculate if the seek position is near the end (within 99% of region length)
      const regionLength = $currentRegion!.end - $currentRegion!.start;
      const positionInRegion = finalPosition - $currentRegion!.start;
      const isNearEnd = positionInRegion / regionLength > 0.99;

      // Only set atHardStop to true if we're at or near the end
      if (isAtEnd || isNearEnd) {
        atHardStop.set(true);
      } else {
        // If we're seeking to a position before the end, reset the hard stop flag
        atHardStop.set(false);
      }
    }

    // Hide the popover after 2 seconds
    setTimeout(() => {
      popoverVisible.set(false);
    }, 2000);
  }

  // Watch for changes in playback state and current region
  $: {
    if ($currentRegion) {
      const customLength = getCustomLengthForRegion($markers, $currentRegion);

      // If there's a length marker, check if we should use the local timer
      if (customLength !== null) {
        // Find the actual length marker to get its position
        const lengthMarker = findLengthMarkerInRegion($markers, $currentRegion);

        if (lengthMarker) {
          // Only start the timer if playback position has passed the marker position
          if ($playbackState.currentPosition >= lengthMarker.position) {
            // Check if we're transitioning from regular playback to local timer
            const wasUsingLocalTimer = $useLocalTimer;

            // Set the flag to use local timer
            useLocalTimer.set(true);

            // If we're just transitioning to local timer or the timer isn't running, start it
            if (!wasUsingLocalTimer || !localTimer) {
              // Initialize with current playback position for smooth transition
              startLocalTimer($playbackState.currentPosition);
            } else {
              // Only restart timer if position changed significantly (e.g., due to seeking)
              // We don't restart on play/pause changes since timer should continue regardless
              const positionChanged = Math.abs($playbackState.currentPosition - previousPlaybackPosition) > 0.5;

              if (positionChanged) {
                startLocalTimer($playbackState.currentPosition);
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
        const has1008Marker = has1008MarkerInRegion($markers, $currentRegion);

        if (has1008Marker) {
          // If we have a !1008 marker and we're at the end of the region, set hard stop flag
          const regionEnd = $currentRegion.end;
          // Increase the tolerance to 0.5 seconds to be more lenient
          const isAtEnd = Math.abs($playbackState.currentPosition - regionEnd) < 0.5;
          // Also check if we're very close to the end (within 99% of region length)
          const regionLength = $currentRegion.end - $currentRegion.start;
          const positionInRegion = $playbackState.currentPosition - $currentRegion.start;
          const isNearEnd = positionInRegion / regionLength > 0.99;

          // Set hard stop if we're at the end OR near the end, and not playing
          if ((isAtEnd || isNearEnd) && !$playbackState.isPlaying) {
            // We're at the end of the region with a !1008 marker and not playing, set hard stop flag
            atHardStop.set(true);
          } else if ($playbackState.isPlaying) {
            // If we're playing, reset the hard stop flag
            atHardStop.set(false);
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
    if ($playbackState.isPlaying && !previousPlaybackIsPlaying) {
      atHardStop.set(false);
    }

    // Update previous state values
    previousPlaybackPosition = $playbackState.currentPosition;
    previousPlaybackIsPlaying = $playbackState.isPlaying;

    // Step 5 of safeTransportAction: Re-enable transport buttons when playback state updates
    // Only re-enable if at least 100ms have passed since the last action
    if (Date.now() - lastPlaybackStateUpdate > 100) {
      transportButtonsDisabled.set(false);
    }
  }

  // Watch for changes in the current region
  $: if ($currentRegion) {
    // Only reset timer if the region ID actually changed
    if (previousRegionId !== $currentRegion.id) {
      previousRegionId = $currentRegion.id;

      // Check if the new region has a length marker
      const customLength = getCustomLengthForRegion($markers, $currentRegion);
      if (customLength !== null) {
        // Find the actual length marker to get its position
        const lengthMarker = findLengthMarkerInRegion($markers, $currentRegion);

        if (lengthMarker && $playbackState.currentPosition >= lengthMarker.position) {
          // Check if we're transitioning from regular playback to local timer
          const wasUsingLocalTimer = $useLocalTimer;

          // Set the flag to use local timer
          useLocalTimer.set(true);

          // Initialize with current playback position for smooth transition
          localPosition.set($playbackState.currentPosition);
          startLocalTimer($playbackState.currentPosition);
        } else {
          // Playback hasn't reached the length marker yet
          useLocalTimer.set(false);
          stopLocalTimer();
        }
      } else {
        useLocalTimer.set(false);
        stopLocalTimer();
      }
    }
  }

  // Initialize markers when component is mounted
  onMount(() => {
    logger.log('TransportControls component mounted');
    ipcService.refreshMarkers();
  });

  // Clean up the timer when the component is destroyed
  onDestroy(() => {
    stopLocalTimer();
  });
</script>

{#if $isLoading}
  <div class="loading-container">
    <div class="loading-spinner"></div>
    <p>Loading data from REAPER...</p>
  </div>
{:else if !hasData}
  <div class="no-data-container">
    <p>No regions found in REAPER project.</p>
    <p>Please create regions in your REAPER project to use this application.</p>
  </div>
{/if}

<div class="transport-controls" class:hidden={$isLoading || !hasData}>
  <div class="playback-info">
    <div class="current-region">
      <span class="region-name">{displayRegion ? displayRegion.name : 'No region selected'}</span>
    </div>

    <div class="info-display">
      <div class="time-display">
        <span class="current-time">
          {displayRegion ? formatTime(Math.max(0, currentPosition - displayRegion.start)) : '--:--'}
        </span>
        <span class="separator">/</span>
        <span class="total-time">{displayRegion ? formatTime(getEffectiveRegionLength(displayRegion, displayMarkers)) : '--:--'}</span>
      </div>

      <div class="bpm-display">
        <span class="bpm-value">{$playbackState ? Math.round($playbackState.bpm) : '--'}</span>
        <span class="bpm-label">BPM</span>
      </div>
    </div>
  </div>

  <!-- Progress bar -->
  <div class="progress-container"
    on:click={$transportButtonsDisabled ? null : handleProgressBarClick}
    class:disabled={$transportButtonsDisabled}>
    <div
      class="progress-bar"
      style="width: {displayRegion ? Math.min(100, Math.max(0, ((currentPosition - displayRegion.start) / getEffectiveRegionLength(displayRegion, displayMarkers)) * 100)) : 0}%"
    ></div>

    <!-- Hard stop message -->
    {#if $atHardStop && !$playbackState.isPlaying && displayNextRegion}
      <div class="hard-stop-marker">
        <div class="hard-stop-message">
          Press play to continue
        </div>
      </div>
    {/if}

    <!-- Markers -->
    {#if displayRegion}
      {#each displayMarkers as marker}
        {#if marker.position >= displayRegion.start && marker.position <= displayRegion.end}
          <div
            class="marker"
            style="left: {((marker.position - displayRegion.start) / getEffectiveRegionLength(displayRegion, displayMarkers)) * 100}%"
            title={marker.name}
          >
            <div class="marker-tooltip">
              {marker.name}
            </div>
          </div>
        {/if}
      {/each}
    {/if}

    <!-- Fake marker for length marker end position or !1008 marker -->
    {#if displayRegion && (getCustomLengthForRegion(displayMarkers, displayRegion) !== null || has1008MarkerInRegion(displayMarkers, displayRegion))}
      <div
        class="marker hard-stop-marker-indicator"
        style="left: 100%"
        title="Hard stop point"
      >
        <div class="marker-tooltip">
          Hard stop point
        </div>
      </div>
    {/if}

    <!-- Time popover -->
    {#if $popoverVisible}
      <div
        class="time-popover"
        style="left: {$popoverPosition.x}px; top: {$popoverPosition.y}px"
      >
        {formatTime($popoverTime)}
      </div>
    {/if}
  </div>

  <div class="toggle-container">
    <div class="toggle-item">
      <label class="toggle-switch">
        <input
          type="checkbox"
          checked={$autoplayEnabled}
          on:change={toggleAutoplay}
          disabled={$transportButtonsDisabled}
        />
        <span class="toggle-slider"></span>
      </label>
      <span class="toggle-label">Auto-resume playback</span>
    </div>

    <div class="toggle-item">
      <label class="toggle-switch">
        <input
          type="checkbox"
          checked={$countInEnabled}
          on:change={toggleCountIn}
          disabled={$transportButtonsDisabled}
        />
        <span class="toggle-slider"></span>
      </label>
      <span class="toggle-label">Count-in when pressing marker</span>
    </div>
  </div>

  <div class="controls">
    <button
      class="control-button previous"
      on:click={() => safeTransportAction(() => ipcService.previousRegion())}
      aria-label="Previous region"
      disabled={$transportButtonsDisabled}
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" fill="currentColor"/>
      </svg>
    </button>

    <button
      class="control-button restart"
      on:click={() => safeTransportAction(() => ipcService.seekToCurrentRegionStart())}
      aria-label="Restart current region"
      disabled={$transportButtonsDisabled}
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M12 5V1L7 6l5 5V7c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z" fill="currentColor"/>
      </svg>
    </button>

    <button
      class="control-button play-pause"
      on:click={() => safeTransportAction(() => ipcService.togglePlay())}
      aria-label={$playbackState.isPlaying ? "Pause" : "Play"}
      disabled={$transportButtonsDisabled || (!displayNextRegion && !$playbackState.isPlaying && $atHardStop)}
    >
      {#if $playbackState.isPlaying}
        <svg viewBox="0 0 24 24" width="32" height="32">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/>
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" width="32" height="32">
          <path d="M8 5v14l11-7z" fill="currentColor"/>
        </svg>
      {/if}
    </button>

    <button
      class="control-button next"
      on:click={() => safeTransportAction(() => ipcService.nextRegion())}
      aria-label="Next region"
      disabled={$transportButtonsDisabled}
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/>
      </svg>
    </button>

    <button
      class="control-button refresh"
      on:click={() => safeTransportAction(() => ipcService.refreshRegions())}
      aria-label="Refresh regions"
      disabled={$transportButtonsDisabled}
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .transport-controls {
    background-color: #2a2a2a;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .playback-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .current-region {
    font-size: 1.2rem;
    font-weight: bold;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .info-display {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.3rem;
  }

  .time-display {
    font-family: monospace;
    font-size: 1rem;
  }

  .bpm-display {
    display: inline;
    align-items: center;
    gap: 0.3rem;
  }

  .bpm-value {
    font-family: monospace;
    font-size: 1rem;
    font-weight: bold;
    color: #4CAF50;
  }

  .bpm-label {
    font-size: 0.8rem;
    opacity: 0.7;
    text-transform: uppercase;
  }

  .separator {
    margin: 0 0.3rem;
    opacity: 0.7;
  }

  /* Progress bar styles */
  .progress-container {
    width: 100%;
    height: 6px;
    background-color: #4a4a4a;
    border-radius: 3px;
    margin: 10px 0 20px 0;
    overflow: visible;
    position: relative;
    cursor: pointer;
    transition: opacity 0.2s ease-out;
  }

  /* Disabled progress container */
  .progress-container.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .progress-bar {
    height: 100%;
    background-color: #4CAF50;
    border-radius: 3px;
    transition: width 0.2s ease-out;
  }

  /* Marker styles */
  .marker {
    position: absolute;
    top: -5px;
    width: 3px;
    height: 16px;
    background-color: #FFC107;
    transform: translateX(-50%);
    z-index: 5;
    cursor: pointer;
  }

  .marker:hover {
    width: 5px;
  }

  /* Hard stop marker indicator styles */
  .hard-stop-marker-indicator {
    background-color: #ff5252;
    width: 4px;
    height: 20px;
    top: -7px;
  }

  .hard-stop-marker-indicator:hover {
    width: 6px;
  }

  .marker-tooltip {
    position: absolute;
    top: -30px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
    z-index: 10;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
  }

  .marker:hover .marker-tooltip {
    opacity: 1;
  }

  .marker-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -5px;
    border-width: 5px;
    border-style: solid;
    border-color: rgba(0, 0, 0, 0.8) transparent transparent transparent;
  }

  /* Hard stop marker styles */
  .hard-stop-marker {
    position: absolute;
    top: -40px;
    right: 0;
    width: auto;
    z-index: 10;
  }

  .hard-stop-message {
    background-color: #ff5252;
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: bold;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% { opacity: 0.7; }
    50% { opacity: 1; }
    100% { opacity: 0.7; }
  }

  /* Time popover styles */
  .time-popover {
    position: absolute;
    background-color: #333;
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-family: monospace;
    transform: translate(-50%, -100%);
    z-index: 10;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
    animation: fadeIn 0.2s ease-out;
  }

  .time-popover::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -5px;
    border-width: 5px;
    border-style: solid;
    border-color: #333 transparent transparent transparent;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translate(-50%, -90%); }
    to { opacity: 1; transform: translate(-50%, -100%); }
  }

  /* Toggle container styles */
  .toggle-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .toggle-item {
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 40px;
    height: 20px;
    margin-right: 8px;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #4a4a4a;
    transition: .4s;
    border-radius: 20px;
  }

  .toggle-slider:before {
    position: absolute;
    content: "";
    height: 16px;
    width: 16px;
    left: 2px;
    bottom: 2px;
    background-color: white;
    transition: .4s;
    border-radius: 50%;
  }

  input:checked + .toggle-slider {
    background-color: #4CAF50;
  }

  input:checked + .toggle-slider:before {
    transform: translateX(20px);
  }

  /* Disabled toggle switch styles */
  input:disabled + .toggle-slider {
    opacity: 0.6;
    cursor: not-allowed;
  }

  input:disabled + .toggle-slider:before {
    background-color: #ccc;
  }

  .toggle-label {
    font-size: 0.9rem;
    color: #ddd;
  }

  .controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
  }

  .control-button {
    background: none;
    border: none;
    color: #ffffff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    border-radius: 50%;
    transition: background-color 0.2s;
  }

  .control-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  .control-button:active {
    background-color: rgba(255, 255, 255, 0.2);
  }

  .play-pause {
    background-color: #4a4a4a;
    width: 60px;
    height: 60px;
    border-radius: 50%;
  }

  .play-pause:hover {
    background-color: #5a5a5a;
  }

  .play-pause:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: #3a3a3a;
  }

  .play-pause:disabled:hover {
    background-color: #3a3a3a;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .playback-info {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .info-display {
      width: 100%;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    }

    .progress-container {
      height: 5px;
      margin-bottom: 0.8rem;
    }

    .time-popover {
      padding: 3px 6px;
      font-size: 0.7rem;
    }

    .toggle-container {
      margin-top: 0.5rem;
    }

    .toggle-item {
      justify-content: flex-start;
    }

    .toggle-label {
      font-size: 0.8rem;
    }

    .controls {
      gap: 0.5rem;
    }

    .play-pause {
      width: 50px;
      height: 50px;
    }

    .bpm-value {
      font-size: 0.9rem;
    }

    .bpm-label {
      font-size: 0.7rem;
    }
  }

  @media (max-width: 480px) {
    .progress-container {
      height: 8px; /* Make the touch target larger on mobile */
      margin-bottom: 0.6rem;
    }

    .progress-bar {
      height: 4px;
      margin-top: 2px; /* Center the bar in the container */
    }
  }

  /* Loading and no-data states */
  .loading-container, .no-data-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 200px;
    text-align: center;
    padding: 2rem;
    color: #aaa;
  }

  .loading-spinner {
    border: 4px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    border-top: 4px solid #4CAF50;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .no-data-container p {
    margin: 0.5rem 0;
    font-size: 1rem;
  }

  .no-data-container p:first-child {
    font-weight: bold;
    font-size: 1.2rem;
    margin-bottom: 1rem;
  }

  /* Hide transport controls when loading or no data */
  .transport-controls.hidden {
    display: none;
  }
</style>
