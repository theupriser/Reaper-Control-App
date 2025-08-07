<script lang="ts">
  import { onMount } from 'svelte';
  import SystemStats from './components/SystemStats.svelte';
  import ConnectionStatus from './components/ConnectionStatus.svelte';
  import RegionList from './components/RegionList.svelte';
  import TransportControls from './components/TransportControls.svelte';
  import ipcService from './services/ipcService';
  import logger from './lib/utils/logger';
  import { currentView, View, navigateTo } from './stores/navigationStore';

  // Initialize the application
  onMount(() => {
    logger.log('App component mounted');

    // Initial data refresh
    ipcService.refreshRegions();
    ipcService.refreshProjectId();

    // Set up cleanup on component destroy
    return () => {
      logger.log('App component destroyed');
    };
  });

  // Handle navigation
  function handleNavigation(view: View): void {
    navigateTo(view);
  }
</script>

<main class="app-container">
  <header class="app-header">
    <div class="app-title">
      <h1>Reaper Control</h1>
      <nav class="app-nav">
        <button
          class="nav-button {$currentView === View.MAIN ? 'active' : ''}"
          on:click={() => handleNavigation(View.MAIN)}
        >
          Main
        </button>
        <button
          class="nav-button {$currentView === View.PERFORMER ? 'active' : ''}"
          on:click={() => handleNavigation(View.PERFORMER)}
        >
          Performer
        </button>
        <button
          class="nav-button {$currentView === View.SETLISTS ? 'active' : ''}"
          on:click={() => handleNavigation(View.SETLISTS)}
        >
          Setlists
        </button>
      </nav>
    </div>
    <div class="app-status">
      <ConnectionStatus />
      <SystemStats />
    </div>
  </header>

  <div class="app-content">
    {#if $currentView === View.MAIN}
      <div class="main-panel">
        <TransportControls />
        <RegionList />
      </div>
    {:else if $currentView === View.PERFORMER}
      <div class="performer-panel">
        <p class="placeholder-message">Performer view will be implemented in a future update.</p>
      </div>
    {:else if $currentView === View.SETLISTS}
      <div class="setlists-panel">
        <p class="placeholder-message">Setlists management will be implemented in a future update.</p>
      </div>
    {/if}
  </div>
</main>

<style>
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    margin: 0;
    padding: 0;
    background-color: #1e1e1e;
    color: #ffffff;
    height: 100vh;
    overflow: hidden;
  }

  :global(#app) {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    /*max-width: 1200px;*/
    margin: 0 auto;
    padding: 1rem;
    box-sizing: border-box;
  }

  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 1rem;
    border-bottom: 1px solid #333;
  }

  .app-title {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .app-title h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .app-nav {
    display: flex;
    gap: 0.5rem;
  }

  .nav-button {
    background-color: #333;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background-color 0.2s, color 0.2s;
  }

  .nav-button:hover {
    background-color: #444;
  }

  .nav-button.active {
    background-color: #4CAF50;
    color: #fff;
  }

  .app-status {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .app-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 0;
  }

  .main-panel, .performer-panel, .setlists-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .placeholder-message {
    background-color: #2a2a2a;
    border-radius: 8px;
    padding: 2rem;
    text-align: center;
    color: #aaa;
    font-style: italic;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .app-container {
      padding: 0.5rem;
    }

    .app-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .app-status {
      width: 100%;
      justify-content: space-between;
    }

    .app-nav {
      width: 100%;
      justify-content: space-between;
    }

    .nav-button {
      flex: 1;
      padding: 0.4rem 0.5rem;
      font-size: 0.8rem;
      text-align: center;
    }
  }
</style>
