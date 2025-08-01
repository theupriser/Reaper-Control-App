<script>
  import { connectionStatus, socketControl } from '$lib/stores/socket';
  import { onMount, onDestroy } from 'svelte';
  
  // Format time since last ping
  function formatTimeSince(date) {
    if (!date) return 'Never';
    
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds} seconds ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    
    return `${Math.floor(seconds / 3600)} hours ago`;
  }
  
  // Format latency with color coding
  function getLatencyClass(latency) {
    if (latency === null) return 'unknown';
    if (latency < 100) return 'good';
    if (latency < 300) return 'medium';
    return 'poor';
  }
  
  // Update the "time since" display every second
  let updateInterval;
  let timeSinceLastPing = 'Never';
  
  function updateTimeSince() {
    if ($connectionStatus.lastPing) {
      timeSinceLastPing = formatTimeSince($connectionStatus.lastPing);
    } else {
      timeSinceLastPing = 'Never';
    }
  }
  
  onMount(() => {
    updateInterval = setInterval(updateTimeSince, 1000);
  });
  
  onDestroy(() => {
    if (updateInterval) clearInterval(updateInterval);
  });
  
  // Manual reconnect function
  function handleReconnect() {
    // First disconnect if already connected or reconnecting
    if ($connectionStatus.connected || $connectionStatus.reconnecting) {
      socketControl.disconnect();
    }
    
    // Force page reload to establish a new connection
    window.location.reload();
  }
</script>

<div class="connection-status">
  <div class="status-indicator {$connectionStatus.connected ? 'connected' : 'disconnected'}">
    <div class="status-dot"></div>
    <span class="status-text">
      {#if $connectionStatus.connected}
        Connected
      {:else if $connectionStatus.reconnecting}
        Reconnecting (Attempt {$connectionStatus.reconnectAttempt})
      {:else}
        Disconnected
      {/if}
    </span>
  </div>
  
  <div class="status-details">
    {#if $connectionStatus.connected}
      <div class="ping-info">
        <span class="ping-label">Last ping:</span>
        <span class="ping-value">{timeSinceLastPing}</span>
      </div>
      
      {#if $connectionStatus.pingLatency !== null}
        <div class="latency-info">
          <span class="latency-label">Latency:</span>
          <span class="latency-value {getLatencyClass($connectionStatus.pingLatency)}">
            {$connectionStatus.pingLatency}ms
          </span>
        </div>
      {/if}
    {:else if $connectionStatus.lastError}
      <div class="error-info">
        <span class="error-label">Error:</span>
        <span class="error-value">{$connectionStatus.lastError}</span>
      </div>
    {/if}
  </div>
  
  {#if !$connectionStatus.connected && !$connectionStatus.reconnecting}
    <button class="reconnect-button" on:click={handleReconnect}>
      Reconnect
    </button>
  {/if}
</div>

<style>
  .connection-status {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background-color: transparent;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    width: 100%;
    max-width: 300px;
  }
  
  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: bold;
  }
  
  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  
  .connected .status-dot {
    background-color: #4CAF50;
    box-shadow: 0 0 5px #4CAF50;
  }
  
  .disconnected .status-dot {
    background-color: #F44336;
    box-shadow: 0 0 5px #F44336;
  }
  
  .connected .status-text {
    color: #4CAF50;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
  
  .disconnected .status-text {
    color: #F44336;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
  
  .status-details {
    font-size: 0.9rem;
    color: #ffffff;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
  
  .ping-info, .latency-info, .error-info {
    display: flex;
    justify-content: space-between;
    width: 100%;
  }
  
  .ping-label, .latency-label, .error-label {
    color: #dddddd;
    flex-shrink: 0;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
  
  .ping-value, .latency-value, .error-value {
    width: 110px;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
  
  .latency-value.good {
    color: #4CAF50;
  }
  
  .latency-value.medium {
    color: #FFC107;
  }
  
  .latency-value.poor {
    color: #F44336;
  }
  
  .latency-value.unknown {
    color: #9E9E9E;
  }
  
  .error-value {
    color: #F44336;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .reconnect-button {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background-color: #2196F3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: background-color 0.2s;
  }
  
  .reconnect-button:hover {
    background-color: #0b7dda;
  }
  
  /* Responsive adjustments for mobile devices */
  @media (max-width: 768px) {
    .connection-status {
      padding: 0.5rem;
      gap: 0.25rem;
    }
    
    .status-details {
      font-size: 0.8rem;
    }
  }
</style>