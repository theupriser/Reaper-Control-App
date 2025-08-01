<script>
  import { onDestroy } from 'svelte';
  import { socketControl } from '$lib/stores/socket';
  import ConnectionStatus from '$lib/components/ConnectionStatus.svelte';
  
  // Clean up socket connection when the app is destroyed
  onDestroy(() => {
    socketControl.disconnect();
  });
</script>

<svelte:head>
  <title>Reaper Control</title>
  <meta name="description" content="Queue system for Cockos Reaper" />
</svelte:head>

<div class="app">
  <header>
    <h1>Reaper Control</h1>
  </header>
  
  <main>
    <slot />
  </main>
  
  <div class="connection-status-container">
    <ConnectionStatus />
  </div>
  
  <footer>
    <p>© 2025 Reaper Control</p>
  </footer>
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
    padding: 1rem;
    text-align: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }
  
  h1 {
    margin: 0;
    font-size: 1.5rem;
  }
  
  main {
    flex: 1;
    padding: 1rem;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
  }
  
  footer {
    background-color: #1e1e1e;
    padding: 1rem;
    text-align: center;
    font-size: 0.8rem;
  }
  
  .connection-status-container {
    position: fixed;
    top: 3.5rem; /* Adjusted to be below the header */
    right: 0;
    z-index: 100;
    background-color: transparent;
    padding: 0.5rem 1rem;
    display: flex;
    justify-content: flex-end;
    box-shadow: none;
  }
  
  /* Responsive adjustments */
  @media (max-width: 768px) {
    main {
      padding: 0.5rem;
    }
    
    h1 {
      font-size: 1.2rem;
    }
    
    .connection-status-container {
      padding: 0.25rem 0.5rem;
      top: 2.7rem; /* Adjusted for smaller header on mobile */
    }
  }
</style>