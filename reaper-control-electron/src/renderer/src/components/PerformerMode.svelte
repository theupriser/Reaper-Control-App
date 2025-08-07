<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    regions,
    currentRegion
  } from '../stores/regionStore';
  import {
    playbackState,
    autoplayEnabled,
    countInEnabled
  } from '../stores/playbackStore';
  import {
    markers,
    sortedMarkers,
    getCustomLengthForRegion,
    has1008MarkerInRegion,
    getEffectiveRegionLength
  } from '../stores/markerStore';
  import { currentSetlist } from '../stores/setlistStore';
  import { View, navigateTo } from '../stores/navigationStore';
  import SystemStats from './SystemStats.svelte';
  import {
    // Stores
    currentTime,
    localPosition,
    useLocalTimer,
    atHardStop,
    transportButtonsDisabled,

    // Derived stores
    nextRegion,
    totalRegionsTime,
    totalElapsedTime,
    totalRemainingTime,
    currentSongTime,
    songDuration,
    songRemainingTime,

    // Functions
    formatTime,
    formatLongTime,
    togglePlay,
    nextRegionHandler,
    previousRegionHandler,
    toggleAutoplayHandler as toggleAutoplay,
    toggleCountInHandler as toggleCountIn,
    handleProgressBarClick,
    initializePage,
    updateTimer,
    updateTimerOnRegionChange
  } from '../stores/performerStore';

  import { writable } from 'svelte/store';

  // Track loading state
  const isLoading = writable(true);

  // Initialize the page on mount
  onMount(() => {
    const cleanup = initializePage();

    // Set up an interval to update the current time
    const timeInterval = setInterval(() => {
      currentTime.set(new Date());
    }, 1000);

    // Set loading state to false once we have data
    const unsubscribeRegions = regions.subscribe(value => {
      if (value && value.length > 0) {
        isLoading.set(false);
      }
    });

    // Return a cleanup function
    return () => {
      cleanup();
      clearInterval(timeInterval);
      unsubscribeRegions();
    };
  });

  // Use real data or null if not available
  $: displayRegion = $currentRegion;
  $: displayNextRegion = $nextRegion;
  $: displayMarkers = $markers;

  // Initialize playback position if not available
  $: currentPosition = $useLocalTimer
    ? $localPosition
    : ($playbackState ? $playbackState.currentPosition || 0 : 0);

  // Watch for changes in playback state and current region to update the timer
  $: {
    if ($playbackState || $currentRegion) {
      updateTimer();
    }
  }

  // Watch for changes in the current region to update the timer
  $: if ($currentRegion) {
    updateTimerOnRegionChange();
  }

  // Helper function to check if we have data
  $: hasData = $regions && $regions.length > 0;
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
<div class="performer-mode">
  <div class="current-time">
    <div class="setlist-info">
      {#if $playbackState.selectedSetlistId && $currentSetlist}
        Setlist: {$currentSetlist.name}
      {/if}
    </div>
    <div class="time-display-top">
      <div class="time-and-status">
        {$currentTime.toLocaleTimeString()}
        <div class="performer-status">
          <SystemStats />
        </div>
      </div>
    </div>
  </div>

  <div class="content">
    <div class="current-song">
      <h1>{displayRegion.name}</h1>

      <div class="time-display">
        <div class="song-time">
          <span class="time-label">Song:</span>
          <span class="current-time">{formatTime($currentSongTime || 0)}</span>
          <span class="separator">/</span>
          <span class="total-time">{formatTime($songDuration || (displayRegion.end - displayRegion.start))}</span>
          <span class="remaining-time">({formatTime($songRemainingTime || (displayRegion.end - displayRegion.start))})</span>
        </div>

        <div class="total-time">
          <span class="time-label">Total:</span>
          <span class="current-time">{formatLongTime($totalElapsedTime || 0)}</span>
          <span class="separator">/</span>
          <span class="total-time">{formatLongTime($totalRegionsTime || (displayRegion.end - displayRegion.start + displayNextRegion.end - displayNextRegion.start))}</span>
          <span class="remaining-time">({formatLongTime($totalRemainingTime || (displayRegion.end - displayRegion.start + displayNextRegion.end - displayNextRegion.start))})</span>
        </div>
      </div>

      <!-- Progress bar -->
      <div
        class="progress-container"
        on:click={$transportButtonsDisabled ? null : handleProgressBarClick}
        class:disabled={$transportButtonsDisabled}
      >
        <div
          class="progress-bar"
          style="width: {Math.min(100, Math.max(0, ((currentPosition - displayRegion.start) / ($songDuration || (displayRegion.end - displayRegion.start))) * 100))}%"
        ></div>

        <!-- Markers -->
        {#if displayRegion}
          {#each displayMarkers as marker}
            {#if marker.position >= displayRegion.start && marker.position <= displayRegion.end}
              <div
                class="marker"
                style="left: {((marker.position - displayRegion.start) / ($songDuration || (displayRegion.end - displayRegion.start))) * 100}%"
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
        {/if}
      </div>
    </div>

    <div class="next-song">
      <h2>{displayNextRegion ? `Next: ${displayNextRegion.name}` : 'End of setlist'}</h2>
      <div class="next-song-duration">
        {#if displayNextRegion}
          Duration: {formatTime(displayRegion ? getEffectiveRegionLength(displayNextRegion, displayMarkers) : (displayNextRegion.end - displayNextRegion.start))}
        {:else}
          &nbsp;
        {/if}
      </div>
      {#if $atHardStop && !$playbackState.isPlaying && displayNextRegion}
        <div class="hard-stop-message">Press play to continue</div>
      {/if}
    </div>
  </div>

  <div class="controls">
    <button
      class="control-button previous"
      on:click={previousRegionHandler}
      aria-label="Previous song"
      disabled={$transportButtonsDisabled}
    >
      <svg viewBox="0 0 24 24" width="36" height="36">
        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" fill="currentColor"/>
      </svg>
    </button>

    <button
      class="control-button play-pause"
      on:click={togglePlay}
      aria-label={$playbackState.isPlaying ? "Pause" : "Play"}
      disabled={$transportButtonsDisabled || (!displayNextRegion && !$playbackState.isPlaying && $atHardStop)}
    >
      {#if $playbackState.isPlaying}
        <svg viewBox="0 0 24 24" width="48" height="48">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/>
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" width="48" height="48">
          <path d="M8 5v14l11-7z" fill="currentColor"/>
        </svg>
      {/if}
    </button>

    <button
      class="control-button next"
      on:click={nextRegionHandler}
      aria-label="Next song"
      disabled={$transportButtonsDisabled}
    >
      <svg viewBox="0 0 24 24" width="36" height="36">
        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/>
      </svg>
    </button>
  </div>
  <div class="toggle-container">
    <div class="toggle-item">
      <div
        class="status-indicator {$autoplayEnabled ? 'enabled' : 'disabled'}"
        on:click={$transportButtonsDisabled ? null : toggleAutoplay}
        class:button-disabled={$transportButtonsDisabled}
      >
        Auto-resume: {$autoplayEnabled ? 'ON' : 'OFF'}
      </div>
    </div>
    <div class="toggle-item">
      <div
        class="status-indicator {$countInEnabled ? 'enabled' : 'disabled'}"
        on:click={$transportButtonsDisabled ? null : toggleCountIn}
        class:button-disabled={$transportButtonsDisabled}
      >
        Count-in when pressing marker: {$countInEnabled ? 'ON' : 'OFF'}
      </div>
    </div>
  </div>
  <div class="exit-button-container">
    <button class="exit-button" on:click={() => navigateTo(View.MAIN)}>Exit Performer Mode</button>
  </div>
</div>

<style>
  .performer-mode {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #121212;
    color: white;
    display: flex;
    flex-direction: column;
    padding: 2rem;
    z-index: 1000;
  }

  .current-time {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    font-size: 1.5rem;
    font-family: monospace;
    opacity: 0.7;
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    margin: 0 auto;
    width: 100%;
    max-width: 1200px;
  }

  .current-song {
    margin-bottom: 3rem;
  }

  h1 {
    font-size: 4rem;
    margin: 0 0 1rem 0;
    line-height: 1.2;
    text-align: center;
  }

  .time-display {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1rem;
    font-size: 1.5rem;
    font-family: monospace;
  }

  .song-time, .total-time {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .time-label {
    opacity: 0.7;
    margin-right: 0.5rem;
  }

  .separator {
    opacity: 0.5;
  }

  .remaining-time {
    margin-left: 0.5rem;
    opacity: 0.6;
    color: #aaa;
    font-size: 0.9em;
  }

  .progress-container {
    width: 100%;
    height: 12px;
    background-color: #333;
    border-radius: 6px;
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
    transition: width 0.2s ease-out;
  }

  .marker {
    position: absolute;
    top: -8px;
    width: 4px;
    height: 28px;
    background-color: #FFC107;
    transform: translateX(-50%);
    cursor: pointer;
    z-index: 2;
  }

  .marker:hover {
    width: 6px;
  }

  /* Hard stop marker indicator styles */
  .hard-stop-marker-indicator {
    background-color: #ff5252;
    width: 4px;
    height: 28px;
    top: -8px;
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

  .next-song {
    margin-bottom: 2rem;
    text-align: center;
  }

  h2 {
    font-size: 2.5rem;
    margin: 0 0 0.5rem 0;
    opacity: 0.8;
  }

  .next-song-duration {
    font-size: 1.5rem;
    opacity: 0.6;
  }

  .setlist-info {
    font-size: 1.2rem;
    opacity: 0.7;
    font-style: italic;
  }

  .time-display-top {
    text-align: right;
  }

  .time-and-status {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  .performer-status :global(.system-stats-menu) {
    padding: 0;
  }

  /* Make SystemStats icons bigger in performer mode */
  .performer-status :global(.stats-icon) {
    gap: 8px;
  }

  /* Show CPU usage bar in performer mode with increased size */
  .performer-status :global(.usage-indicator) {
    width: 40px;
    height: 10px;
  }

  /* Increase size of connection dot */
  .performer-status :global(.connection-dot) {
    width: 10px;
    height: 10px;
  }

  /* Increase size of MIDI indicator */
  .performer-status :global(.midi-indicator svg) {
    width: 18px;
    height: 18px;
  }

  /* Increase size of CPU icon */
  .performer-status :global(svg) {
    width: 20px;
    height: 20px;
  }

  .toggle-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .toggle-item {
    display: flex;
    justify-content: center;
    width: 100%;
    max-width: 500px;
  }

  .status-indicator {
    font-size: 1.5rem;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
    transition: transform 0.1s;
    width: 100%;
    text-align: center;
  }

  .status-indicator:active {
    transform: scale(0.98);
  }

  .status-indicator.enabled {
    background-color: rgba(76, 175, 80, 0.2);
    color: #4CAF50;
  }

  .status-indicator.disabled {
    background-color: rgba(244, 67, 54, 0.2);
    color: #f44336;
  }

  /* Disabled button styles */
  .status-indicator.button-disabled {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }

  .hard-stop-message {
    color: #ff5252;
    font-weight: bold;
    margin-top: 0.5rem;
    font-size: 1.2rem;
    animation: blink 1.5s infinite;
  }

  @keyframes blink {
    0% { opacity: 0.7; }
    50% { opacity: 1; }
    100% { opacity: 0.7; }
  }

  .controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 2rem;
    margin-bottom: 2rem;
  }

  .control-button {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    border-radius: 50%;
    transition: background-color 0.2s;
  }

  .control-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  .play-pause {
    background-color: #333;
    width: 100px;
    height: 100px;
    border-radius: 50%;
  }

  .play-pause:hover {
    background-color: #444;
  }

  .play-pause:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: #222;
  }

  .play-pause:disabled:hover {
    background-color: #222;
  }

  .exit-button-container {
    display: flex;
    justify-content: center;
  }

  .exit-button {
    background-color: #333;
    color: white;
    text-decoration: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    font-size: 1rem;
    transition: background-color 0.2s;
    border: none;
    cursor: pointer;
  }

  .exit-button:hover {
    background-color: #444;
  }

  /* Responsive styles */
  @media (max-width: 1024px) {
    h1 {
      font-size: 3rem;
    }

    h2 {
      font-size: 2rem;
    }

    .time-display {
      font-size: 1.2rem;
    }

    .status-indicator {
      font-size: 1.2rem;
    }
  }

  @media (max-width: 768px) {
    .performer-mode {
      padding: 1rem;
    }

    h1 {
      font-size: 2.5rem;
    }

    h2 {
      font-size: 1.5rem;
    }

    .time-display {
      flex-direction: column;
      gap: 0.5rem;
      align-items: center;
    }

    .remaining-time {
      font-size: 0.85em;
      margin-left: 0.3rem;
    }

    .current-time {
      font-size: 1.2rem;
      flex-direction: column;
      align-items: flex-start;
    }

    .time-display-top {
      align-self: flex-end;
      margin-top: 0.5rem;
    }

    .time-and-status {
      gap: 6px;
    }

    .performer-status :global(.system-stats-menu) {
      padding: 0;
    }

    /* Adjust icon sizes for mobile */
    .performer-status :global(.stats-icon) {
      gap: 6px;
    }

    .performer-status :global(.connection-dot) {
      width: 8px;
      height: 8px;
    }

    .performer-status :global(.midi-indicator svg) {
      width: 16px;
      height: 16px;
    }

    .performer-status :global(svg) {
      width: 18px;
      height: 18px;
    }

    .performer-status :global(.usage-indicator) {
      width: 35px;
      height: 8px;
    }

    .play-pause {
      width: 80px;
      height: 80px;
    }
  }

  @media (max-width: 480px) {
    h1 {
      font-size: 2rem;
    }

    h2 {
      font-size: 1.2rem;
    }

    .controls {
      gap: 1rem;
    }

    .play-pause {
      width: 60px;
      height: 60px;
    }
  }
</style>
