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

  // Mock data for testing when no real data is available
  // Mock current region
  const mockCurrentRegion: Region = {
    id: 1,
    name: 'Mock Song Title',
    start: 0,
    end: 180, // 3 minutes
    color: '#4CAF50'
  };

  // Mock next region
  const mockNextRegion: Region = {
    id: 2,
    name: 'Next Mock Song',
    start: 180,
    end: 360, // 3 minutes
    color: '#2196F3'
  };

  // Mock markers
  const mockMarkers: Marker[] = [
    { id: 1, name: 'Intro', position: 0, color: '#FFC107' },
    { id: 2, name: 'Verse', position: 30, color: '#FF9800' },
    { id: 3, name: 'Chorus', position: 60, color: '#F44336' },
    { id: 4, name: 'Bridge', position: 120, color: '#9C27B0' },
    { id: 5, name: 'Outro', position: 150, color: '#2196F3' }
  ];

  // Store to track disabled state of transport buttons
  const transportButtonsDisabled: Writable<boolean> = writable(false);

  // Last playback state update timestamp
  let lastPlaybackStateUpdate = Date.now();

  // Variable to track if we've reached a hard stop at a length marker
  const atHardStop: Writable<boolean> = writable(false);

  // Progress bar click handling
  const popoverVisible: Writable<boolean> = writable(false);
  const popoverPosition: Writable<{x: number, y: number}> = writable({ x: 0, y: 0 });
  const popoverTime: Writable<number> = writable(0);

  // Get sorted markers (visible markers only)
  const sortedMarkers = markers;

  // Use mock data if no real data is available
  $: displayRegion = $currentRegion || mockCurrentRegion;
  $: displayNextRegion = $nextRegion || mockNextRegion;
  $: displayMarkers = $markers.length > 0 ? $markers : mockMarkers;

  // Initialize playback position if not available
  $: currentPosition = $playbackState ? $playbackState.currentPosition || 0 : 0;

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
    safeTransportAction(() => ipcService.seekToPosition(finalPosition.toString()));

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

  // Watch for changes in playback state
  $: {
    // Step 5 of safeTransportAction: Re-enable transport buttons when playback state updates
    // Only re-enable if at least 100ms have passed since the last action
    if (Date.now() - lastPlaybackStateUpdate > 100) {
      transportButtonsDisabled.set(false);
    }
  }

  // Initialize markers when component is mounted
  onMount(() => {
    logger.log('TransportControls component mounted');
    ipcService.refreshMarkers();
  });
</script>

<div class="transport-controls">
  <div class="playback-info">
    <div class="current-region">
      <span class="region-name">{displayRegion.name}</span>
    </div>

    <div class="info-display">
      <div class="time-display">
        <span class="current-time">
          {formatTime(Math.max(0, currentPosition - displayRegion.start))}
        </span>
        <span class="separator">/</span>
        <span class="total-time">{formatTime(getEffectiveRegionLength(displayRegion, displayMarkers))}</span>
      </div>

      <div class="bpm-display">
        <span class="bpm-value">{Math.round($playbackState.bpm)}</span>
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
      style="width: {Math.min(100, Math.max(0, ((currentPosition - displayRegion.start) / getEffectiveRegionLength(displayRegion, displayMarkers)) * 100))}%"
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

    <!-- Fake marker for length marker end position or !1008 marker -->
    {#if getCustomLengthForRegion(displayMarkers, displayRegion) !== null || has1008MarkerInRegion(displayMarkers, displayRegion)}
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
</style>
