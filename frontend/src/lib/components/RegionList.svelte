<script>
  import { socketControl } from '$lib/stores/socket';
  import { 
    regions, 
    playbackState, 
    statusMessage,
    currentSetlist 
  } from '$lib/stores';
  import { onMount } from 'svelte';
  
  /**
   * Computed property to determine which items to display
   * If a setlist is selected, display its items
   * Otherwise, display all regions
   */
  $: displayItems = $currentSetlist 
    ? $currentSetlist.items.map(item => {
        // Find the corresponding region for each setlist item
        const region = $regions.find(r => r.id === item.regionId);
        return {
          id: item.id,
          regionId: item.regionId,
          name: item.name,
          // Use region data if available, otherwise use defaults
          start: region ? region.start : 0,
          end: region ? region.end : 0
        };
      })
    : $regions;
  
  /**
   * Format time in seconds to MM:SS format
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted time string (MM:SS)
   */
  function formatTime(seconds) {
    if (!seconds && seconds !== 0) return '--:--';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  /**
   * Calculate duration from start and end times
   * @param {number} start - Start time in seconds
   * @param {number} end - End time in seconds
   * @returns {string} Formatted duration string
   */
  function calculateDuration(start, end) {
    return formatTime(end - start);
  }
  
  /**
   * Handle region selection
   * Seeks to the selected region in Reaper
   * @param {number} regionId - ID of the region to seek to
   */
  function selectRegion(regionId) {
    socketControl.seekToRegion(regionId);
  }
  
  /**
   * Handle refresh button click
   * Refreshes the list of regions from Reaper
   */
  function handleRefresh() {
    socketControl.refreshRegions();
  }
</script>

<div class="region-list-container">
  <h2>{$currentSetlist ? $currentSetlist.name : 'All Regions'}</h2>
  
  {#if $statusMessage}
    <div class="status-message {$statusMessage.type}">
      <div class="status-icon">
        {#if $statusMessage.type === 'error'}
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/>
          </svg>
        {:else if $statusMessage.type === 'warning'}
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor"/>
          </svg>
        {:else if $statusMessage.type === 'info'}
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/>
          </svg>
        {/if}
      </div>
      <div class="status-content">
        <div class="status-title">{$statusMessage.message}</div>
        {#if $statusMessage.details}
          <div class="status-details">{$statusMessage.details}</div>
        {/if}
      </div>
      <button class="status-dismiss" on:click={() => statusMessage.set(null)}>
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
        </svg>
      </button>
    </div>
  {/if}
  
  {#if $regions.length === 0}
    <div class="empty-state">
      <p>No regions found in Reaper project</p>
      <p class="empty-state-hint">
        Make sure Reaper is running, OSC is enabled, and regions are defined in your project.
      </p>
      <button on:click={handleRefresh} class="refresh-button">
        Refresh Regions
      </button>
    </div>
  {:else if $currentSetlist && $currentSetlist.items.length === 0}
    <div class="empty-state">
      <p>This setlist is empty</p>
      <p class="empty-state-hint">
        Add items to this setlist in the Setlist Editor.
      </p>
    </div>
  {:else}
    <div class="region-list">
      {#each displayItems as item (item.id)}
        <div 
          class="region-item {$playbackState.currentRegionId === item.regionId ? 'active' : ''}"
          on:click={() => selectRegion(item.regionId)}
        >
          <div class="region-info">
            <div class="region-name">{item.name}</div>
            <div class="region-duration">{calculateDuration(item.start, item.end)}</div>
          </div>
          
          {#if $playbackState.currentRegionId === item.regionId}
            <div class="playing-indicator">
              {#if $playbackState.isPlaying}
                <div class="playing-animation">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              {:else}
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path d="M8 5v14l11-7z" fill="currentColor"/>
                </svg>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .region-list-container {
    background-color: #2a2a2a;
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  h2 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.2rem;
    color: #ffffff;
  }
  
  .status-message {
    display: flex;
    align-items: flex-start;
    margin-bottom: 1rem;
    padding: 0.75rem;
    border-radius: 4px;
    position: relative;
  }
  
  .status-message.error {
    background-color: rgba(244, 67, 54, 0.1);
    border-left: 4px solid #f44336;
    color: #f44336;
  }
  
  .status-message.warning {
    background-color: rgba(255, 152, 0, 0.1);
    border-left: 4px solid #ff9800;
    color: #ff9800;
  }
  
  .status-message.info {
    background-color: rgba(33, 150, 243, 0.1);
    border-left: 4px solid #2196f3;
    color: #2196f3;
  }
  
  .status-icon {
    flex-shrink: 0;
    margin-right: 0.75rem;
    margin-top: 0.25rem;
  }
  
  .status-content {
    flex: 1;
  }
  
  .status-title {
    font-weight: bold;
    margin-bottom: 0.25rem;
  }
  
  .status-details {
    font-size: 0.9rem;
    opacity: 0.8;
  }
  
  .status-dismiss {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
    padding: 0.25rem;
    margin-left: 0.5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .status-dismiss:hover {
    opacity: 1;
    background-color: rgba(255, 255, 255, 0.1);
  }
  
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 0;
    color: #aaaaaa;
    text-align: center;
  }
  
  .empty-state-hint {
    font-size: 0.9rem;
    max-width: 80%;
    margin: 0.5rem 0;
    line-height: 1.4;
  }
  
  .refresh-button {
    background-color: #4a4a4a;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 0.5rem 1rem;
    margin-top: 1rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .refresh-button:hover {
    background-color: #5a5a5a;
  }
  
  .region-list {
    max-height: 60vh;
    overflow-y: auto;
    border-radius: 4px;
  }
  
  .region-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #3a3a3a;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .region-item:last-child {
    border-bottom: none;
  }
  
  .region-item:hover {
    background-color: #3a3a3a;
  }
  
  .region-item.active {
    background-color: #3a3a3a;
    border-left: 4px solid #4CAF50;
    padding-left: calc(1rem - 4px);
  }
  
  .region-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
  }
  
  .region-name {
    font-weight: bold;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .region-duration {
    font-size: 0.8rem;
    color: #bbbbbb;
  }
  
  .playing-indicator {
    margin-left: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .playing-animation {
    display: flex;
    align-items: flex-end;
    height: 16px;
  }
  
  .playing-animation span {
    display: inline-block;
    width: 3px;
    margin: 0 1px;
    background-color: #4CAF50;
    animation: playing-animation 0.8s infinite;
  }
  
  .playing-animation span:nth-child(1) {
    height: 8px;
    animation-delay: -0.4s;
  }
  
  .playing-animation span:nth-child(2) {
    height: 16px;
    animation-delay: -0.2s;
  }
  
  .playing-animation span:nth-child(3) {
    height: 12px;
    animation-delay: 0s;
  }
  
  @keyframes playing-animation {
    0%, 100% {
      transform: scaleY(1);
    }
    50% {
      transform: scaleY(0.6);
    }
  }
  
  /* Scrollbar styling */
  .region-list::-webkit-scrollbar {
    width: 8px;
  }
  
  .region-list::-webkit-scrollbar-track {
    background: #1e1e1e;
    border-radius: 4px;
  }
  
  .region-list::-webkit-scrollbar-thumb {
    background: #4a4a4a;
    border-radius: 4px;
  }
  
  .region-list::-webkit-scrollbar-thumb:hover {
    background: #5a5a5a;
  }
  
  /* Responsive adjustments */
  @media (max-width: 768px) {
    .region-list {
      max-height: 40vh;
    }
    
    .region-item {
      padding: 0.5rem 0.75rem;
    }
  }
</style>