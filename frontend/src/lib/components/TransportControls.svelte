<script>
  import { socketControl, playbackState, currentRegion, autoplayEnabled, countInEnabled, sortedMarkers } from '$lib/stores/socket';
  import { getEffectiveRegionLength, getCustomLengthForRegion, has1008MarkerInRegion } from '$lib/stores/markerStore';
  import { markers } from '$lib/stores/markerStore';
  import { writable } from 'svelte/store';
  import { onMount, onDestroy } from 'svelte';
  
  // Local timer state
  let localTimer = null;
  let localPosition = writable(0);
  let useLocalTimer = writable(false);
  let timerStartTime = 0;
  let timerStartPosition = 0;
  
  // Format time in seconds to MM:SS format
  function formatTime(seconds) {
    if (!seconds && seconds !== 0) return '--:--';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  // Toggle autoplay function
  function toggleAutoplay() {
    socketControl.toggleAutoplay();
  }
  
  // Toggle count-in function
  function toggleCountIn() {
    socketControl.toggleCountIn();
  }
  
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
  
  // Variable to track if we've reached a hard stop at a length marker
  let atHardStop = writable(false);
  
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
        }
      } else {
        useLocalTimer.set(false);
        stopLocalTimer();
      }
    }
  }
  
  // Initialize markers when component is mounted
  onMount(() => {
    socketControl.refreshMarkers();
  });
  
  // Clean up the timer when the component is destroyed
  onDestroy(() => {
    stopLocalTimer();
  });
  
  // Progress bar click handling
  let popoverVisible = writable(false);
  let popoverPosition = writable({ x: 0, y: 0 });
  let popoverTime = writable(0);
  
  function handleProgressBarClick(event) {
    if (!$currentRegion) return;
    
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
    
    // Find markers within the current region
    const markersInRegion = $sortedMarkers.filter(marker => 
      marker.position >= $currentRegion.start && 
      marker.position <= $currentRegion.end
    );
    
    // Check if click is near any marker
    for (const marker of markersInRegion) {
      // Calculate marker's pixel position in the progress bar
      const regionDuration = getEffectiveRegionLength($currentRegion, $markers);
      const markerPercentage = (marker.position - $currentRegion.start) / regionDuration;
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
      const regionDuration = getEffectiveRegionLength($currentRegion, $markers);
      finalPosition = $currentRegion.start + (percentage * regionDuration);
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
    popoverTime.set(finalPosition - $currentRegion.start); // Time relative to region start
    popoverVisible.set(true);
    
    // Seek to the position (either marker position or calculated position)
    // Pass isNearMarker flag to indicate whether the click was on a marker
    socketControl.seekToPosition(finalPosition, isNearMarker);
    
    // Check if we should use the local timer based on the position
    const customLength = getCustomLengthForRegion($markers, $currentRegion);
    if (customLength !== null) {
      // Find the actual length marker to get its position
      const lengthMarker = findLengthMarkerInRegion($markers, $currentRegion);
      
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
    
    // Hide the popover after 2 seconds
    setTimeout(() => {
      popoverVisible.set(false);
    }, 2000);
  }
</script>

<div class="transport-controls">
  <div class="playback-info">
    <div class="current-region">
      {#if $currentRegion}
        <span class="region-name">{$currentRegion.name}</span>
      {:else}
        <span class="region-name">No region selected</span>
      {/if}
    </div>
    
    <div class="info-display">
      <div class="time-display">
        {#if $currentRegion}
          <span class="current-time">
            {#if $useLocalTimer}
              {formatTime(Math.max(0, $localPosition - $currentRegion.start))}
            {:else}
              {formatTime(Math.max(0, $playbackState.currentPosition - $currentRegion.start))}
            {/if}
          </span>
          <span class="separator">/</span>
          <span class="total-time">{formatTime(getEffectiveRegionLength($currentRegion, $markers))}</span>
        {:else}
          <span class="current-time">{formatTime($playbackState.currentPosition)}</span>
        {/if}
      </div>
      
      <div class="bpm-display">
        <span class="bpm-value">{Math.round($playbackState.bpm)}</span>
        <span class="bpm-label">BPM</span>
      </div>
    </div>
  </div>
  
  <!-- Progress bar -->
  {#if $currentRegion}
    <div class="progress-container" on:click={handleProgressBarClick}>
      <div 
        class="progress-bar" 
        style="width: {Math.min(100, Math.max(0, ((($useLocalTimer ? $localPosition : $playbackState.currentPosition) - $currentRegion.start) / getEffectiveRegionLength($currentRegion, $markers)) * 100))}%"
      ></div>
      
      <!-- Hard stop message -->
      {#if $atHardStop && !$playbackState.isPlaying}
        <div class="hard-stop-marker">
          <div class="hard-stop-message">
            Press play to continue
          </div>
        </div>
      {/if}
      
      <!-- Markers -->
      {#each $sortedMarkers as marker}
        {#if marker.position >= $currentRegion.start && marker.position <= $currentRegion.end}
          <div 
            class="marker"
            style="left: {((marker.position - $currentRegion.start) / getEffectiveRegionLength($currentRegion, $markers)) * 100}%"
            title={marker.name}
          >
            <div class="marker-tooltip">
              {marker.name}
            </div>
          </div>
        {/if}
      {/each}
      
      <!-- Fake marker for length marker end position or !1008 marker -->
      {#if $currentRegion}
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
  {:else}
    <div class="progress-container">
      <div class="progress-bar" style="width: 0%"></div>
    </div>
  {/if}
  
  <div class="toggle-container">
    <div class="toggle-item">
      <label class="toggle-switch">
        <input 
          type="checkbox" 
          checked={$autoplayEnabled} 
          on:change={toggleAutoplay}
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
        />
        <span class="toggle-slider"></span>
      </label>
      <span class="toggle-label">Count-in when pressing marker</span>
    </div>
  </div>
  
  <div class="controls">
    <button 
      class="control-button previous" 
      on:click={() => socketControl.previousRegion()}
      aria-label="Previous region"
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" fill="currentColor"/>
      </svg>
    </button>
    
    <button 
      class="control-button restart" 
      on:click={() => socketControl.seekToCurrentRegionStart($useLocalTimer)}
      aria-label="Restart current region"
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M12 5V1L7 6l5 5V7c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z" fill="currentColor"/>
      </svg>
    </button>
    
    <button 
      class="control-button play-pause" 
      on:click={() => socketControl.togglePlay()}
      aria-label={$playbackState.isPlaying ? "Pause" : "Play"}
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
      on:click={() => socketControl.nextRegion()}
      aria-label="Next region"
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/>
      </svg>
    </button>
    
    <button 
      class="control-button refresh" 
      on:click={() => socketControl.refreshRegions()}
      aria-label="Refresh regions"
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