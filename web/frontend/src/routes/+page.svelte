<script>
  import TransportControls from '$lib/components/TransportControls.svelte';
  import RegionList from '$lib/components/RegionList.svelte';
  import { onMount } from 'svelte';
  import { setlists, setlistLoading } from '$lib/stores';
  import { _selectedSetlistId, _initializePage, _handleSetlistChange } from './+page.js';
  
  // Initialize page data on mount
  onMount(() => {
    const unsubscribe = _initializePage();
    
    // Return a cleanup function
    return () => {
      unsubscribe();
    };
  });
  
  // Wrapper function to handle setlist change from the dropdown
  function onSetlistChange(event) {
    const id = event.target.value;
    _selectedSetlistId.set(id);
    _handleSetlistChange(id);
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
        bind:value={$_selectedSetlistId} 
        on:change={onSetlistChange}
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

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .queue-container {
      padding: 0.5rem 0;
      gap: 1rem;
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
  }
</style>