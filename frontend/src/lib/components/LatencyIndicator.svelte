<script>
  import { connectionStatus } from '$lib/stores/socket';
  
  // Format latency with color coding
  function getLatencyClass(latency) {
    if (latency === null) return 'unknown';
    if (latency < 100) return 'good';
    if (latency < 300) return 'medium';
    return 'poor';
  }
</script>

{#if $connectionStatus.connected && $connectionStatus.pingLatency !== null}
  <div class="latency-indicator">
    <span class="latency-value {getLatencyClass($connectionStatus.pingLatency)}">
      {$connectionStatus.pingLatency}ms
    </span>
  </div>
{/if}

<style>
  .latency-indicator {
    position: fixed;
    top: 10px;
    right: 10px;
    font-size: 0.9rem;
    font-weight: bold;
    padding: 4px 8px;
    background-color: rgba(42, 42, 42, 0.8);
    border-radius: 4px;
    z-index: 1000;
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
  
  /* Hide on mobile devices */
  @media (max-width: 768px) {
    .latency-indicator {
      display: none;
    }
  }
</style>