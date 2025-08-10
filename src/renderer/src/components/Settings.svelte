<script lang="ts">
  import { onMount } from 'svelte';
  import logger from '../lib/utils/logger';
  import settingsService, { settings } from '../services/settingsService';

  // Subscribe to settings store
  let state;
  const unsubscribe = settings.subscribe(s => {
    state = s;
  });

  // Local reference to make binding easier
  let portValue;
  // Initialize portValue when state changes
  $: if (state?.reaperConfig) {
    portValue = state.reaperConfig.port;
  }

  // Reactive declarations for settings state
  $: loading = state?.loading || false;
  $: saving = state?.saving || false;
  $: error = state?.error || '';
  $: successMessage = state?.successMessage || '';

  // MIDI specific reactive declarations
  $: midiConfig = state?.midiConfig || { enabled: true, noteMappings: [] };
  $: midiDevices = state?.midiDevices || [];

  // MIDI form values
  let enabledValue = true;
  let selectedDeviceName = '';
  let selectedChannel: number | null = null;
  let newNoteNumber = '';
  let newNoteAction = '';

  // Available actions for MIDI notes
  const availableActions = [
    { id: 'togglePlay', name: 'Toggle Play/Pause' },
    { id: 'pause', name: 'Pause' },
    { id: 'toggleAutoplay', name: 'Toggle Autoplay' },
    { id: 'toggleCountIn', name: 'Toggle Count-In' },
    { id: 'nextRegion', name: 'Next Region' },
    { id: 'previousRegion', name: 'Previous Region' },
    { id: 'seekToCurrentRegionStart', name: 'Seek to Current Region Start' }
  ];

  // Initialize MIDI form values from config
  $: if (midiConfig) {
    enabledValue = midiConfig.enabled;
    selectedDeviceName = midiConfig.deviceName || '';
    selectedChannel = midiConfig.channel;
  }

  // Get channel options
  const channelOptions = [
    { value: null, label: 'All Channels' },
    ...Array.from({ length: 16 }, (_, i) => ({ value: i, label: `Channel ${i + 1}` }))
  ];

  // Handle Reaper config form submission
  function handleReaperConfigSubmit() {
    settingsService.saveReaperConfig({ port: portValue });
  }

  // Handle MIDI settings form submission
  function handleMidiSettingsSubmit() {
    settingsService.saveMidiConfig({
      enabled: enabledValue,
      deviceName: selectedDeviceName || undefined,
      channel: selectedChannel
    });
  }

  // Handle adding a new note mapping
  function handleAddNoteMapping() {
    const noteNumber = parseInt(newNoteNumber, 10);
    if (isNaN(noteNumber) || noteNumber < 0 || noteNumber > 127) {
      state = { ...state, error: 'Note number must be between 0 and 127' };
      return;
    }

    if (!newNoteAction) {
      state = { ...state, error: 'Please select an action' };
      return;
    }

    settingsService.updateNoteMapping(noteNumber, newNoteAction)
      .then(success => {
        if (success) {
          // Clear form
          newNoteNumber = '';
          newNoteAction = '';
        }
      });
  }

  // Handle removing a note mapping
  function handleRemoveNoteMapping(noteNumber: number) {
    settingsService.removeNoteMapping(noteNumber);
  }

  // Handle connecting to a MIDI device
  function handleConnectToDevice(deviceName: string) {
    settingsService.connectToDevice(deviceName);
  }

  // Get action name from ID
  function getActionName(actionId: string): string {
    const action = availableActions.find(a => a.id === actionId);
    return action ? action.name : actionId;
  }

  onMount(() => {
    logger.log('Settings component mounted');
    settingsService.init();

    return () => {
      logger.log('Settings component destroyed');
      unsubscribe();
    };
  });
</script>

<div class="component-container">
  <div class="component-header">
    <h1>Settings</h1>
  </div>

  <div class="component-cards">
    <div class="component-card">
      <h3 class="component-section-heading">Reaper Connection Settings</h3>

      {#if loading}
        <div class="component-loading">Loading settings...</div>
      {:else}
        <form on:submit|preventDefault={handleReaperConfigSubmit}>
          <div class="component-form-group">
            <div class="component-form-group-content">
              <label class="component-label" for="reaper-port">Reaper Web Interface Port</label>
              <p class="component-description">
                The port used by Reaper's web interface. Default is 8080.
                Change this if Reaper is configured to use a different port
                or if port 8080 is already in use by another application.
              </p>
            </div>
            <div class="component-form-group-input">
              <input
                class="component-input"
                type="number"
                id="reaper-port"
                bind:value={portValue}
                min="1"
                max="65535"
                disabled={saving}
              />
            </div>
          </div>

          {#if error}
            <div class="component-error-message">{error}</div>
          {/if}

          {#if successMessage}
            <div class="component-success-message">{successMessage}</div>
          {/if}

          <div class="component-actions">
            <button type="submit" class="component-button" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      {/if}
    </div>

    <div class="component-card">
      <h3 class="component-section-heading">MIDI Settings</h3>

      {#if loading}
        <div class="component-loading">Loading MIDI settings...</div>
      {:else}
        <form on:submit|preventDefault={handleMidiSettingsSubmit}>
          <div class="component-form-group">
            <div class="component-form-group-content">
              <label class="component-label" for="midi-enabled">Enable MIDI</label>
              <p class="component-description">
                Enable or disable MIDI input for controlling Reaper.
              </p>
            </div>
            <div class="component-form-group-input">
              <input
                class="component-checkbox"
                type="checkbox"
                id="midi-enabled"
                bind:checked={enabledValue}
                disabled={saving}
              />
            </div>
          </div>

          <div class="component-form-group">
            <div class="component-form-group-content">
              <label class="component-label" for="midi-device">MIDI Device</label>
              <p class="component-description">
                Select a MIDI input device to use. If no device is selected, all connected devices will be used.
              </p>
            </div>
            <div class="component-form-group-input">
              <select
                class="component-select"
                id="midi-device"
                bind:value={selectedDeviceName}
                disabled={saving || !enabledValue}
              >
                <option value="null">All Available Devices</option>
                {#each midiDevices as device}
                  <option value={device.name}>{device.name} {device.isConnected ? '(Connected)' : ''}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="component-form-group">
            <div class="component-form-group-content">
              <label class="component-label" for="midi-channel">MIDI Channel</label>
              <p class="component-description">
                Select which MIDI channel to listen to. If "All Channels" is selected, notes from any channel will be accepted.
              </p>
            </div>
            <div class="component-form-group-input">
              <select
                class="component-select"
                id="midi-channel"
                bind:value={selectedChannel}
                disabled={saving || !enabledValue}
              >
                {#each channelOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>
          </div>

          {#if error}
            <div class="component-error-message">{error}</div>
          {/if}

          {#if successMessage}
            <div class="component-success-message">{successMessage}</div>
          {/if}

          <div class="component-actions">
            <button type="submit" class="component-button" disabled={saving}>
              {saving ? 'Saving...' : 'Save MIDI Settings'}
            </button>
          </div>
        </form>

        <h4 class="component-subsection-heading">MIDI Note Mappings</h4>
        <p class="component-description">
          Configure which actions are triggered by specific MIDI notes.
        </p>

        {#if midiConfig.noteMappings.length > 0}
          <table class="component-table">
            <thead>
              <tr>
                <th class="shrink">Note</th>
                <th>Action</th>
                <th class="shrink">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each midiConfig.noteMappings as mapping}
                <tr>
                  <td>{mapping.noteNumber}</td>
                  <td>{getActionName(mapping.action)}</td>
                  <td>
                    <button
                      type="button"
                      class="component-button component-button-small component-button-danger"
                      on:click={() => handleRemoveNoteMapping(mapping.noteNumber)}
                      disabled={saving}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="component-empty-state">No MIDI note mappings configured.</p>
        {/if}

        <form on:submit|preventDefault={handleAddNoteMapping} class="component-form-add-mapping">
          <h5 class="component-subsection-heading">Add New Mapping</h5>

          <div class="component-form-group">
            <div class="component-form-group-content">
              <label class="component-label" for="new-note-number">MIDI Note Number (0-127)</label>
              <p class="component-description">
                Enter a MIDI note number between 0 and 127.
              </p>
            </div>
            <div class="component-form-group-input">
              <input
                class="component-input"
                type="number"
                id="new-note-number"
                bind:value={newNoteNumber}
                min="0"
                max="127"
                disabled={saving || !enabledValue}
                required
              />
            </div>
          </div>

          <div class="component-form-group">
            <div class="component-form-group-content">
              <label class="component-label" for="new-note-action">Action</label>
              <p class="component-description">
                Select the action to trigger when this MIDI note is received.
              </p>
            </div>
            <div class="component-form-group-input">
              <select
                class="component-select"
                id="new-note-action"
                bind:value={newNoteAction}
                disabled={saving || !enabledValue}
                required
              >
                <option value="">Select an action</option>
                {#each availableActions as action}
                  <option value={action.id}>{action.name}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="component-actions">
            <button type="submit" class="component-button" disabled={saving || !enabledValue}>
              Add Mapping
            </button>
          </div>
        </form>
      {/if}
    </div>
  </div>
</div>

<style>
  /* All styling is now handled by component-layouts.css and component-headers.css */

  /* Custom styling for select dropdowns */
  .component-select {
    width: 100%;
    padding: 0.6rem;
    border: 1px solid #444;
    border-radius: 4px;
    background-color: #333;
    color: #ffffff;
    font-size: 1rem;
    appearance: none; /* Removes default browser styling */
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.6rem center;
    padding-right: 2.5rem; /* Make room for the arrow */
  }

  .component-select:focus {
    outline: none;
    border-color: #4CAF50;
    box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
  }

  .component-form-add-mapping {
    margin-top: 2rem;
    padding-top: 1rem;
  }

  .component-table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
  }

  .component-table th,
  .component-table td {
    padding: 0.5rem;
    text-align: left;
    border-bottom: 1px solid #ccc;

    &.shrink {
      width: 1%;
      white-space: nowrap;
    }
  }

  .component-empty-state {
    padding: 1rem;
    background-color: #f5f5f5;
    border-radius: 4px;
    font-style: italic;
  }

  .component-button-small {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
  }

  .component-button-danger {
    background-color: #e74c3c;
  }

  .component-button-danger:hover {
    background-color: #c0392b;
  }

  .component-checkbox {
    width: 1.5rem;
    height: 1.5rem;
  }

  .component-subsection-heading {
    margin-top: 2rem;
    margin-bottom: 0.5rem;
    font-size: 1.1rem;
  }
</style>
