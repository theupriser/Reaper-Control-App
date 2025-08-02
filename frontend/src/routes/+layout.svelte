<script>
  import { onMount, onDestroy } from 'svelte';
  import { socketControl } from '$lib/stores/socket';
  import { projectId } from '$lib/stores';
  import ConnectionStatus from '$lib/components/ConnectionStatus.svelte';
  
  // Clean up socket connection when the app is destroyed
  onDestroy(() => {
    socketControl.disconnect();
  });
  
  // Refresh the project ID when the app is mounted
  onMount(() => {
    socketControl.refreshProjectId();
  });
</script>

<svelte:head>
  <title>Reaper Control {$projectId ? `- ${$projectId.substring(0, 8)}...` : ''}</title>
  <meta name="description" content="Queue system for Cockos Reaper" />
</svelte:head>

<div class="app">
  <header>
    <h1>Reaper Control</h1>
    {#if $projectId}
      <div class="project-id">
        Project ID: <span class="id-value">{$projectId}</span>
      </div>
    {/if}
  </header>
  
  <main>
    <slot />
  </main>
  
  <div class="connection-status-container">
    <ConnectionStatus />
  </div>
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
    padding: 1rem;
    text-align: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  
  h1 {
    margin: 0;
    font-size: 1.5rem;
  }
  
  .project-id {
    font-size: 0.8rem;
    color: #aaaaaa;
    margin-top: 0.5rem;
  }
  
  .id-value {
    font-family: monospace;
    background-color: #2a2a2a;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    color: #4caf50;
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