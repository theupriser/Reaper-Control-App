<script>
  import TransportControls from '$lib/components/TransportControls.svelte';
  import RegionList from '$lib/components/RegionList.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { socketControl } from '$lib/stores/socket';
  
  // Refresh regions on component mount
  onMount(() => {
    socketControl.refreshRegions();
    
    // Return a cleanup function
    return () => {
      // Any cleanup if needed
    };
  });
  
  // Ensure socket is disconnected when component is destroyed
  onDestroy(() => {
    socketControl.disconnect();
  });
</script>

<div class="queue-container">
  <div class="controls-section">
    <TransportControls />
  </div>
  
  <div class="regions-section">
    <RegionList />
  </div>
  
  <div class="info-section">
    <div class="info-card">
      <h3>Instructions</h3>
      <ul>
        <li>Use the transport controls to play, pause, and navigate between regions</li>
        <li>Click on a region in the setlist to jump to it</li>
        <li>Use the restart button to jump to the beginning of the current region</li>
        <li>If regions aren't showing, click the refresh button</li>
      </ul>
    </div>
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