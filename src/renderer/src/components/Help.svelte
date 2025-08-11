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
        <li class="component-list-item">Press add if you don't have a <span class="component-strong">"web browser interface"</span> added to the list</li>
        <li class="component-list-item">Check <span class="component-strong">"Run web server on port"</span> checkmark</li>
        <li class="component-list-item">Set <span class="component-strong">Port:</span> to <span class="component-strong">{reaperPort}</span></li>
        <li class="component-list-item">Do not set a password</li>
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
      <h2 class="component-section-heading">Step 4: Configure MIDI Control (Optional)</h2>
      <p>
        You can control the app using MIDI notes from connected MIDI devices:
      </p>
      <ol class="component-list">
        <li class="component-list-item">Go to <span class="component-strong">Settings</span> in the app</li>
        <li class="component-list-item">In the <span class="component-strong">MIDI Settings</span> section:
          <ul class="component-list">
            <li class="component-list-item">Ensure <span class="component-strong">Enable MIDI</span> is checked</li>
            <li class="component-list-item">Optionally select a specific MIDI device (or leave as "All Available Devices")</li>
            <li class="component-list-item">Choose a MIDI channel to listen to, or leave as "All Channels"</li>
          </ul>
        </li>
        <li class="component-list-item">In the <span class="component-strong">MIDI Note Mappings</span> section:
          <ul class="component-list">
            <li class="component-list-item">Add mappings by entering a MIDI note number (0-127) and selecting an action</li>
            <li class="component-list-item">Remove mappings by clicking the "Remove" button</li>
          </ul>
        </li>
        <li class="component-list-item">Once configured, the app will respond to MIDI note-on messages from your connected devices</li>
      </ol>
      <p class="component-note">
        Note: MIDI notes can trigger various actions like play/pause, next/previous region, toggle autoplay, and more.
      </p>
    </div>

    <div class="component-section">
      <h2 class="component-section-heading">Special Markers</h2>
      <p>
        Reaper Control supports special markers that can be placed within regions to control various behaviors:
      </p>

      <h3 class="component-subsection-heading">Marker Placement</h3>
      <p>
        All special markers must be placed within 0.001 seconds of the region boundaries. This ensures the app correctly identifies them as belonging to the region.
      </p>

      <h3 class="component-subsection-heading">!1008 Marker</h3>
      <p>
        The <span class="component-strong">!1008</span> marker creates a hard stop at the end of a region:
      </p>
      <ul class="component-list">
        <li class="component-list-item">Format: <span class="component-strong">!1008</span> (add this anywhere in a marker name)</li>
        <li class="component-list-item">When playback reaches the end of a region with this marker, it will stop completely</li>
        <li class="component-list-item">Useful for sections that must end definitively rather than continuing to the next section</li>
        <li class="component-list-item">Example: <span class="component-code">End Section !1008</span></li>
      </ul>

      <h3 class="component-subsection-heading">!bpm Marker</h3>
      <p>
        The <span class="component-strong">!bpm</span> marker strictly tells the app at which BPM the song begins:
      </p>
      <ul class="component-list">
        <li class="component-list-item">Format: <span class="component-strong">!bpm:120</span> (where 120 is the BPM value)</li>
        <li class="component-list-item">Helps count in on marker when the song is not playing and the BPM is not detected for a song</li>
        <li class="component-list-item">Sets the tempo used for internal calculations like count-in duration</li>
        <li class="component-list-item">Note: This doesn't change Reaper's project tempo, it's only used by the app</li>
        <li class="component-list-item">Example: <span class="component-code">!bpm:120</span></li>
      </ul>

      <h3 class="component-subsection-heading">!length Marker</h3>
      <p>
        The <span class="component-strong">!length</span> marker defines a custom duration for a region and should only be used in combination with a <span class="component-strong">!1008</span> marker:
      </p>
      <ul class="component-list">
        <li class="component-list-item">Format: <span class="component-strong">!length:45</span> (where 45 is the length in seconds)</li>
        <li class="component-list-item">Overrides the actual region length for playback timing purposes</li>
        <li class="component-list-item">Typically used when the song is only a count in or a bit of the song when you don't want to play on click as a band</li>
        <li class="component-list-item">Helps approximate the total timer of the setlist to get closer to the actual real-time duration</li>
        <li class="component-list-item">Example: <span class="component-code">!length:45 !1008</span></li>
      </ul>

      <h3 class="component-subsection-heading">Combined Usage</h3>
      <p>
        Multiple markers can be used together in the same region:
      </p>
      <ul class="component-list">
        <li class="component-list-item">The markers can appear in any order in the marker name</li>
        <li class="component-list-item">Example: <span class="component-code">!length:45 !bpm:140 !1008</span></li>
        <li class="component-list-item">This would set a custom length of 45 seconds, a tempo of 140 BPM, and make the region stop completely at its end</li>
      </ul>
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
