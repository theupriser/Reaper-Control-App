<script>
  import { onMount } from 'svelte';
  
  let isElectron = false;
  let electronVersion = '';

  onMount(() => {
    // Check if running in Electron by looking for the electronAPI exposed by the preload script
    isElectron = window.electronAPI && window.electronAPI.isElectron || false;

    // If we're in Electron, we can access the electronAPI
    if (isElectron && window.electronAPI) {
      // We could get more info from the Electron API if needed
      electronVersion = 'Electron API available';
    }
  });
</script>

<div class="electron-status">
  <div class="status-indicator {isElectron ? 'electron' : 'browser'}">
    {#if isElectron}
      <span>Running in Electron</span>
      {#if electronVersion}
        <span class="version">{electronVersion}</span>
      {/if}
    {:else}
      <span>Running in browser</span>
    {/if}
  </div>
</div>

<style>
  .electron-status {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
    margin: 8px;
  }
  
  .status-indicator {
    display: flex;
    flex-direction: column;
    padding: 4px 8px;
    border-radius: 4px;
  }
  
  .electron {
    background-color: #2ecc71;
    color: white;
  }
  
  .browser {
    background-color: #3498db;
    color: white;
  }
  
  .version {
    font-size: 0.7rem;
    opacity: 0.8;
  }
</style>