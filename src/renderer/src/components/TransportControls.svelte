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
    recordingArmed,
    markers,
    sortedMarkers,
    getEffectiveRegionLength,
    getCustomLengthForRegion,
    has1008MarkerInRegion,
  } from '../stores';
  import { toggleRecordingArmed } from '../stores/playbackStore';
  import ipcService from '../services/ipcService';
  import logger from '../lib/utils/logger';
  import { onMount } from 'svelte';
  import {
    // Functions
    safeTransportAction,
    togglePlay,
    nextRegionHandler,
    previousRegionHandler,
    toggleAutoplayHandler,
    toggleCountInHandler,
    handleProgressBarClickWithPopover,
    updateTimer,
    updateTimerOnRegionChange,
    stopLocalTimer,

    // Stores
    transportButtonsDisabled,
    localPosition,
    useLocalTimer,
    atHardStop,
    songDuration,

    // Setlist-aware stores for region navigation
    nextRegion,
    previousRegion
  } from '../services/transportService';
  import { formatTime } from '../lib/utils/timeUtils';

  // UI state management
  import {
    isLoading,
    popoverVisible,
    popoverPosition,
    popoverTime,
    initializeLoadingState,
    showPopover,
    calculatePopoverPosition
  } from '../services/uiStateService';

  // Use real data or null if not available
  $: displayRegion = $currentRegion;
  $: displayNextRegion = $nextRegion;
  $: displayPreviousRegion = $previousRegion;
  $: displayMarkers = $sortedMarkers; // Use sortedMarkers to filter out command-only markers

  // Calculate region duration for display (locally, not from the store)
  $: displaySongDuration = displayRegion ? getEffectiveRegionLength(displayRegion, $markers) : 0;


  // Initialize playback position if not available
  $: currentPosition = $useLocalTimer ? $localPosition : ($playbackState ? $playbackState.currentPosition || 0 : 0);

  // Helper function to check if we have data
  $: hasData = $sortedMarkers && $sortedMarkers.length > 0;

  // Toggle autoplay function
  function handleToggleAutoplay(): void {
    toggleAutoplayHandler();
  }

  // Toggle count-in function
  function handleToggleCountIn(): void {
    toggleCountInHandler();
  }

  // Toggle recording armed function
  function handleToggleRecordingArmed(): void {
    toggleRecordingArmed();
  }

  // Enhanced progress bar click handling with popover, using the service
  function handleProgressBarClickWithPopoverUI(event: MouseEvent): void {
    // Use the transportService's handleProgressBarClickWithPopover function
    // Pass the showPopover and calculatePopoverPosition functions from uiStateService
    handleProgressBarClickWithPopover(
      event,
      showPopover,
      calculatePopoverPosition
    );
  }

  // Watch for changes in playback state and current region
  $: {
    if ($playbackState || $currentRegion) {
      updateTimer();
    }
  }

  // Watch for changes in the current region
  $: if ($currentRegion) {
    updateTimerOnRegionChange();
  }

  // Initialize component when mounted
  onMount(() => {
    // Initialize loading state and get cleanup function
    const { unsubscribe: unsubscribeLoading } = initializeLoadingState();

    // No need to refresh markers and regions here as App.svelte already does this
    // This avoids duplicate API calls

    // Return a cleanup function for all resources
    return () => {
      unsubscribeLoading();
      stopLocalTimer();
    };
  });
</script>

{#if $isLoading}
  <div class="loading-container">
    <div class="loading-spinner"></div>
    <p>Loading data from REAPER...</p>
  </div>
{:else if !hasData}
  <div class="no-data-container">
    <p>No markers or regions found in REAPER project.</p>
    <p>Please create regions in your REAPER project to use this application.</p>
    <button class="retry-button" on:click={() => {
      isLoading.set(true);
      // Use the same delay pattern for the retry button
      setTimeout(() => {
        try {
          ipcService.refreshMarkers();
          ipcService.refreshRegions();
        } catch (error) {
          logger.error('Error refreshing data:', error);
          isLoading.set(false);
        }
      }, 2000); // 2 second delay to ensure IPC handlers are registered
    }}>
      Retry
    </button>
  </div>
{/if}

<div class="transport-controls" class:hidden={$isLoading || !hasData}>
  <div class="playback-info">
    <div class="current-region">
      <div class="toggle-item justify-start">
        <label class="toggle-switch record-button" for="record-toggle">
          <input
            id="record-toggle"
            type="checkbox"
            checked={$recordingArmed}
            on:change={handleToggleRecordingArmed}
            disabled={$transportButtonsDisabled}
          />
          <span class="toggle-slider record-slider" class:active={$recordingArmed}></span>
        </label>
        <label class="toggle-label" for="record-toggle">Arm Recording</label>
      </div>
      <span class="region-name">{displayRegion ? displayRegion.name : 'No region selected'}</span>
    </div>

    <div class="info-display">
      <div class="time-display">
        <span class="current-time">
          {displayRegion ? formatTime(Math.max(0, currentPosition - displayRegion.start)) : '--:--'}
        </span>
        <span class="separator">/</span>
        <span class="total-time">{displayRegion ? formatTime($songDuration) : '--:--'}</span>
      </div>

      <div class="bpm-display">
        <span class="bpm-value">{$playbackState ? Math.round($playbackState.bpm) : '--'}</span>
        <span class="bpm-label">BPM</span>
      </div>
    </div>
  </div>

  <!-- Progress bar -->
  <div class="progress-container"
    on:click={$transportButtonsDisabled ? null : handleProgressBarClickWithPopoverUI}
    class:disabled={$transportButtonsDisabled}>
    <div
      class="progress-bar"
      style="width: {displayRegion ? Math.min(100, Math.max(0, ((currentPosition - displayRegion.start) / displaySongDuration) * 100)) : 0}%"
    ></div>

    <!-- Hard stop message -->
    {#if $atHardStop && !$playbackState.isPlaying && displayNextRegion && $useLocalTimer}
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
            style="left: {((marker.position - displayRegion.start) / $songDuration) * 100}%"
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
    {#if displayRegion && (getCustomLengthForRegion(displayRegion, $markers) !== null || has1008MarkerInRegion($markers, displayRegion))}
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
        style="left: {$popoverPosition.x}px; top: 0"
      >
        {formatTime($popoverTime)}
      </div>
    {/if}
  </div>

  <div class="toggle-container">
    <div class="toggle-item">
      <label class="toggle-switch">
        <input
          id="autoplay-toggle"
          type="checkbox"
          checked={$autoplayEnabled}
          on:change={handleToggleAutoplay}
          disabled={$transportButtonsDisabled}
        />
        <span class="toggle-slider"></span>
      </label>
      <label class="toggle-label" for="autoplay-toggle">Auto-resume playback</label>
    </div>

    <div class="toggle-item">
      <label class="toggle-switch">
        <input
          id="count-in-toggle"
          type="checkbox"
          checked={$countInEnabled}
          on:change={handleToggleCountIn}
          disabled={$transportButtonsDisabled}
        />
        <span class="toggle-slider"></span>
      </label>
      <label class="toggle-label" for="count-in-toggle">Count-in when pressing marker</label>
    </div>
  </div>

  <div class="controls">
    <button
      class="control-button previous"
      on:click={previousRegionHandler}
      aria-label="Previous region"
      disabled={$transportButtonsDisabled || !displayRegion || !displayPreviousRegion}
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
      on:click={togglePlay}
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
      on:click={nextRegionHandler}
      aria-label="Next region"
      disabled={$transportButtonsDisabled || !displayNextRegion}
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
    margin-top: 1rem;
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

  .region-name {
    font-weight: bold;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    margin-top: 15px;
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

  .toggle-item.justify-start {
    justify-content: flex-start;
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
    cursor: pointer;
  }

  /* Record button styling */
  .toggle-switch.record-button .toggle-slider {
    border-radius: 50%; /* Make it round */
    background-color: #666;
  }

  .toggle-switch.record-button .toggle-slider.active {
    background-color: #ff0000; /* Red when active */
    box-shadow: 0 0 5px rgba(255, 0, 0, 0.7), 0 0 10px rgba(255, 0, 0, 0.5); /* Glowing effect */
  }

  /* Customize the record button appearance */
  .toggle-switch.record-button {
    display: block;
    width: 20px;
    height: 20px;
  }

  .toggle-switch.record-button input:checked + .toggle-slider:before {
    transform: translateX(0); /* Don't move the circle on toggle */
    opacity: 0; /* Hide the slider thumb */
  }

  /* Add this rule to hide the white dot for record button in OFF state */
  .toggle-switch.record-button .toggle-slider:before {
    opacity: 0; /* Hide the slider thumb for record button regardless of state */
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

  .control-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .control-button:disabled:hover {
    background-color: transparent;
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

  .retry-button {
    margin-top: 1rem;
    padding: 0.5rem 1.5rem;
    background-color: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .retry-button:hover {
    background-color: #45a049;
  }

  .retry-button:active {
    background-color: #3d8b40;
  }

  /* Hide transport controls when loading or no data */
  .transport-controls.hidden {
    display: none;
  }
</style>
