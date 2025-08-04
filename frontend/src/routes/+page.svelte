<script>
  import TransportControls from '$lib/components/TransportControls.svelte';
  import RegionList from '$lib/components/RegionList.svelte';
  import { onMount } from 'svelte';
  import { socketControl } from '$lib/stores/socket';
  import { 
    setlists, 
    currentSetlist, 
    setlistLoading, 
    fetchSetlists, 
    fetchSetlist 
  } from '$lib/stores';
  import { setSelectedSetlist, playbackState, getPlaybackState } from '$lib/stores/playbackStore';
  
  // Local state
  // Initialize with empty string to ensure "All Regions" is selected by default in the dropdown
  let selectedSetlistId = "";
  
  /**
   * Refresh regions and fetch setlists on component mount
   * This ensures we have the latest data from Reaper and all available setlists
   * Also loads the selected setlist from playbackState if available
   */
  onMount(async () => {
    socketControl.refreshRegions();
    await fetchSetlists();
    
    // Subscribe to playbackState to get the selectedSetlistId
    // Only update the selectedSetlistId when it changes, not on every playback state update
    let previousSetlistId = null;
    const unsubscribe = playbackState.subscribe(state => {
      // Only update if the setlist ID has changed to avoid unnecessary refreshes during playback
      if (state.selectedSetlistId !== previousSetlistId) {
        console.log('Setlist ID changed, updating dropdown:', state.selectedSetlistId);
        // If there's a selected setlist in playbackState, load it
        selectedSetlistId = state.selectedSetlistId || "";
        if (state.selectedSetlistId) {
          fetchSetlist(state.selectedSetlistId);
        }
        // Update the previous ID to avoid future unnecessary updates
        previousSetlistId = state.selectedSetlistId;
      }
    });
    
    // Return a cleanup function
    return () => {
      unsubscribe();
    };
  });
  
  /**
   * Handle setlist selection from the dropdown
   * When a setlist is selected, fetch its details, pause Reaper, and select the first song
   * When "All Regions" is selected, clear the current setlist
   * Also store the selected setlist in Reaper extended data
   */
  async function handleSetlistChange(event) {
    const id = event.target.value;
    selectedSetlistId = id;

    if (id) {
      // Get current playback state
      const currentState = getPlaybackState();

      // Only pause if currently playing
      if (currentState.isPlaying) {
        socketControl.togglePlay();
      }

      // Fetch the setlist and store the result
      const setlist = await fetchSetlist(id);
      
      // Store the selected setlist ID in Reaper extended data
      setSelectedSetlist(id);

      // Select the first song in the setlist if available
      if (setlist && setlist.items && setlist.items.length > 0) {
        const firstSong = setlist.items[0];
        socketControl.seekToRegion(firstSong.regionId);
      }
    } else {
      // Clear current setlist to show all regions
      currentSetlist.set(null);
      // Store null in Reaper extended data to indicate all regions
      setSelectedSetlist(null);
    }
  }
</script>

<div class="queue-container">
  <div class="controls-section">
    <TransportControls />
  </div>
  
  {#if $setlists && $setlists.length > 0}
    <div class="setlist-selector">
      <label for="setlist-select">Select Setlist:</label>
      <select 
        id="setlist-select" 
        bind:value={selectedSetlistId} 
        on:change={handleSetlistChange}
        disabled={$setlistLoading}
      >
        <option value="">All Regions</option>
        {#each $setlists as setlist (setlist.id)}
          <option value={setlist.id}>{setlist.name}</option>
        {/each}
      </select>
      
      {#if $setlistLoading}
        <div class="loading-indicator">Loading...</div>
      {/if}
    </div>
  {/if}
  
  <div class="regions-section">
    <RegionList />
  </div>
</div>

<style>
  .queue-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 800px;
    margin: 0 auto;
    padding: 1rem 0;
  }
  
  .header-section {
    text-align: center;
    margin-bottom: 1rem;
  }
  
  h1 {
    margin: 0;
    font-size: 2rem;
    color: #ffffff;
  }
  
  .subtitle {
    margin: 0.5rem 0 0;
    color: #aaaaaa;
    font-size: 1rem;
  }
  
  .setlist-selector {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background-color: #2a2a2a;
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  .setlist-selector label {
    font-weight: bold;
    color: #ffffff;
    white-space: nowrap;
  }
  
  .setlist-selector select {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #444;
    background-color: #333;
    color: white;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .setlist-selector select:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  
  .loading-indicator {
    font-size: 0.9rem;
    color: #aaaaaa;
    font-style: italic;
  }
  
  .info-section {
    margin-top: 1rem;
  }
  
  .info-card {
    background-color: #2a2a2a;
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  .info-card h3 {
    margin-top: 0;
    margin-bottom: 0.5rem;
    font-size: 1.1rem;
  }
  
  .info-card ul {
    margin: 0;
    padding-left: 1.5rem;
  }
  
  .info-card li {
    margin-bottom: 0.5rem;
    color: #cccccc;
  }
  
  .info-card li:last-child {
    margin-bottom: 0;
  }
  
  /* Responsive adjustments */
  @media (max-width: 768px) {
    .queue-container {
      padding: 0.5rem 0;
      gap: 1rem;
    }
    
    h1 {
      font-size: 1.5rem;
    }
    
    .subtitle {
      font-size: 0.9rem;
    }
    
    .setlist-selector {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.75rem;
    }
    
    .setlist-selector label {
      margin-bottom: 0.25rem;
    }
    
    .setlist-selector select {
      width: 100%;
    }
    
    .info-card {
      padding: 0.75rem;
    }
    
    .info-card h3 {
      font-size: 1rem;
    }
    
    .info-card li {
      font-size: 0.9rem;
    }
  }
</style>