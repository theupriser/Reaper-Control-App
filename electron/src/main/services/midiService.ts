/**
 * MIDI Service
 * Handles MIDI input events and triggers corresponding actions
 */
import { EventEmitter } from 'events';
import * as easymidi from 'easymidi';
import { MidiDevice, MidiConfig, MidiNoteMapping } from '../types';
import config from '../utils/config';
import logger from '../utils/logger';

export class MidiService extends EventEmitter {
  private midiDevices: Map<string, MidiDevice> = new Map();
  private midiInputs: Map<string, easymidi.Input> = new Map();
  // @ts-ignore: This property is kept for future use
  private activeDevice: easymidi.Input | null = null;
  private activeDeviceId: string | null = null;
  private midiConfig: MidiConfig;
  private noteDebounce: Map<number, NodeJS.Timeout> = new Map();
  private deviceCheckInterval: NodeJS.Timeout | null = null;

  /**
   * Constructor
   */
  constructor() {
    super();

    // Get MIDI configuration
    const configData = config.getConfig();

    // Convert noteMapping object from config to noteMappings array
    const noteMappings: MidiNoteMapping[] = [];

    // Load note mappings from config if available
    if (configData.midi.noteMapping && typeof configData.midi.noteMapping === 'object') {
      Object.entries(configData.midi.noteMapping).forEach(([noteStr, action]) => {
        const noteNumber = parseInt(noteStr, 10);
        if (!isNaN(noteNumber) && typeof action === 'string') {
          noteMappings.push({
            noteNumber,
            action
          });
        }
      });
    }

    // Initialize midiConfig with values from config
    this.midiConfig = {
      enabled: configData.midi.enabled,
      // Use type assertion to handle the type conflict between null and string|undefined
      deviceName: configData.midi.deviceName as unknown as string | undefined,
      channel: configData.midi.channel !== null ? configData.midi.channel : undefined,
      noteMappings: noteMappings
    };

    logger.debug('Loaded note mappings from config', {
      count: noteMappings.length,
      mappings: noteMappings
    });

    // Initialize MIDI
    this.initialize();

    logger.info('MIDI service initialized', {
      enabled: this.midiConfig.enabled,
      channel: this.midiConfig.channel
    });
  }

  /**
   * Initialize MIDI
   */
  private initialize(): void {
    if (!this.midiConfig.enabled) {
      logger.info('MIDI is disabled');
      return;
    }

    try {
      // Discover actual MIDI devices
      this.discoverDevices();

      // Connect to all available devices
      this.connectToAllDevices();

      // Start polling for new MIDI devices
      this.startDevicePolling();
    } catch (error) {
      logger.error('Failed to initialize MIDI', { error });
    }
  }

  /**
   * Connect to all available MIDI devices
   */
  private connectToAllDevices(): void {
    if (this.midiDevices.size === 0) {
      logger.warn('No MIDI devices available');
      return;
    }

    logger.info('Connecting to all MIDI devices');

    // Connect to each device
    for (const [deviceId, device] of this.midiDevices.entries()) {
      try {
        this.connectToDevice(deviceId);
        logger.info(`Connected to MIDI device: ${device.name}`);
      } catch (error) {
        logger.error(`Failed to connect to MIDI device: ${device.name}`, { error });
      }
    }
  }

  /**
   * Discover MIDI devices
   */
  private discoverDevices(): void {
    try {
      // Get available MIDI inputs
      const inputs = easymidi.getInputs();
      logger.info('Available MIDI inputs:', { inputs });

      // Create a device for each input
      inputs.forEach((inputName, index) => {
        const deviceId = `device-${index}`;

        // Create or update device
        this.midiDevices.set(deviceId, {
          id: deviceId,
          name: inputName,
          isConnected: false
        });
      });

      logger.info('Discovered MIDI devices', { count: inputs.length });
    } catch (error) {
      logger.error('Error discovering MIDI devices:', error);
    }
  }

  /**
   * Start polling for new MIDI devices
   */
  private startDevicePolling(): void {
    // Clear any existing interval
    if (this.deviceCheckInterval) {
      clearInterval(this.deviceCheckInterval);
    }

    // Check for new devices every 5 seconds
    this.deviceCheckInterval = setInterval(() => {
      this.checkForNewDevices();
    }, 5000);

    logger.info('Started polling for new MIDI devices every 5 seconds');
  }

  /**
   * Stop polling for new MIDI devices
   */
  private stopDevicePolling(): void {
    if (this.deviceCheckInterval) {
      clearInterval(this.deviceCheckInterval);
      this.deviceCheckInterval = null;
      logger.info('Stopped polling for new MIDI devices');
    }
  }

  /**
   * Check for new MIDI devices and connect them
   */
  private checkForNewDevices(): void {
    try {
      // Get current available MIDI inputs
      const currentInputs = easymidi.getInputs();

      // Get current device IDs and names
      const currentDeviceNames = Array.from(this.midiDevices.values()).map(device => device.name);

      // Find new inputs that weren't available before
      const newInputs = currentInputs.filter(input => !currentDeviceNames.includes(input));

      // Add new devices
      if (newInputs.length > 0) {
        logger.info('New MIDI devices detected:', { newInputs });

        newInputs.forEach(inputName => {
          const deviceId = `device-${this.midiDevices.size}`;

          // Create device
          this.midiDevices.set(deviceId, {
            id: deviceId,
            name: inputName,
            isConnected: false
          });

          // Automatically connect to the new device
          if (this.midiConfig.enabled) {
            this.connectToDevice(deviceId);
          }
        });

        // Emit event for new devices
        this.emit('devicesUpdated', this.getDevices());
      }

      // Find disconnected inputs
      const disconnectedDeviceIds: string[] = [];

      this.midiDevices.forEach((device, deviceId) => {
        if (device.isConnected && !currentInputs.includes(device.name)) {
          disconnectedDeviceIds.push(deviceId);
        }
      });

      // Disconnect devices that are no longer available
      if (disconnectedDeviceIds.length > 0) {
        logger.info('MIDI devices disconnected:', { disconnectedDeviceIds });

        disconnectedDeviceIds.forEach(deviceId => {
          // Close the input if it exists
          const input = this.midiInputs.get(deviceId);
          if (input) {
            try {
              input.close();
            } catch (closeError) {
              logger.error(`Error closing MIDI input:`, closeError);
            }

            this.midiInputs.delete(deviceId);
          }

          // Update device state
          const device = this.midiDevices.get(deviceId);
          if (device) {
            device.isConnected = false;
          }

          // Clear active device reference if this was the active device
          if (deviceId === this.activeDeviceId) {
            this.activeDevice = null;
            this.activeDeviceId = null;
          }
        });

        // Emit event for updated devices
        this.emit('devicesUpdated', this.getDevices());
      }
    } catch (error) {
      logger.error('Error checking for new MIDI devices:', error);
    }
  }

  /**
   * Connect to the configured MIDI device or the first available device
   */
  // @ts-ignore: This method is kept for future use
  private connectToConfiguredDevice(): void {
    if (this.midiDevices.size === 0) {
      logger.warn('No MIDI devices available');
      return;
    }

    let deviceId: string | undefined = undefined;
    let deviceName = this.midiConfig.deviceName;

    // If device name is configured, find the device with that name
    if (deviceName) {
      for (const [id, device] of this.midiDevices.entries()) {
        if (device.name === deviceName) {
          deviceId = id;
          break;
        }
      }
    }

    // If no device found by name or no name configured, use the first device
    if (!deviceId) {
      const firstKey = this.midiDevices.keys().next();
      if (!firstKey.done) {
        deviceId = firstKey.value;
        const device = this.midiDevices.get(deviceId);
        if (device) {
          deviceName = device.name;
        }
      }
    }

    // Connect to the device
    if (deviceId) {
      this.connectToDevice(deviceId);
    }
  }

  /**
   * Connect to a MIDI device
   * @param deviceId - Device ID
   * @returns True if connected successfully
   */
  public connectToDevice(deviceId: string): boolean {
    // Get device
    const device = this.midiDevices.get(deviceId);
    if (!device) {
      logger.error('MIDI device not found', { deviceId });
      return false;
    }

    // If device is already connected, don't reconnect
    if (device.isConnected && this.midiInputs.has(deviceId)) {
      logger.debug('MIDI device already connected', { deviceId, name: device.name });
      return true;
    }

    try {
      // Close existing input if it exists
      if (this.midiInputs.has(deviceId)) {
        try {
          const existingInput = this.midiInputs.get(deviceId);
          if (existingInput) {
            existingInput.close();
          }
          this.midiInputs.delete(deviceId);
        } catch (closeError) {
          logger.warn('Error closing existing MIDI input', { closeError, deviceId });
        }
      }

      // Create new MIDI input
      const input = new easymidi.Input(device.name);

      // Add to inputs map
      this.midiInputs.set(deviceId, input);

      // Set up event listeners for MIDI note events
      // These are the most important for triggering actions
      input.on('noteon', msg => {
        this.handleNoteOn({...msg, deviceId});
        this.emit('midiActivity', {type: 'noteon', ...msg, deviceId, deviceName: device.name});
      });

      input.on('noteoff', msg => {
        this.emit('midiActivity', {type: 'noteoff', ...msg, deviceId, deviceName: device.name});
      });

      // For other message types, we can try using any, but this may not work with all types
      // due to TypeScript typings. This is acceptable since we mainly care about note events.
      try {
        // Define the message types we're interested in
        const otherMessageTypes = ['cc', 'program', 'channel aftertouch', 'pitch', 'position', 'mtc', 'select', 'clock', 'start', 'continue', 'stop', 'reset'];

        // Use a workaround to register handlers for other message types
        // This may not catch all messages due to typing constraints
        for (const type of otherMessageTypes) {
          // @ts-ignore - Intentionally bypass type checking for these event types
          input.on(type, msg => {
            this.emit('midiActivity', {type, ...msg, deviceId, deviceName: device.name});
          });
        }
      } catch (error) {
        logger.warn('Some MIDI message types may not be monitored due to type constraints', { error });
      }

      // Update device state
      device.isConnected = true;

      logger.info('Connected to MIDI device', { deviceId, name: device.name });
      return true;
    } catch (error) {
      logger.error('Failed to connect to MIDI device', { error, deviceId });
      return false;
    }
  }

  /**
   * Disconnect from current device
   */
  private disconnectFromCurrentDevice(): void {
    if (this.activeDeviceId) {
      try {
        // Get the input
        const input = this.midiInputs.get(this.activeDeviceId);

        if (input) {
          // Close the input
          try {
            input.close();
          } catch (closeError) {
            logger.error(`Error closing MIDI input:`, closeError);
          }

          // Remove from inputs map
          this.midiInputs.delete(this.activeDeviceId);
        }

        // Update device state
        const device = this.midiDevices.get(this.activeDeviceId);
        if (device) {
          device.isConnected = false;
        }

        logger.info('Disconnected from MIDI device', { deviceId: this.activeDeviceId });
      } catch (error) {
        logger.error('Failed to disconnect from MIDI device', { error, deviceId: this.activeDeviceId });
      }

      // Clear state
      this.activeDevice = null;
      this.activeDeviceId = null;
    }
  }

  /**
   * Handle MIDI note on event
   * @param event - MIDI note on event from easymidi with deviceId
   */
  private handleNoteOn(event: { note: number, velocity: number, channel: number, deviceId: string }): void {
    const { note, velocity, channel, deviceId } = event;

    // Ignore note off events (velocity 0)
    if (velocity === 0) {
      return;
    }

    // Filter by channel if specified
    if (this.midiConfig.channel !== undefined && this.midiConfig.channel !== null && channel !== this.midiConfig.channel) {
      logger.debug('Ignoring MIDI note on different channel', { note, channel, configuredChannel: this.midiConfig.channel });
      return;
    }

    const device = this.midiDevices.get(deviceId);
    const deviceName = device ? device.name : 'unknown';

    logger.debug('MIDI note on', { note, velocity, channel, deviceId, deviceName });

    // Find action for this note
    const action = this.findActionForNote(note);
    if (action) {
      // Debounce to prevent rapid triggering
      if (this.noteDebounce.has(note)) {
        clearTimeout(this.noteDebounce.get(note)!);
      }

      this.noteDebounce.set(note, setTimeout(() => {
        this.noteDebounce.delete(note);
      }, 200)); // 200ms debounce

      // Emit action event with device info
      this.emit('action', action.action, { ...action.params, deviceId, deviceName });
      logger.info('MIDI action triggered', { note, action: action.action, deviceId, deviceName, channel });
    }
  }

  /**
   * Find action for MIDI note
   * @param note - MIDI note number
   * @returns Action and params or undefined if not found
   */
  private findActionForNote(note: number): { action: string, params?: Record<string, unknown> } | undefined {
    // Check note mappings from config
    for (const mapping of this.midiConfig.noteMappings) {
      if (mapping.noteNumber === note) {
        return {
          action: mapping.action,
          params: mapping.params
        };
      }
    }

    // Default mappings if no mapping found in config
    // These are used as a fallback if config doesn't include mappings
    switch (note) {
      case 44: // F4
        return { action: 'seekToCurrentRegionStart' };
      case 45: // B3
        return { action: 'toggleAutoplay' };
      case 46: // Bb4
        return { action: 'toggleCountIn' };
      case 48: // E4
        return { action: 'previousRegion' };
      case 49:
        return { action: 'pause' };
      case 50: // C4
        return { action: 'togglePlay' };
      case 51: // D4
        return { action: 'nextRegion' };
      default:
        // No additional fallback mappings

        logger.debug('No action found for MIDI note', { note });
        return undefined;
    }
  }

  /**
   * Update MIDI configuration
   * @param newConfig - New configuration
   */
  public updateConfig(newConfig: Partial<MidiConfig>): void {
    // Update local config
    if (newConfig.enabled !== undefined) {
      this.midiConfig.enabled = newConfig.enabled;
    }
    if (newConfig.deviceName !== undefined) {
      this.midiConfig.deviceName = newConfig.deviceName;
    }
    if (newConfig.channel !== undefined) {
      this.midiConfig.channel = newConfig.channel;
    }
    if (newConfig.noteMappings !== undefined) {
      this.midiConfig.noteMappings = newConfig.noteMappings;
    }

    // Convert noteMappings to the format expected by config
    const noteMapping: Record<number, string> = {};

    // Add all noteMappings to the config object
    for (const mapping of this.midiConfig.noteMappings) {
      if (mapping.noteNumber !== undefined && mapping.action) {
        noteMapping[mapping.noteNumber] = mapping.action;
      }
    }

    logger.debug('Updating config with note mappings', {
      count: Object.keys(noteMapping).length,
      mappings: noteMapping
    });

    // Update global config
    config.updateConfig({
      midi: {
        enabled: this.midiConfig.enabled,
        // Use type assertion to handle the type conflict between string|undefined and null
        deviceName: this.midiConfig.deviceName as unknown as null,
        // Use type assertion to force null for channel property
        channel: (this.midiConfig.channel !== undefined ? this.midiConfig.channel : null) as null,
        // Cast the noteMapping to the expected type using type assertion
        noteMapping: noteMapping as { 44: string; 45: string; 46: string; 48: string; 49: string; 50: string; 51: string; }
      }
    });

    logger.info('MIDI configuration updated', {
      enabled: this.midiConfig.enabled,
      channel: this.midiConfig.channel
    });

    // Reinitialize if enabled state changed
    if (newConfig.enabled !== undefined) {
      if (this.midiConfig.enabled) {
        this.initialize();
      } else {
        // Disconnect from all devices
        this.disconnectAllDevices();
      }
    }
  }

  /**
   * Disconnect from all MIDI devices
   */
  private disconnectAllDevices(): void {
    logger.info('Disconnecting from all MIDI devices');

    // Close all inputs
    for (const [deviceId, input] of this.midiInputs.entries()) {
      try {
        input.close();

        // Update device state
        const device = this.midiDevices.get(deviceId);
        if (device) {
          device.isConnected = false;
        }

        logger.debug(`Disconnected from MIDI device: ${deviceId}`);
      } catch (error) {
        logger.error(`Error disconnecting from MIDI device: ${deviceId}`, { error });
      }
    }

    // Clear inputs map
    this.midiInputs.clear();

    // Clear state
    this.activeDevice = null;
    this.activeDeviceId = null;

    logger.info('Disconnected from all MIDI devices');
  }

  /**
   * Get all MIDI devices
   * @returns Array of MIDI devices
   */
  public getDevices(): MidiDevice[] {
    return Array.from(this.midiDevices.values());
  }

  /**
   * Get active device
   * @returns Active device or null if none
   */
  public getActiveDevice(): MidiDevice | null {
    if (!this.activeDeviceId) {
      return null;
    }
    return this.midiDevices.get(this.activeDeviceId) || null;
  }

  /**
   * Get MIDI configuration
   * @returns MIDI configuration
   */
  public getConfig(): MidiConfig {
    return { ...this.midiConfig };
  }

  /**
   * Simulate MIDI note (for testing)
   * @param note - MIDI note number
   * @param velocity - Velocity (0-127)
   * @param channel - MIDI channel (0-15)
   */
  public simulateNote(note: number, velocity: number = 127, channel: number = 0): void {
    // Not directly possible with real MIDI devices
    // This method is kept for backward compatibility
    logger.debug('simulateNote called - this is a no-op with real MIDI devices', { note, velocity, channel });

    // Manually trigger the note handler as a fallback
    // Use a dummy deviceId since this is a simulated note
    this.handleNoteOn({ note, velocity, channel, deviceId: 'simulated-device' });
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    logger.info('Cleaning up MIDI service resources');

    // Stop device polling
    this.stopDevicePolling();

    // Disconnect from current device
    this.disconnectFromCurrentDevice();

    // Close all MIDI inputs
    for (const [deviceId, input] of this.midiInputs.entries()) {
      try {
        input.close();
        logger.debug(`Closed MIDI input for device: ${deviceId}`);
      } catch (error) {
        logger.error(`Error closing MIDI input for device: ${deviceId}`, error);
      }
    }

    // Clear inputs map
    this.midiInputs.clear();

    // Clear all timeouts
    for (const timeout of this.noteDebounce.values()) {
      clearTimeout(timeout);
    }
    this.noteDebounce.clear();

    logger.info('MIDI service cleanup complete');
  }
}
