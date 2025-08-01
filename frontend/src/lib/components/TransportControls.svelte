<script>
  import { socketControl, playbackState, currentRegion, autoplayEnabled } from '$lib/stores/socket';
  import { writable } from 'svelte/store';
  
  // Format time in seconds to MM:SS format
  function formatTime(seconds) {
    if (!seconds && seconds !== 0) return '--:--';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  // Toggle autoplay function
  function toggleAutoplay() {
    autoplayEnabled.update(current => !current);
  }
  
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
    
    // Calculate the time position based on the percentage
    const regionDuration = $currentRegion.end - $currentRegion.start;
    const clickedTime = $currentRegion.start + (percentage * regionDuration);
    
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
    popoverTime.set(clickedTime - $currentRegion.start); // Time relative to region start
    popoverVisible.set(true);
    
    // Seek to the clicked position
    socketControl.seekToPosition(clickedTime);
    
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
    
    <div class="time-display">
      {#if $currentRegion}
        <span class="current-time">{formatTime(Math.max(0, $playbackState.currentPosition - $currentRegion.start))}</span>
        <span class="separator">/</span>
        <span class="total-time">{formatTime($currentRegion.end - $currentRegion.start)}</span>
      {:else}
        <span class="current-time">{formatTime($playbackState.currentPosition)}</span>
      {/if}
    </div>
  </div>
  
  <!-- Progress bar -->
  {#if $currentRegion}
    <div class="progress-container" on:click={handleProgressBarClick}>
      <div 
        class="progress-bar" 
        style="width: {Math.min(100, Math.max(0, (($playbackState.currentPosition - $currentRegion.start) / ($currentRegion.end - $currentRegion.start)) * 100))}%"
      ></div>
      
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
  
  <div class="autoplay-toggle">
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
      on:click={() => socketControl.seekToCurrentRegionStart()}
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
  }
  
  .time-display {
    font-family: monospace;
    font-size: 1rem;
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
    margin-bottom: 1rem;
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
  
  /* Autoplay toggle styles */
  .autoplay-toggle {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-bottom: 1rem;
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
    
    .progress-container {
      height: 5px;
      margin-bottom: 0.8rem;
    }
    
    .time-popover {
      padding: 3px 6px;
      font-size: 0.7rem;
    }
    
    .autoplay-toggle {
      justify-content: flex-start;
      margin-top: 0.5rem;
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