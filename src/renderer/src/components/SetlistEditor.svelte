<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    setlists,
    currentSetlist,
    setlistLoading,
    setlistError,
    clearSetlistError,
    fetchSetlists,
    fetchSetlist,
    createSetlist,
    updateSetlist,
    deleteSetlist,
    addSetlistItem,
    removeSetlistItem,
    moveSetlistItem,
    initializeSetlistStore,
    cleanupSetlistStore
  } from '../stores/setlistStore';
  import { regions } from '../stores/regionStore';
  import { playbackState } from '../stores/playbackStore';
  import ipcService from '../services/ipcService';

  // Local state
  let newSetlistName = '';
  let editingSetlistId: string | null = null;
  let editingSetlistName = '';
  let showConfirmDelete = false;
  let setlistToDelete: { id: string, name: string } | null = null;

  // Button processing states
  let processingAddButtons = new Set<string>();
  let processingRemoveButtons = new Set<string>();

  // Initialize the page on mount
  onMount(() => {
    initializeSetlistStore();
    fetchSetlists();
    ipcService.refreshRegions();

    // Check if there's already a selected setlist in the playback state
    const unsubscribe = playbackState.subscribe(state => {
      if (state.selectedSetlistId) {
        // Re-execute selectSetlist with the ID from playback state
        selectSetlist(state.selectedSetlistId);
      }
    });
    unsubscribe();
  });

  // Clean up event listeners when component is destroyed
  onDestroy(() => {
    cleanupSetlistStore();
  });

  /**
   * Handle creating a new setlist
   * @param name - The name of the new setlist
   */
  async function handleCreateSetlist(name: string): Promise<void> {
    if (!name.trim()) return;

    await createSetlist(name);
    newSetlistName = '';
  }

  /**
   * Start editing a setlist
   * @param setlist - The setlist to edit
   */
  function startEditingSetlist(setlist: { id: string, name: string }): void {
    editingSetlistId = setlist.id;
    editingSetlistName = setlist.name;
  }

  /**
   * Cancel editing a setlist
   */
  function cancelEditingSetlist(): void {
    editingSetlistId = null;
    editingSetlistName = '';
  }

  /**
   * Save setlist edits
   * @param id - The ID of the setlist being edited
   * @param name - The new name for the setlist
   */
  async function saveSetlistEdits(id: string, name: string): Promise<void> {
    if (!name.trim()) return;

    await updateSetlist(id, name);
    editingSetlistId = null;
    editingSetlistName = '';
  }

  /**
   * Show delete confirmation
   * @param setlist - The setlist to delete
   */
  function confirmDeleteSetlist(setlist: { id: string, name: string }): void {
    setlistToDelete = setlist;
    showConfirmDelete = true;
  }

  /**
   * Cancel delete
   */
  function cancelDelete(): void {
    setlistToDelete = null;
    showConfirmDelete = false;
  }

  /**
   * Delete setlist
   * @param id - The ID of the setlist to delete
   */
  async function handleDeleteSetlist(id: string): Promise<void> {
    if (!id) return;

    await deleteSetlist(id);
    setlistToDelete = null;
    showConfirmDelete = false;
  }

  /**
   * Select a setlist
   * @param id - The ID of the setlist to select
   */
  async function selectSetlist(id: string): Promise<void> {
    await fetchSetlist(id);
    // Refresh regions to ensure available songs are loaded
    // This is especially important when navigating from player mode
    ipcService.refreshRegions();
  }

  /**
   * Add a region to the current setlist
   * @param regionId - The ID of the region to add
   * @param regionName - The name of the region to add
   */
  async function addRegionToSetlist(regionId: string, regionName: string): Promise<void> {
    if (!$currentSetlist) return;

    // Set processing state
    processingAddButtons = new Set(processingAddButtons).add(regionId);

    try {
      await addSetlistItem($currentSetlist.id, regionId, regionName);
    } finally {
      // Clear processing state
      processingAddButtons = new Set([...processingAddButtons].filter(id => id !== regionId));
    }
  }

  /**
   * Remove an item from the current setlist
   * @param itemId - The ID of the item to remove
   */
  async function removeItemFromSetlist(itemId: string): Promise<void> {
    if (!$currentSetlist) return;

    // Set processing state
    processingRemoveButtons = new Set(processingRemoveButtons).add(itemId);

    try {
      await removeSetlistItem($currentSetlist.id, itemId);
    } finally {
      // Clear processing state
      processingRemoveButtons = new Set([...processingRemoveButtons].filter(id => id !== itemId));
    }
  }

  /**
   * Move an item up in the setlist
   * @param itemId - The ID of the item to move
   * @param currentPosition - The current position of the item
   */
  async function moveItemUp(itemId: string, currentPosition: number): Promise<void> {
    if (!$currentSetlist || currentPosition <= 0) return;

    await moveSetlistItem($currentSetlist.id, itemId, currentPosition - 1);
  }

  /**
   * Move an item down in the setlist
   * @param itemId - The ID of the item to move
   * @param currentPosition - The current position of the item
   */
  async function moveItemDown(itemId: string, currentPosition: number): Promise<void> {
    if (!$currentSetlist || currentPosition >= $currentSetlist.items.length - 1) return;

    await moveSetlistItem($currentSetlist.id, itemId, currentPosition + 1);
  }

  /**
   * Check if a region is already in the current setlist
   * @param regionId - The ID of the region to check
   * @returns True if the region is in the setlist, false otherwise
   */
  function isRegionInSetlist(regionId: string): boolean {
    if (!$currentSetlist) return false;
    return $currentSetlist.items.some(item => item.regionId === regionId);
  }
</script>

<div class="setlist-editor-container">
  <h1>Setlist Editor</h1>

  {#if $setlistError}
    <div class="error-message">
      <p>{$setlistError}</p>
      <button on:click={clearSetlistError}>Dismiss</button>
    </div>
  {/if}

  <div class="setlist-layout">
    <!-- Left side: Setlist management -->
    <div class="setlist-management">
      <h2>Your Setlists</h2>

      <!-- Create new setlist form -->
      <div class="create-setlist">
        <h3>Create New Setlist</h3>
        <div class="form-group">
          <input
            type="text"
            bind:value={newSetlistName}
            placeholder="Enter setlist name"
            disabled={$setlistLoading}
          />
          <button
            on:click={() => handleCreateSetlist(newSetlistName)}
            disabled={!newSetlistName.trim() || $setlistLoading}
          >
            Create
          </button>
        </div>
      </div>

      <!-- Setlist list -->
      <div class="setlist-list">
        {#if $setlistLoading}
          <div class="loading">Loading setlists...</div>
        {:else if $setlists.length === 0}
          <div class="empty-state">
            <p>No setlists found</p>
            <p class="hint">Create your first setlist using the form above</p>
          </div>
        {:else}
          <ul>
            {#each $setlists as setlist (setlist.id)}
              <li class={$currentSetlist && $currentSetlist.id === setlist.id ? 'active' : ''}>
                {#if editingSetlistId === setlist.id}
                  <div class="edit-form">
                    <input
                      type="text"
                      bind:value={editingSetlistName}
                      placeholder="Setlist name"
                    />
                    <div class="edit-actions">
                      <button on:click={() => saveSetlistEdits(editingSetlistId, editingSetlistName)}>Save</button>
                      <button on:click={cancelEditingSetlist}>Cancel</button>
                    </div>
                  </div>
                {:else}
                  <div class="setlist-item">
                    <span
                      class="setlist-name"
                      on:click={() => selectSetlist(setlist.id)}
                    >
                      {setlist.name}
                    </span>
                    <div class="setlist-actions">
                      <button on:click={() => startEditingSetlist(setlist)}>Edit</button>
                      <button on:click={() => confirmDeleteSetlist(setlist)}>Delete</button>
                    </div>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    <!-- Right side: Current setlist and available regions -->
    <div class="setlist-content">
      {#if $currentSetlist}
        <div class="current-setlist">
          <h2>Editing: {$currentSetlist.name}</h2>

          <!-- Setlist items -->
          <div class="setlist-items">
            <h3>Setlist Items</h3>
            {#if $currentSetlist.items.length === 0}
              <div class="empty-state">
                <p>No items in this setlist</p>
                <p class="hint">Add songs from the list below</p>
              </div>
            {:else}
              <ul class="item-list">
                {#each $currentSetlist.items as item, index (item.id)}
                  <li>
                    <div class="item-info">
                      <span class="item-number">{index + 1}.</span>
                      <span class="item-name">{item.name}</span>
                    </div>
                    <div class="item-actions">
                      <button
                        on:click={() => moveItemUp(item.id, index)}
                        disabled={index === 0}
                        class="move-button"
                      >
                        ↑
                      </button>
                      <button
                        on:click={() => moveItemDown(item.id, index)}
                        disabled={index === $currentSetlist.items.length - 1}
                        class="move-button"
                      >
                        ↓
                      </button>
                      <button
                        on:click={() => removeItemFromSetlist(item.id)}
                        class="remove-button {processingRemoveButtons.has(item.id) ? 'processing' : ''}"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>

          <!-- Available regions -->
          <div class="available-regions">
            {#if $regions.length === 0}
              <div class="empty-state">
                <p>No regions found in Reaper project</p>
                <button on:click={() => ipcService.refreshRegions()}>
                  Refresh Regions
                </button>
              </div>
            {:else}
              {#if $regions.filter(region => !isRegionInSetlist(region.id)).length > 0}
              <h3>Available Songs</h3>
              {/if}
              <ul class="region-list">
                {#each $regions.filter(region => !isRegionInSetlist(region.id)) as region (region.id)}
                  <li>
                    <div class="region-info">
                      <span class="region-name">{region.name}</span>
                      <span class="region-duration">
                        {Math.floor((region.end - region.start) / 60)}:
                        {Math.floor((region.end - region.start) % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                    <button
                      on:click={() => addRegionToSetlist(region.id, region.name)}
                      class="add-button {processingAddButtons.has(region.id) ? 'processing' : ''}"
                    >
                      Add
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>
      {:else}
        <div class="no-setlist-selected">
          <h2>No Setlist Selected</h2>
          <p>Select a setlist from the list on the left or create a new one.</p>
        </div>
      {/if}
    </div>
  </div>

  <!-- Delete confirmation modal -->
  {#if showConfirmDelete}
    <div class="modal-overlay">
      <div class="modal">
        <h3>Confirm Delete</h3>
        <p>Are you sure you want to delete the setlist "{setlistToDelete?.name}"?</p>
        <p class="warning">This action cannot be undone.</p>
        <div class="modal-actions">
          <button on:click={() => handleDeleteSetlist(setlistToDelete?.id || '')} class="delete-button">Delete</button>
          <button on:click={cancelDelete}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .setlist-editor-container {
    width: 100%;
    margin: 0 auto;
    padding: 1rem;
  }

  h1 {
    margin-top: 0;
    margin-bottom: 1.5rem;
    color: #ffffff;
  }

  h2 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.5rem;
    color: #ffffff;
  }

  h3 {
    margin-top: 0;
    margin-bottom: 0.75rem;
    font-size: 1.2rem;
    color: #ffffff;
  }

  .error-message {
    background-color: rgba(244, 67, 54, 0.1);
    border-left: 4px solid #f44336;
    color: #f44336;
    padding: 0.75rem;
    margin-bottom: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: 4px;
  }

  .error-message button {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-weight: bold;
  }

  .setlist-layout {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 2rem;
  }

  .setlist-management, .setlist-content {
    background-color: #2a2a2a;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .create-setlist {
    margin-bottom: 1.5rem;
  }

  .form-group {
    display: flex;
    gap: 0.5rem;
  }

  input[type="text"] {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #444;
    background-color: #333;
    color: white;
    border-radius: 4px;
  }

  button {
    padding: 0.5rem 1rem;
    background-color: #4a4a4a;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease-in-out;
    position: relative;
    overflow: hidden;
  }

  button:hover:not(:disabled) {
    background-color: #5a5a5a;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  button:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: none;
    background-color: #3a3a3a;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button.processing {
    position: relative;
    color: transparent;
    pointer-events: none;
  }

  button.processing::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 16px;
    height: 16px;
    margin-top: -8px;
    margin-left: -8px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    animation: spinner 0.6s linear infinite;
  }

  @keyframes spinner {
    to {
      transform: rotate(360deg);
    }
  }

  button::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 5px;
    height: 5px;
    background: rgba(255, 255, 255, 0.5);
    opacity: 0;
    border-radius: 100%;
    transform: scale(1, 1) translate(-50%, -50%);
    transform-origin: 50% 50%;
  }

  button:focus:not(:active)::after {
    animation: ripple 0.5s ease-out;
  }

  @keyframes ripple {
    0% {
      transform: scale(0, 0);
      opacity: 0.5;
    }
    100% {
      transform: scale(20, 20);
      opacity: 0;
    }
  }

  .loading {
    color: #aaa;
    font-style: italic;
    padding: 1rem 0;
  }

  .empty-state {
    color: #aaa;
    text-align: center;
    padding: 1.5rem 0;
  }

  .hint {
    font-size: 0.9rem;
    opacity: 0.7;
  }

  .setlist-list ul, .item-list, .region-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 300px;
    overflow-y: auto;
  }

  .setlist-list li {
    margin-bottom: 0.5rem;
    padding: 0.75rem;
    background-color: #333;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .setlist-list li.active {
    background-color: #3a3a3a;
    border-left: 4px solid #4CAF50;
    padding-left: calc(0.75rem - 4px);
  }

  .setlist-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .setlist-name {
    cursor: pointer;
    flex: 1;
  }

  .setlist-actions {
    display: flex;
    gap: 0.5rem;
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .item-list li, .region-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background-color: #333;
    border-radius: 4px;
    margin-bottom: 0.5rem;
  }

  .item-info, .region-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }

  .item-number {
    font-weight: bold;
    color: #4CAF50;
    min-width: 1.5rem;
  }

  .item-actions {
    display: flex;
    gap: 0.25rem;
  }

  .move-button {
    padding: 0.25rem 0.5rem;
    font-size: 1rem;
  }

  .remove-button {
    background-color: rgba(244, 67, 54, 0.2);
    color: #f44336;
  }

  .remove-button:hover {
    background-color: rgba(244, 67, 54, 0.3);
  }

  .add-button {
    background-color: rgba(76, 175, 80, 0.2);
    color: #4CAF50;
  }

  .add-button:hover:not(:disabled) {
    background-color: rgba(76, 175, 80, 0.3);
  }

  .region-duration {
    font-size: 0.8rem;
    color: #aaa;
    margin-left: auto;
    margin-right: 1rem;
  }

  .setlist-items, .available-regions {
    margin-top: 2rem;
  }

  .no-setlist-selected {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #aaa;
    text-align: center;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background-color: #2a2a2a;
    border-radius: 8px;
    padding: 1.5rem;
    width: 90%;
    max-width: 500px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  }

  .modal h3 {
    margin-top: 0;
  }

  .warning {
    color: #f44336;
    font-weight: bold;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .delete-button {
    background-color: #f44336;
  }

  .delete-button:hover {
    background-color: #d32f2f;
  }

  /* Scrollbar styling */
  .setlist-list ul::-webkit-scrollbar,
  .item-list::-webkit-scrollbar,
  .region-list::-webkit-scrollbar {
    width: 8px;
  }

  .setlist-list ul::-webkit-scrollbar-track,
  .item-list::-webkit-scrollbar-track,
  .region-list::-webkit-scrollbar-track {
    background: #1e1e1e;
    border-radius: 4px;
  }

  .setlist-list ul::-webkit-scrollbar-thumb,
  .item-list::-webkit-scrollbar-thumb,
  .region-list::-webkit-scrollbar-thumb {
    background: #4a4a4a;
    border-radius: 4px;
  }

  .setlist-list ul::-webkit-scrollbar-thumb:hover,
  .item-list::-webkit-scrollbar-thumb:hover,
  .region-list::-webkit-scrollbar-thumb:hover {
    background: #5a5a5a;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .setlist-layout {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .setlist-management, .setlist-content {
      padding: 1rem;
    }
  }
</style>
