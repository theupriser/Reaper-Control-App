<script>
  import { onMount, onDestroy } from 'svelte';
  import { 
    regions, 
    currentRegion, 
    playbackState, 
    autoplayEnabled,
    countInEnabled,
    currentSetlist,
    sortedMarkers
  } from '$lib/stores';
  import { markers, has1008MarkerInRegion, getCustomLengthForRegion, getEffectiveRegionLength } from '$lib/stores/markerStore';
  import { 
    // Stores
    _localPosition as localPosition,
    _useLocalTimer as useLocalTimer,
    _atHardStop as atHardStop,
    _currentTime as currentTime,
    
    // Derived stores
    _nextRegion as nextRegion,
    _totalRegionsTime as totalRegionsTime,
    _totalElapsedTime as totalElapsedTime,
    _totalRemainingTime as totalRemainingTime,
    _currentSongTime as currentSongTime,
    _songDuration as songDuration,
    _songRemainingTime as songRemainingTime,
    
    // Functions
    _formatTime as formatTime,
    _formatLongTime as formatLongTime,
    _togglePlay as togglePlay,
    _nextRegionHandler as nextRegionHandler,
    _previousRegionHandler as previousRegionHandler,
    _toggleAutoplay as toggleAutoplay,
    _toggleCountIn as toggleCountIn,
    _handleProgressBarClick as handleProgressBarClick,
    _initializePage as initializePage,
    _updateTimer as updateTimer,
    _updateTimerOnRegionChange as updateTimerOnRegionChange
  } from './+page.js';
  
  // Initialize the page on mount
  onMount(() => {
    const cleanup = initializePage();
    
    // Set up an interval to update the current time
    const timeInterval = setInterval(() => {
      currentTime.set(new Date());
    }, 1000);
    
    // Return a cleanup function
    return () => {
      cleanup();
      clearInterval(timeInterval);
    };
  });
  
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
</script>

<svelte:head>
  <title>Performer Mode | Reaper Control | </title>
</svelte:head>

<div class="performer-mode">
  <div class="current-time">
    {#if $playbackState.selectedSetlistId && $currentSetlist}
      <div class="setlist-info">
        Setlist: {$currentSetlist.name}
      </div>
    {/if}
    <div class="time-display-top">
      {$currentTime.toLocaleTimeString()}
    </div>
  </div>
  
  <div class="content">
    <div class="current-song">
      <h1>{$currentRegion ? $currentRegion.name : 'No song selected'}</h1>
      
      <div class="time-display">
        <div class="song-time">
          <span class="time-label">Song:</span>
          <span class="current-time">{formatTime($currentSongTime)}</span>
          <span class="separator">/</span>
          <span class="total-time">{formatTime($songDuration)}</span>
          <span class="remaining-time">({formatTime($songRemainingTime)})</span>
        </div>
        
        <div class="total-time">
          <span class="time-label">Total:</span>
          <span class="current-time">{formatLongTime($totalElapsedTime)}</span>
          <span class="separator">/</span>
          <span class="total-time">{formatLongTime($totalRegionsTime)}</span>
          <span class="remaining-time">({formatLongTime($totalRemainingTime)})</span>
        </div>
      </div>
      
      <!-- Progress bar -->
      {#if $currentRegion}
        <div class="progress-container" on:click={handleProgressBarClick}>
          <div 
            class="progress-bar" 
            style="width: {Math.min(100, Math.max(0, (($useLocalTimer ? $localPosition - $currentRegion.start : $playbackState.currentPosition - $currentRegion.start) / $songDuration) * 100))}%"
          ></div>
          
          <!-- Markers -->
          {#each $sortedMarkers as marker}
            {#if marker.position >= $currentRegion.start && marker.position <= $currentRegion.end}
              <div 
                class="marker"
                style="left: {((marker.position - $currentRegion.start) / $songDuration) * 100}%"
                title={marker.name}
              >
                <div class="marker-tooltip">
                  {marker.name}
                </div>
              </div>
            {/if}
          {/each}
          
          <!-- Fake marker for length marker end position or !1008 marker -->
          {#if getCustomLengthForRegion($markers, $currentRegion) !== null || has1008MarkerInRegion($markers, $currentRegion)}
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
        </div>
      {:else}
        <div class="progress-container">
          <div class="progress-bar" style="width: 0%"></div>
        </div>
      {/if}
    </div>
    
    <div class="next-song">
      <h2>{$nextRegion ? `Next: ${$nextRegion.name}` : 'End of setlist'}</h2>
      <div class="next-song-duration">
        {#if $nextRegion}
          Duration: {formatTime(getEffectiveRegionLength($nextRegion, $markers))}
        {:else}
          &nbsp;
        {/if}
      </div>
      {#if $atHardStop && !$playbackState.isPlaying && $nextRegion}
        <div class="hard-stop-message">Press play to continue</div>
      {/if}
    </div>
  </div>
  
  <div class="controls">
    <button 
      class="control-button previous" 
      on:click={previousRegionHandler}
      aria-label="Previous song"
    >
      <svg viewBox="0 0 24 24" width="36" height="36">
        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" fill="currentColor"/>
      </svg>
    </button>
    
    <button 
      class="control-button play-pause" 
      on:click={togglePlay}
      aria-label={$playbackState.isPlaying ? "Pause" : "Play"}
      disabled={!$nextRegion && !$playbackState.isPlaying && $atHardStop}
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
    >
      <svg viewBox="0 0 24 24" width="36" height="36">
        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/>
      </svg>
    </button>
  </div>
  <div class="toggle-container">
    <div class="toggle-item">
      <div class="status-indicator {$autoplayEnabled ? 'enabled' : 'disabled'}" on:click={toggleAutoplay}>
        Auto-resume: {$autoplayEnabled ? 'ON' : 'OFF'}
      </div>
    </div>
    <div class="toggle-item">
      <div class="status-indicator {$countInEnabled ? 'enabled' : 'disabled'}" on:click={toggleCountIn}>
        Count-in when pressing marker: {$countInEnabled ? 'ON' : 'OFF'}
      </div>
    </div>
  </div>
  <div class="exit-button-container">
    <a href="/" class="exit-button">Exit Performer Mode</a>
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
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
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