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
  $: loading = state?.loading || false;
  $: saving = state?.saving || false;
  $: error = state?.error || '';
  $: successMessage = state?.successMessage || '';

  // Handle form submission
  function handleSubmit() {
    settingsService.saveReaperConfig({ port: portValue });
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
        <form on:submit|preventDefault={handleSubmit}>
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

    <!-- Additional settings cards can be added here in the future -->
  </div>
</div>

<style>
  /* All styling is now handled by component-layouts.css and component-headers.css */
</style>
