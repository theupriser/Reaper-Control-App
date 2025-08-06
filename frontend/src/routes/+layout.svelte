<script>
  import { onMount } from 'svelte';
  import { projectId } from '$lib/stores';
  import SystemStats from '$lib/components/SystemStats.svelte';
  import { _initializeApp } from './+layout.js';
  
  // Initialize the app when mounted
  onMount(() => {
    _initializeApp();
  });
</script>

<svelte:head>
  <title>Reaper Control {$projectId ? `- ${$projectId.substring(0, 8)}...` : ''}</title>
  <meta name="description" content="Queue system for Cockos Reaper" />
</svelte:head>

<div class="app">
  <header>
    <div class="header-content">
      <h1>Reaper Control</h1>
    </div>
    
    <nav class="main-nav">
      <a href="/" class="nav-link">Player</a>
      <a href="/setlists" class="nav-link">Setlists</a>
      <a href="/performer" class="nav-link performer-link">Performer Mode</a>
      <div class="status-container">
        <SystemStats />
      </div>
    </nav>
  </header>
  
  <main>
    <slot />
  </main>
<!--  -->
<!--  <footer>-->
<!--    <p>© 2025 Reaper Control</p>-->
<!--  </footer>-->
</div>

<style>
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
  }
  
  .nav-link {
    color: #ffffff;
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background-color 0.2s;
    font-weight: 500;
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
  
  /* Active link styling - will be applied by the router */
  :global(.active-nav-link) {
    background-color: #333;
    color: #4CAF50;
  }
  
  
  main {
    flex: 1;
    padding: 1rem;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
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
    }
    
    .nav-link {
      padding: 0.4rem 0.75rem;
      font-size: 0.9rem;
    }
  }
</style>