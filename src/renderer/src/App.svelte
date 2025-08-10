<script lang="ts">
  import { onMount } from 'svelte';
  import SystemStats from './components/SystemStats.svelte';
  import RegionList from './components/RegionList.svelte';
  import TransportControls from './components/TransportControls.svelte';
  import SetlistEditor from './components/SetlistEditor.svelte';
  import PerformerMode from './components/PerformerMode.svelte';
  import Help from './components/Help.svelte';
  import Settings from './components/Settings.svelte';
  import ipcService from './services/ipcService';
  import logger from './lib/utils/logger';
  import { currentView, View, navigateTo } from './stores/navigationStore';

  // Initialize the application
  onMount(() => {
    logger.log('App component mounted');

    // Initial data refresh
    setTimeout(() => {
      ipcService.refreshRegions();
      ipcService.refreshMarkers();
      ipcService.refreshProjectId();
    }, 1000);

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

<div class="app">
  <header>
    <div class="header-content">
      <h1>Reaper Control</h1>
    </div>

    <nav class="main-nav">
      <button
        class="nav-link {$currentView === View.MAIN ? 'active-nav-link' : ''}"
        on:click={() => handleNavigation(View.MAIN)}
      >
        Player
      </button>
      <button
        class="nav-link {$currentView === View.SETLISTS ? 'active-nav-link' : ''}"
        on:click={() => handleNavigation(View.SETLISTS)}
      >
        Setlists
      </button>
      <button
        class="nav-link performer-link {$currentView === View.PERFORMER ? 'active-nav-link' : ''}"
        on:click={() => handleNavigation(View.PERFORMER)}
      >
        Performer Mode
      </button>
      <div class="status-container">
        <button
          class="icon-button settings-icon {$currentView === View.SETTINGS ? 'active-icon' : ''}"
          on:click={() => handleNavigation(View.SETTINGS)}
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
        <button
          class="icon-button help-icon {$currentView === View.HELP ? 'active-icon' : ''}"
          on:click={() => handleNavigation(View.HELP)}
          title="Help"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
          </svg>
        </button>
        <SystemStats />
      </div>
    </nav>
  </header>

  <main>
    {#if $currentView === View.MAIN}
      <div class="main-panel">
        <TransportControls />
        <RegionList />
      </div>
    {:else if $currentView === View.PERFORMER}
      <div class="performer-panel">
        <PerformerMode />
      </div>
    {:else if $currentView === View.SETLISTS}
      <div class="setlists-panel">
        <SetlistEditor />
      </div>
    {:else if $currentView === View.HELP}
      <div class="help-panel">
        <Help />
      </div>
    {:else if $currentView === View.SETTINGS}
      <div class="settings-panel">
        <Settings />
      </div>
    {/if}
  </main>
</div>

<style>
  :global(:root) {
    /* CSS variables for component heights used in layout calculations */
    --header-height: 375px; /* Approximate header height */
    --header-height-mobile: 400px; /* Approximate header height on mobile */
    --transport-height: 200px; /* Approximate transport controls height */
    --transport-height-mobile: 180px; /* Approximate transport controls height on mobile */
  }

  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    background-color: #121212;
    color: #ffffff;
  }

  :global(*) {
    box-sizing: border-box;
  }

  /* Custom scrollbar styling */
  :global(::-webkit-scrollbar) {
    width: 10px;
    height: 10px;
  }

  :global(::-webkit-scrollbar-track) {
    background: #1e1e1e;
    border-radius: 4px;
  }

  :global(::-webkit-scrollbar-thumb) {
    background: #333;
    border-radius: 4px;
    border: 2px solid #1e1e1e;
  }

  :global(::-webkit-scrollbar-thumb:hover) {
    background: #4CAF50;
  }

  :global(::-webkit-scrollbar-corner) {
    background: #1e1e1e;
  }

  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  header {
    background-color: #1e1e1e;
    padding: 1rem 1rem 0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .header-content {
    text-align: center;
    width: 100%;
    margin-bottom: 1rem;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .main-nav {
    display: flex;
    gap: 1.5rem;
    margin-top: 0.5rem;
    padding: 0.5rem 0;
    width: 100%;
    justify-content: center;
    border-top: 1px solid #333;
    position: relative;
  }

  .status-container {
    display: flex;
    position: absolute;
    right: 1rem;
    gap: 0.5rem;
    align-items: center;
  }

  .icon-button {
    background: none;
    border: none;
    padding: 0.25rem;
    cursor: pointer;
    color: #aaa;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .icon-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .settings-icon.active-icon {
    color: #FF9800;
  }

  .help-icon.active-icon {
    color: #2196F3;
  }

  .nav-link {
    color: #ffffff;
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background-color 0.2s;
    font-weight: 500;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
  }

  .nav-link:hover {
    background-color: #333;
  }

  /* Performer Mode link styling */
  .performer-link {
    background-color: #4CAF50;
    color: #000;
    font-weight: bold;
  }

  .performer-link:hover {
    background-color: #3d9c47;
  }

  /* Help link styling */
  .help-link {
    background-color: #2196F3;
    color: #000;
    font-weight: bold;
  }

  .help-link:hover {
    background-color: #1976D2;
  }

  /* Active link styling */
  .active-nav-link {
    background-color: #333;
    color: #4CAF50;
  }

  /* Override performer link when active */
  .performer-link.active-nav-link {
    background-color: #333;
    color: #4CAF50;
  }

  /* Override help link when active */
  .help-link.active-nav-link {
    background-color: #333;
    color: #2196F3;
  }

  main {
    flex: 1;
    padding: 1rem;
    width: 100%;
    margin: 0 auto;
    max-width: 1200px;
  }

  .main-panel, .performer-panel, .setlists-panel, .help-panel, .settings-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* Settings link styling */
  .settings-link {
    background-color: #FF9800;
    color: #000;
    font-weight: bold;
  }

  .settings-link:hover {
    background-color: #F57C00;
  }

  /* Override settings link when active */
  .settings-link.active-nav-link {
    background-color: #333;
    color: #FF9800;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    main {
      padding: 0.5rem;
    }

    h1 {
      font-size: 1.2rem;
    }

    header {
      padding: 0.75rem 0.5rem;
    }

    .header-content {
      margin-bottom: 0.5rem;
    }

    .main-nav {
      gap: 0.5rem;
      flex-wrap: wrap;
      justify-content: center;
      padding-bottom: 3rem; /* Add space for the status container */
    }

    .status-container {
      position: absolute;
      right: 0.5rem;
      bottom: 0.5rem;
      top: auto;
      display: flex;
      align-items: center;
    }

    .icon-button {
      padding: 0.2rem;
    }

    .icon-button svg {
      width: 18px;
      height: 18px;
    }

    .nav-link {
      padding: 0.4rem 0.75rem;
      font-size: 0.9rem;
    }
  }
</style>
