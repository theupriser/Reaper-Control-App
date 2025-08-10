/**
 * Settings Service
 * Manages application settings and configuration
 */

import ipcService from './ipcService';
import logger from '../lib/utils/logger';
import { writable } from 'svelte/store';

// Define interfaces
export interface ReaperConfig {
  host: string;
  port: number;
  protocol: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  connectionTimeout: number;
  pollingInterval: number;
}

export interface SettingsState {
  reaperConfig: ReaperConfig;
  loading: boolean;
  saving: boolean;
  error: string;
  successMessage: string;
  originalPort: number | null;
}

// Create default state
const defaultState: SettingsState = {
  reaperConfig: {
    host: 'localhost',
    port: 8080,
    protocol: 'http',
    reconnectInterval: 5000,
    maxReconnectAttempts: 10,
    connectionTimeout: 3000,
    pollingInterval: 1000
  },
  loading: true,
  saving: false,
  error: '',
  successMessage: '',
  originalPort: null
};

// Success message timeout in milliseconds
const SUCCESS_MESSAGE_TIMEOUT = 5000;

// Create settings store
const settingsStore = writable<SettingsState>(defaultState);

// Settings service functions
export const settingsService = {
  /**
   * Load Reaper configuration from the backend
   * @param {boolean} silent - If true, don't show loading state or errors in UI
   * @returns {Promise<ReaperConfig|null>} The loaded config or null if error
   */
  async loadReaperConfig(silent = false): Promise<ReaperConfig | null> {
    if (!silent) {
      settingsStore.update(state => ({ ...state, loading: true, error: '' }));
    }

    try {
      const config = await ipcService.getReaperConfig();

      settingsStore.update(state => ({
        ...state,
        reaperConfig: config,
        originalPort: config.port,
        loading: false
      }));

      return config;
    } catch (e) {
      if (!silent) {
        settingsStore.update(state => ({
          ...state,
          loading: false,
          error: 'Failed to load Reaper configuration.'
        }));
        logger.error('Error loading Reaper config:', e);
      }
      return null;
    }
  },

  /**
   * Save Reaper configuration to the backend
   * @param {Partial<ReaperConfig>} config - Configuration to save
   * @returns {Promise<boolean>} Success status
   */
  async saveReaperConfig(config: Partial<ReaperConfig>): Promise<boolean> {
    // Get current state once to avoid multiple store subscriptions
    let currentState: SettingsState;
    settingsStore.subscribe(state => { currentState = state; })();

    console.log(' BLE Saving config:', config, currentState);

    // Update UI to saving state
    settingsStore.update(state => ({
      ...state,
      saving: true,
      error: '',
      successMessage: ''
    }));

    try {
      // Only handle port updates for now (can be expanded for other properties)
      if (config.port !== undefined) {
        // Validate port number
        const port = Number(config.port);
        if (isNaN(port) || port < 1 || port > 65535) {
          settingsStore.update(state => ({
            ...state,
            saving: false,
            error: 'Port must be a number between 1 and 65535'
          }));
          return false;
        }

        // Save port to backend
        const success = await ipcService.updateReaperConfig({ port });

        if (success) {
          // Update store with new port value
          const isPortUnchanged = port === currentState.originalPort;
          settingsStore.update(state => ({
            ...state,
            reaperConfig: {
              ...state.reaperConfig,
              port
            },
            originalPort: port,
            saving: false,
            successMessage: isPortUnchanged ?
              'Configuration saved successfully.' :
              `Reaper port updated to ${port}. Reconnecting...`
          }));

          // Reload config from backend after a delay to ensure sync
          setTimeout(() => {
            this.loadReaperConfig(true);
          }, 1000);

          // Auto-clear success message
          setTimeout(() => {
            settingsStore.update(state => ({
              ...state,
              successMessage: ''
            }));
          }, SUCCESS_MESSAGE_TIMEOUT);

          return true;
        } else {
          settingsStore.update(state => ({
            ...state,
            saving: false,
            error: 'Failed to update Reaper port.'
          }));
          return false;
        }
      }

      // If no port in config, just return success
      settingsStore.update(state => ({
        ...state,
        saving: false,
        successMessage: 'Configuration saved successfully.'
      }));

      // Auto-clear success message
      setTimeout(() => {
        settingsStore.update(state => ({
          ...state,
          successMessage: ''
        }));
      }, SUCCESS_MESSAGE_TIMEOUT);

      return true;
    } catch (e) {
      settingsStore.update(state => ({
        ...state,
        saving: false,
        error: 'Error saving Reaper configuration.'
      }));
      logger.error('Error saving Reaper config:', e);
      return false;
    }
  },

  /**
   * Initialize the settings service
   * @returns {Promise<void>}
   */
  async init(): Promise<void> {
    await this.loadReaperConfig();
  }
};

// Export the settings store for components to subscribe to
export const settings = {
  subscribe: settingsStore.subscribe
};

export default settingsService;
