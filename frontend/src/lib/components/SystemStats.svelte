<script>
  import { onMount, onDestroy } from 'svelte';
  import { io } from 'socket.io-client';
  import { SOCKET_URL, SOCKET_OPTIONS } from '$lib/config/socketConfig';
  
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
  }
  
  onMount(() => {
    // Initialize socket connection if in browser environment
    if (typeof window !== 'undefined') {
      socket = io(SOCKET_URL, SOCKET_OPTIONS);
      
      // Listen for system stats updates
      socket.on('systemStats', handleSystemStats);
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
            <div class="usage-fill {getUsageClass(stats.memory.usedPercent)}" style="width: {stats.memory.usedPercent}%"></div>
            <span class="usage-text">{stats.memory.usedPercent}%</span>
          </div>
          <div class="stats-details">
            <div class="stat-item">
              <span class="stat-label">RSS:</span>
              <span class="stat-value">{formatBytes(stats.memory.used)}</span>
            </div>
            {#if stats.memory.heapTotal !== undefined}
              <div class="stat-item">
                <span class="stat-label">Heap Total:</span>
                <span class="stat-value">{formatBytes(stats.memory.heapTotal)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Heap Used:</span>
                <span class="stat-value">{formatBytes(stats.memory.heapUsed)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">External:</span>
                <span class="stat-value">{formatBytes(stats.memory.external)}</span>
              </div>
            {/if}
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