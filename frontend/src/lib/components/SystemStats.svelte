<script>
  import { onMount, onDestroy } from 'svelte';
  import { io } from 'socket.io-client';
  import { SOCKET_URL, SOCKET_OPTIONS } from '$lib/config/socketConfig';
  import { connectionStatus } from '$lib/stores/socket';
  
    // Socket instance
    let socket;
  
    // System stats data
  let stats = {
    cpu: {
      usage: 0,
      cores: 0,
      speed: 0
    },
    memory: {
      total: 0,
      used: 0,
      free: 0,
      usedPercent: 0
    },
    lastUpdated: 0
  };

  // Combined memory usage
  let combinedMemoryUsage = {
    nodeBackend: 0,
    electron: 0,
    svelte: 0,
    total: 0,
    usedPercent: 0
  };
  
  // Electron detection
  let isElectron = false;
  let electronVersion = '';
  
  // Popover state
  let showPopover = false;
  
  // Format bytes to human-readable format
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  // Get color class based on usage percentage
  function getUsageClass(percentage) {
    if (percentage < 50) return 'low';
    if (percentage < 80) return 'medium';
    return 'high';
  }
  
  // Toggle popover visibility
  function togglePopover() {
    showPopover = !showPopover;
  }
  
  // Close popover when clicking outside
  function handleClickOutside(event) {
    if (typeof document !== 'undefined' && event && event.target) {
      if (showPopover && 
          !event.target.closest('.system-stats-menu') && 
          !event.target.closest('.system-stats-popover')) {
        showPopover = false;
      }
    }
  }
  
  // Socket event handler for system stats
  function handleSystemStats(data) {
    stats = data;
    
    // Update combined memory usage
    // Node backend memory usage (from stats)
    combinedMemoryUsage.nodeBackend = stats.memory.used;
    
    // Estimate Electron main process memory usage (if running in Electron)
    // This is a rough estimate as we don't have direct access to the main process memory
    if (isElectron) {
      // Estimate Electron main process memory as a percentage of the backend memory
      // This is just an estimate - in a real app you might want to use IPC to get actual values
      combinedMemoryUsage.electron = Math.round(stats.memory.used * 0.3); // 30% of backend as an estimate
    } else {
      combinedMemoryUsage.electron = 0;
    }
    
    // Estimate Svelte frontend memory usage using performance API if available
    if (typeof window !== 'undefined' && window.performance && window.performance.memory) {
      combinedMemoryUsage.svelte = window.performance.memory.usedJSHeapSize;
    } else {
      // If performance API is not available, estimate based on backend memory
      combinedMemoryUsage.svelte = Math.round(stats.memory.used * 0.2); // 20% of backend as an estimate
    }
    
    // Calculate total combined memory usage
    combinedMemoryUsage.total = combinedMemoryUsage.nodeBackend + combinedMemoryUsage.electron + combinedMemoryUsage.svelte;
    
    // Calculate percentage of total system memory
    combinedMemoryUsage.usedPercent = Math.round((combinedMemoryUsage.total / stats.memory.total) * 100);
  }
  
  onMount(() => {
    // Initialize socket connection if in browser environment
    if (typeof window !== 'undefined') {
      socket = io(SOCKET_URL, SOCKET_OPTIONS);
      
      // Listen for system stats updates
      socket.on('systemStats', handleSystemStats);
      
      // Check if running in Electron by looking for the electronAPI exposed by the preload script
      isElectron = window.electronAPI && window.electronAPI.isElectron || false;

      // If we're in Electron, we can access the electronAPI
      if (isElectron && window.electronAPI) {
        // We could get more info from the Electron API if needed
        electronVersion = 'Electron API available';
      }
    }
    
    // Add click outside listener
    if (typeof document !== 'undefined') {
      document.addEventListener('click', handleClickOutside);
    }
  });
  
  onDestroy(() => {
    // Clean up socket connection
    if (socket) {
      socket.off('systemStats', handleSystemStats);
      socket.disconnect();
    }
    
    // Remove click outside listener
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', handleClickOutside);
    }
  });
</script>

<svelte:window on:click={handleClickOutside} />

<div class="system-stats-menu" on:click={togglePopover}>
  <div class="stats-icon">
    <div class="connection-dot {$connectionStatus.connected ? 'connected' : 'disconnected'}"></div>
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 20V10"></path>
      <path d="M12 20V4"></path>
      <path d="M6 20v-6"></path>
    </svg>
    <div class="usage-indicator">
      <div class="cpu-bar {getUsageClass(stats.cpu.usage)}" style="width: {stats.cpu.usage}%"></div>
    </div>
  </div>
  
  {#if showPopover}
    <div class="system-stats-popover">
      <div class="popover-header">
        <h3>Application Resources</h3>
      </div>
      
      <div class="popover-content">
        <div class="stats-section">
          <h4>Environment</h4>
          <div class="stats-details">
            <div class="stat-item">
              <span class="stat-label">Runtime:</span>
              <span class="stat-value {isElectron ? 'electron-status' : 'browser-status'}">
                {#if isElectron}
                  Running in Electron
                {:else}
                  Running in browser
                {/if}
              </span>
            </div>
            {#if isElectron && electronVersion}
              <div class="stat-item">
                <span class="stat-label">Electron:</span>
                <span class="stat-value">{electronVersion}</span>
              </div>
            {/if}
            <div class="stat-item">
              <span class="stat-label">Connection:</span>
              <span class="stat-value {$connectionStatus.connected ? 'connected-status' : 'disconnected-status'}">
                {#if $connectionStatus.connected}
                  Connected
                {:else if $connectionStatus.reconnecting}
                  Reconnecting (Attempt {$connectionStatus.reconnectAttempt})
                {:else}
                  Disconnected
                {/if}
              </span>
            </div>
            {#if $connectionStatus.connected && $connectionStatus.pingLatency !== null}
              <div class="stat-item">
                <span class="stat-label">Latency:</span>
                <span class="stat-value {getUsageClass($connectionStatus.pingLatency < 100 ? 0 : $connectionStatus.pingLatency < 300 ? 50 : 90)}">
                  {$connectionStatus.pingLatency}ms
                </span>
              </div>
            {/if}
          </div>
        </div>
        
        <div class="stats-section">
          <h4>CPU Usage</h4>
          <div class="usage-bar">
            <div class="usage-fill {getUsageClass(stats.cpu.usage)}" style="width: {stats.cpu.usage}%"></div>
            <span class="usage-text">{stats.cpu.usage}%</span>
          </div>
          <div class="stats-details">
            <div class="stat-item">
              <span class="stat-label">Available Cores:</span>
              <span class="stat-value">{stats.cpu.cores}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">CPU Speed:</span>
              <span class="stat-value">{stats.cpu.speed} GHz</span>
            </div>
          </div>
        </div>
        
        <div class="stats-section">
          <h4>Memory Usage</h4>
          <div class="usage-bar">
            <div class="usage-fill {getUsageClass(combinedMemoryUsage.usedPercent)}" style="width: {combinedMemoryUsage.usedPercent}%"></div>
            <span class="usage-text">{combinedMemoryUsage.usedPercent}%</span>
          </div>
          <div class="stats-details">
            <div class="stat-item">
              <span class="stat-label">Total:</span>
              <span class="stat-value">{formatBytes(combinedMemoryUsage.total)}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Node Backend:</span>
              <span class="stat-value">{formatBytes(combinedMemoryUsage.nodeBackend)}</span>
            </div>
            {#if isElectron}
            <div class="stat-item">
              <span class="stat-label">Electron:</span>
              <span class="stat-value">{formatBytes(combinedMemoryUsage.electron)}</span>
            </div>
            {/if}
            <div class="stat-item">
              <span class="stat-label">Svelte:</span>
              <span class="stat-value">{formatBytes(combinedMemoryUsage.svelte)}</span>
            </div>
          </div>
        </div>
        
        <div class="last-updated">
          Last updated: {new Date(stats.lastUpdated).toLocaleTimeString()}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .system-stats-menu {
    position: relative;
    display: flex;
    align-items: center;
    cursor: pointer;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background-color 0.2s;
  }
  
  .system-stats-menu:hover {
    background-color: #333;
  }
  
  .stats-icon {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #aaa;
  }
  
  .stats-icon svg {
    flex-shrink: 0;
  }
  
  .connection-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  
  .connection-dot.connected {
    background-color: #4CAF50;
    box-shadow: 0 0 5px #4CAF50;
  }
  
  .connection-dot.disconnected {
    background-color: #F44336;
    box-shadow: 0 0 5px #F44336;
  }
  
  .usage-indicator {
    width: 30px;
    height: 8px;
    background-color: #333;
    border-radius: 4px;
    overflow: hidden;
  }
  
  .cpu-bar {
    height: 100%;
    transition: width 0.5s ease;
  }
  
  .cpu-bar.low {
    background-color: #4CAF50;
  }
  
  .cpu-bar.medium {
    background-color: #FFC107;
  }
  
  .cpu-bar.high {
    background-color: #F44336;
  }
  
  .system-stats-popover {
    position: absolute;
    top: calc(100% + 5px);
    right: 0;
    background-color: #1e1e1e;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    width: 280px;
    z-index: 1000;
    overflow: hidden;
  }
  
  .popover-header {
    padding: 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .popover-header h3 {
    margin: 0;
    font-size: 1rem;
    color: #fff;
  }
  
  .popover-content {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .stats-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .stats-section h4 {
    margin: 0;
    font-size: 0.9rem;
    color: #ddd;
  }
  
  .usage-bar {
    position: relative;
    height: 20px;
    background-color: #333;
    border-radius: 4px;
    overflow: hidden;
  }
  
  .usage-fill {
    height: 100%;
    transition: width 0.5s ease;
  }
  
  .usage-fill.low {
    background-color: #4CAF50;
  }
  
  .usage-fill.medium {
    background-color: #FFC107;
  }
  
  .usage-fill.high {
    background-color: #F44336;
  }
  
  .usage-text {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: bold;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
  
  .stats-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .stat-item {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
  }
  
  .stat-label {
    color: #aaa;
  }
  
  .stat-value {
    color: #fff;
    font-family: monospace;
  }
  
  .last-updated {
    font-size: 0.75rem;
    color: #777;
    text-align: right;
    margin-top: 0.5rem;
  }
  
  /* Status styles */
  .electron-status {
    color: #2ecc71;
  }
  
  .browser-status {
    color: #3498db;
  }
  
  .connected-status {
    color: #4CAF50;
  }
  
  .disconnected-status {
    color: #F44336;
  }
  
  /* Responsive adjustments for mobile devices */
  @media (max-width: 768px) {
    .system-stats-popover {
      width: 250px;
    }
    
    .popover-content {
      padding: 0.5rem;
      gap: 0.75rem;
    }
    
    .stats-section h4 {
      font-size: 0.8rem;
    }
    
    .usage-bar {
      height: 16px;
    }
    
    .usage-text {
      font-size: 0.8rem;
    }
    
    .stat-item {
      font-size: 0.75rem;
    }
  }
</style>