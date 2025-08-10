<script lang="ts">
  import { navigateTo, View } from '../stores/navigationStore';
  import { onMount } from 'svelte';
  import ipcService from '../services/ipcService';

  // State for the Reaper port
  let reaperPort = 8080;

  // Get the configured port on component mount
  onMount(async () => {
    try {
      const config = await ipcService.getReaperConfig();
      reaperPort = config.port;
    } catch (error) {
      console.error('Error getting Reaper config:', error);
    }
  });

  // Function to handle returning to the main view
  function goBack() {
    navigateTo(View.MAIN);
  }
</script>

<div class="component-container">
  <div class="component-header">
    <h1>Reaper Control Setup Guide</h1>
  </div>

  <div class="component-cards">
    <div class="component-section">
      <h2 class="component-section-heading">Setting Up Reaper to Work with Reaper Control</h2>
      <p>
        This guide will help you configure Reaper to work properly with the Reaper Control app.
        Follow these steps to ensure smooth integration between Reaper and this application.
      </p>
    </div>

    <div class="component-section">
      <h2 class="component-section-heading">Step 1: Configure Reaper Web Interface</h2>
      <p>
        The app now uses Reaper's built-in web browser interface for communication:
      </p>
      <ol class="component-list">
        <li class="component-list-item">In Reaper, go to <span class="component-strong">Options → Preferences</span></li>
        <li class="component-list-item">Navigate to <span class="component-strong">Control/OSC/web</span></li>
        <li class="component-list-item">In the <span class="component-strong">Web browser interface</span> section:</li>
        <li class="component-list-item">Make sure <span class="component-strong">"Enable web browser interface"</span> is checked</li>
        <li class="component-list-item">Set <span class="component-strong">Port:</span> to <span class="component-strong">{reaperPort}</span></li>
        <li class="component-list-item">Ensure <span class="component-strong">"Allow all IPs to connect"</span> is enabled for local network access</li>
        <li class="component-list-item">For security, you may set a password if needed</li>
        <li class="component-list-item">Click <span class="component-strong">Apply</span> and <span class="component-strong">OK</span></li>
      </ol>
      <p class="component-note">
        Note: The app is configured to connect to Reaper's web interface on port {reaperPort}. If you change this port in Reaper, you'll need to update the configuration in the app settings as well.
      </p>
    </div>

    <div class="component-section">
      <h2 class="component-section-heading">Step 2: Working with Markers and Regions</h2>
      <p>
        The Reaper Control app works with markers and regions in your project:
      </p>
      <ol class="component-list">
        <li class="component-list-item">Create regions in your Reaper project to define sections you want to control</li>
        <li class="component-list-item">Use meaningful names for your regions as these will appear in the app</li>
        <li class="component-list-item">To create a region, click and drag in the ruler area and press <span class="component-strong">Shift+R</span></li>
        <li class="component-list-item">Double-click on the region to edit its name and color</li>
        <li class="component-list-item">You can also use markers (press <span class="component-strong">M</span>) to define points you want to quickly navigate to</li>
      </ol>
    </div>

    <div class="component-section">
      <h2 class="component-section-heading">Step 3: Connect the App</h2>
      <p>
        To connect the Reaper Control app to Reaper:
      </p>
      <ol class="component-list">
        <li class="component-list-item">Make sure Reaper is running with the web interface enabled on port {reaperPort}</li>
        <li class="component-list-item">Launch the Reaper Control app</li>
        <li class="component-list-item">The app should automatically connect to Reaper</li>
        <li class="component-list-item">Check the connection status indicator in the app's header</li>
        <li class="component-list-item">If not connected, verify that:
          <ul class="component-list">
            <li class="component-list-item">Reaper is running</li>
            <li class="component-list-item">The web interface is properly configured in Reaper on port {reaperPort}</li>
            <li class="component-list-item">No firewall is blocking the connection</li>
          </ul>
        </li>
      </ol>
    </div>

    <div class="component-section">
      <h2 class="component-section-heading">Troubleshooting</h2>
      <p>
        If you're experiencing issues with the connection:
      </p>
      <ul class="component-list">
        <li class="component-list-item">Make sure Reaper is running before starting the app</li>
        <li class="component-list-item">Verify the web interface is enabled in Reaper on port {reaperPort}</li>
        <li class="component-list-item">Try accessing the Reaper web interface directly in your browser at <span class="component-strong">http://localhost:{reaperPort}</span> to confirm it's working</li>
        <li class="component-list-item">Restart both Reaper and the app</li>
        <li class="component-list-item">Check your firewall settings to ensure it's not blocking communication on port {reaperPort}</li>
      </ul>
    </div>
  </div>
</div>

<style>
  /* All styling is now handled by component-layouts.css and component-headers.css */
</style>
