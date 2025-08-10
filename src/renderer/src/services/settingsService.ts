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

export interface MidiNoteMapping {
  noteNumber: number;
  action: string;
  params?: any;
}

export interface MidiConfig {
  enabled: boolean;
  deviceId?: string;
  deviceName?: string;
  channel?: number | null;
  noteMappings: MidiNoteMapping[];
}

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer?: string;
  isConnected: boolean;
}

export interface SettingsState {
  reaperConfig: ReaperConfig;
  midiConfig: MidiConfig;
  midiDevices: MidiDevice[];
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
  midiConfig: {
    enabled: true,
    deviceName: undefined,
    channel: null,
    noteMappings: [
      // Default mappings to match the ones in config.ts
      { noteNumber: 44, action: 'seekToCurrentRegionStart' },
      { noteNumber: 45, action: 'toggleAutoplay' },
      { noteNumber: 46, action: 'toggleCountIn' },
      { noteNumber: 48, action: 'previousRegion' },
      { noteNumber: 49, action: 'pause' },
      { noteNumber: 50, action: 'togglePlay' },
      { noteNumber: 51, action: 'nextRegion' }
    ]
  },
  midiDevices: [],
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
   * Load MIDI configuration from the backend
   * @param {boolean} silent - If true, don't show loading state or errors in UI
   * @returns {Promise<MidiConfig|null>} The loaded config or null if error
   */
  async loadMidiConfig(silent = false): Promise<MidiConfig | null> {
    if (!silent) {
      settingsStore.update(state => ({ ...state, loading: true, error: '' }));
    }

    try {
      const config = await ipcService.getMidiConfig();

      settingsStore.update(state => ({
        ...state,
        midiConfig: config,
        loading: false
      }));

      return config;
    } catch (e) {
      if (!silent) {
        settingsStore.update(state => ({
          ...state,
          loading: false,
          error: 'Failed to load MIDI configuration.'
        }));
        logger.error('Error loading MIDI config:', e);
      }
      return null;
    }
  },

  /**
   * Load MIDI devices from the backend
   * @param {boolean} silent - If true, don't show loading state or errors in UI
   * @returns {Promise<MidiDevice[]|null>} The loaded devices or null if error
   */
  async loadMidiDevices(silent = false): Promise<MidiDevice[] | null> {
    if (!silent) {
      settingsStore.update(state => ({ ...state, loading: true, error: '' }));
    }

    try {
      const devices = await ipcService.getMidiDevices();

      settingsStore.update(state => ({
        ...state,
        midiDevices: devices,
        loading: false
      }));

      return devices;
    } catch (e) {
      if (!silent) {
        settingsStore.update(state => ({
          ...state,
          loading: false,
          error: 'Failed to load MIDI devices.'
        }));
        logger.error('Error loading MIDI devices:', e);
      }
      return null;
    }
  },

  /**
   * Save MIDI configuration to the backend
   * @param {Partial<MidiConfig>} config - Configuration to save
   * @returns {Promise<boolean>} Success status
   */
  async saveMidiConfig(config: Partial<MidiConfig>): Promise<boolean> {
    // Update UI to saving state
    settingsStore.update(state => ({
      ...state,
      saving: true,
      error: '',
      successMessage: ''
    }));

    try {
      // Get current config
      let currentState: SettingsState;
      settingsStore.subscribe(state => { currentState = state; })();

      // Merge with new config
      const updatedConfig = {
        ...currentState.midiConfig,
        ...config
      };

      // Save to backend
      await ipcService.updateMidiConfig(updatedConfig);

      // Update store with new config
      settingsStore.update(state => ({
        ...state,
        midiConfig: updatedConfig,
        saving: false,
        successMessage: 'MIDI configuration saved successfully.'
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
        error: 'Error saving MIDI configuration.'
      }));
      logger.error('Error saving MIDI config:', e);
      return false;
    }
  },

  /**
   * Update a specific MIDI note mapping
   * @param {number} noteNumber - MIDI note number
   * @param {string} action - Action to map to this note
   * @returns {Promise<boolean>} Success status
   */
  async updateNoteMapping(noteNumber: number, action: string): Promise<boolean> {
    try {
      // Get current config
      let currentState: SettingsState;
      settingsStore.subscribe(state => { currentState = state; })();

      // Find existing mapping or create new one
      const mappings = [...currentState.midiConfig.noteMappings];
      const existingIndex = mappings.findIndex(m => m.noteNumber === noteNumber);

      if (existingIndex >= 0) {
        // Update existing mapping
        mappings[existingIndex] = { ...mappings[existingIndex], action };
      } else {
        // Add new mapping
        mappings.push({ noteNumber, action });
      }

      // Save updated mappings
      return await this.saveMidiConfig({ noteMappings: mappings });
    } catch (e) {
      logger.error('Error updating note mapping:', e);
      return false;
    }
  },

  /**
   * Remove a MIDI note mapping
   * @param {number} noteNumber - MIDI note number to remove mapping for
   * @returns {Promise<boolean>} Success status
   */
  async removeNoteMapping(noteNumber: number): Promise<boolean> {
    try {
      // Get current config
      let currentState: SettingsState;
      settingsStore.subscribe(state => { currentState = state; })();

      // Filter out the mapping to remove
      const mappings = currentState.midiConfig.noteMappings.filter(m => m.noteNumber !== noteNumber);

      // Save updated mappings
      return await this.saveMidiConfig({ noteMappings: mappings });
    } catch (e) {
      logger.error('Error removing note mapping:', e);
      return false;
    }
  },

  /**
   * Connect to a MIDI device
   * @param {string} deviceName - Device name to connect to
   * @returns {Promise<boolean>} Success status
   */
  async connectToDevice(deviceName: string): Promise<boolean> {
    try {
      const success = await ipcService.connectToMidiDevice(deviceName);

      if (success) {
        // Update device in the list
        settingsStore.update(state => {
          const devices = state.midiDevices.map(d => {
            if (d.name === deviceName) {
              return { ...d, isConnected: true };
            }
            return d;
          });

          return { ...state, midiDevices: devices };
        });
      }

      return success;
    } catch (e) {
      logger.error('Error connecting to MIDI device:', e);
      return false;
    }
  },

  /**
   * Initialize the settings service
   * @returns {Promise<void>}
   */
  async init(): Promise<void> {
    await this.loadReaperConfig();
    await this.loadMidiDevices();
    await this.loadMidiConfig();
  }
};

// Export the settings store for components to subscribe to
export const settings = {
  subscribe: settingsStore.subscribe
};

export default settingsService;
