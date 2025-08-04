<script>
  import { onMount, onDestroy } from 'svelte';
  import { 
    regions, 
    currentRegion, 
    playbackState, 
    autoplayEnabled,
    currentSetlist,
    fetchSetlist,
    sortedMarkers,
    getCustomLengthForRegion
  } from '$lib/stores';
  import { socketControl } from '$lib/stores/socket';
  import { markers, getEffectiveRegionLength, has1008MarkerInRegion } from '$lib/stores/markerStore';
  import { writable } from 'svelte/store';

  // Local timer state
  let localTimer = null;
  let localPosition = writable(0);
  let useLocalTimer = writable(false);
  let timerStartTime = 0;
  let timerStartPosition = 0;
  
  // Variable to track if we've reached a hard stop at a length marker
  let atHardStop = writable(false);

  // Function to start the local timer
  function startLocalTimer(startPosition) {
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
        
        // For length markers, set the hard stop flag and stop the timer at the custom length
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
  function stopLocalTimer() {
    if (localTimer) {
      clearInterval(localTimer);
      localTimer = null;
    }
  }

  // Store previous playback state to detect significant changes
  let previousPlaybackPosition = 0;
  let previousPlaybackIsPlaying = false;

  // Function to find the length marker in the current region
  function findLengthMarkerInRegion(markers, region) {
    if (!region || !markers || markers.length === 0) return null;
  
    // Find markers that are within the region and have a !length tag
    const lengthMarkers = markers.filter(marker => 
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
  function extractLengthFromMarker(name) {
    const lengthMatch = name.match(/!length:(\d+(\.\d+)?)/);
    return lengthMatch ? parseFloat(lengthMatch[1]) : null;
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
        // Reset hard stop flag
        atHardStop.set(false);
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
  }

  // Store previous region ID to detect actual region changes
  let previousRegionId = null;

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

  // Subscribe to playbackState to get the selectedSetlistId and fetch the setlist
  onMount(() => {
    const unsubscribe = playbackState.subscribe(state => {
      if (state.selectedSetlistId) {
        fetchSetlist(state.selectedSetlistId);
      } else {
        currentSetlist.set(null);
      }
    });
  
    return () => {
      unsubscribe();
    };
  });

  // Clean up the timer when the component is destroyed
  onDestroy(() => {
    stopLocalTimer();
  });
  
  // Get the next region based on the current region and selected setlist
  $: nextRegion = $currentRegion ? 
    $playbackState.selectedSetlistId && $currentSetlist ? 
      // If a setlist is selected, get the next item from the setlist
      (() => {
        const currentItemIndex = $currentSetlist.items.findIndex(item => item.regionId === $currentRegion.id);
        if (currentItemIndex !== -1 && currentItemIndex < $currentSetlist.items.length - 1) {
          const nextItem = $currentSetlist.items[currentItemIndex + 1];
          return $regions.find(region => region.id === nextItem.regionId);
        }
        return null;
      })() :
      // Otherwise, get the next region from all regions
      $regions.find(region => {
        const currentIndex = $regions.findIndex(r => r.id === $currentRegion.id);
        return currentIndex !== -1 && currentIndex < $regions.length - 1 ? 
          region.id === $regions[currentIndex + 1].id : false;
      }) : null;
  
  // Calculate total time based on selected setlist or all regions
  $: totalRegionsTime = $playbackState.selectedSetlistId && $currentSetlist ? 
    // If a setlist is selected, calculate total time from setlist items
    $currentSetlist.items.reduce((total, item) => {
      const region = $regions.find(r => r.id === item.regionId);
      return total + (region ? getEffectiveRegionLength(region, $markers) : 0);
    }, 0) :
    // Otherwise, calculate from all regions
    $regions.reduce((total, region) => total + getEffectiveRegionLength(region, $markers), 0);
  
  // Calculate elapsed time up to the current region
  $: elapsedTimeBeforeCurrentRegion = $currentRegion ? 
    $playbackState.selectedSetlistId && $currentSetlist ? 
      // If a setlist is selected, calculate elapsed time from setlist items
      $currentSetlist.items
        .filter((item, index) => {
          const currentItemIndex = $currentSetlist.items.findIndex(i => i.regionId === $currentRegion.id);
          return currentItemIndex !== -1 && index < currentItemIndex;
        })
        .reduce((total, item) => {
          const region = $regions.find(r => r.id === item.regionId);
          return total + (region ? getEffectiveRegionLength(region, $markers) : 0);
        }, 0) :
      // Otherwise, calculate from all regions
      $regions
        .filter(region => $regions.findIndex(r => r.id === region.id) < $regions.findIndex(r => r.id === $currentRegion.id))
        .reduce((total, region) => total + getEffectiveRegionLength(region, $markers), 0) : 0;
  
  // Calculate total elapsed time
  $: totalElapsedTime = $currentRegion ? 
    elapsedTimeBeforeCurrentRegion + Math.max(0, ($useLocalTimer ? $localPosition : $playbackState.currentPosition) - $currentRegion.start) : 0;
    
  // Calculate total remaining time
  $: totalRemainingTime = totalRegionsTime - totalElapsedTime;
    
  // Calculate current song time
  $: currentSongTime = $currentRegion ? 
    Math.max(0, ($useLocalTimer ? $localPosition : $playbackState.currentPosition) - $currentRegion.start) : 0;
    
  // Calculate song duration
  $: songDuration = $currentRegion ? 
    getEffectiveRegionLength($currentRegion, $markers) : 0;
    
  // Calculate song remaining time
  $: songRemainingTime = Math.max(0, songDuration - currentSongTime);
  
  // Format time in seconds to MM:SS format
  function formatTime(seconds) {
    if (!seconds && seconds !== 0) return '--:--';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  // Format time in seconds to HH:MM:SS format for longer durations (omits hours if zero)
  function formatLongTime(seconds) {
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
  
  // Toggle play/pause
  function togglePlay() {
    socketControl.togglePlay();
  }
  
  // Go to next region
  function nextRegionHandler() {
    socketControl.nextRegion();
  }
  
  // Go to previous region
  function previousRegionHandler() {
    socketControl.previousRegion();
  }
  
  // Toggle autoplay
  function toggleAutoplay() {
    socketControl.toggleAutoplay();
  }
  
  // Handle keyboard shortcuts
  function handleKeydown(event) {
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
      toggleAutoplay();
      event.preventDefault();
    }
  }
  
  // Add keyboard event listener on mount
  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    
    // Clean up on unmount
    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  });
  
  // Get current time
  let currentTime = new Date();
  
  // Update current time every second
  setInterval(() => {
    currentTime = new Date();
  }, 1000);
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
      {currentTime.toLocaleTimeString()}
    </div>
  </div>
  
  <div class="content">
    <div class="current-song">
      <h1>{$currentRegion ? $currentRegion.name : 'No song selected'}</h1>
      
      <div class="time-display">
        <div class="song-time">
          <span class="time-label">Song:</span>
          <span class="current-time">{formatTime(currentSongTime)}</span>
          <span class="separator">/</span>
          <span class="total-time">{formatTime(songDuration)}</span>
          <span class="remaining-time">({formatTime(songRemainingTime)})</span>
        </div>
        
        <div class="total-time">
          <span class="time-label">Total:</span>
          <span class="current-time">{formatLongTime(totalElapsedTime)}</span>
          <span class="separator">/</span>
          <span class="total-time">{formatLongTime(totalRegionsTime)}</span>
          <span class="remaining-time">({formatLongTime(totalRemainingTime)})</span>
        </div>
      </div>
      
      <!-- Progress bar -->
      {#if $currentRegion}
        <div class="progress-container">
          <div 
            class="progress-bar" 
            style="width: {Math.min(100, Math.max(0, (($useLocalTimer ? $localPosition - $currentRegion.start : $playbackState.currentPosition - $currentRegion.start) / songDuration) * 100))}%"
          ></div>
          
          <!-- Markers -->
          {#each $sortedMarkers as marker}
            {#if marker.position >= $currentRegion.start && marker.position <= $currentRegion.end}
              <div 
                class="marker"
                style="left: {((marker.position - $currentRegion.start) / songDuration) * 100}%"
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
      <h2>{nextRegion ? `Next: ${nextRegion.name}` : 'End of setlist'}</h2>
      <div class="next-song-duration">
        {#if nextRegion}
          Duration: {formatTime(getEffectiveRegionLength(nextRegion, $markers))}
        {:else}
          &nbsp;
        {/if}
      </div>
      {#if $atHardStop && !$playbackState.isPlaying}
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
  <div class="autoplay-status">
    <div class="status-indicator {$autoplayEnabled ? 'enabled' : 'disabled'}">
      Auto-resume: {$autoplayEnabled ? 'ON' : 'OFF'}
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
  
  .autoplay-status {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }
  
  .status-indicator {
    font-size: 1.5rem;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-weight: bold;
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