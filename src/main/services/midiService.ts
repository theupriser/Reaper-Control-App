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
  private activeDevice: easymidi.Input | null = null;
  private activeDeviceId: string | null = null;
  private midiConfig: MidiConfig;
  // Map to store debounce timeouts for clearing event history
  private noteDebounce: Map<number, NodeJS.Timeout> = new Map();

  // Track last note event timestamps for global debounce across all devices
  // This is critical for preventing multiple triggering when multiple listeners
  // pick up the same physical MIDI note event
  private lastNoteEvents: Map<number, number> = new Map();

  // Time window in ms within which duplicate notes will be ignored
  // This prevents the same note from triggering multiple actions in quick succession
  // which addresses the issue of a single MIDI action triggering multiple times
  private readonly debounceWindow: number = 200;
  private deviceCheckInterval: NodeJS.Timeout | null = null;

  /**
   * Constructor
   */
  constructor() {
    super();

    // Get MIDI configuration
    const configData = config.getConfig();

    // Log the config data to see what we're getting
    logger.info('MidiService constructor - Config data:', {
      midiEnabled: configData.midi.enabled,
      noteMapping: configData.midi.noteMapping
    });

    // Convert noteMapping object from config to noteMappings array
    const noteMappings: MidiNoteMapping[] = [];

    // Load note mappings from config if available
    if (configData.midi.noteMapping && typeof configData.midi.noteMapping === 'object') {
      logger.info('MidiService constructor - Converting noteMapping object to array');
      Object.entries(configData.midi.noteMapping).forEach(([noteStr, action]) => {
        const noteNumber = parseInt(noteStr, 10);
        if (!isNaN(noteNumber) && typeof action === 'string') {
          noteMappings.push({
            noteNumber,
            action
          });
        }
      });
    } else {
      logger.warn('MidiService constructor - No valid noteMapping object found in config');
    }

    // Initialize midiConfig with values from config
    this.midiConfig = {
      enabled: configData.midi.enabled,
      // Use type assertion to handle the type conflict between null and string|undefined
      deviceName: configData.midi.deviceName as unknown as string | undefined,
      // Initialize deviceId as undefined, it will be set later if needed
      deviceId: undefined,
      channel: configData.midi.channel !== null ? configData.midi.channel : undefined,
      noteMappings: noteMappings
    };


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

      // If a specific device is selected, connect only to that device
      if (this.midiConfig.deviceName) {
        logger.info('Connecting to configured MIDI device:', { deviceName: this.midiConfig.deviceName });
        this.connectToDevice(this.midiConfig.deviceName);
      } else {
        // Otherwise connect to all available devices
        logger.info('No specific MIDI device configured, connecting to all available devices');
        this.connectToAllDevices();
      }

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

    logger.info('Connecting to all MIDI devices in all-devices mode');

    // First, disconnect from any currently connected devices
    // to ensure we don't have any lingering connections
    this.disconnectAllDevices();

    // Set the mode to "all devices"
    this.midiConfig.deviceName = undefined;
    this.activeDevice = null;
    this.activeDeviceId = null;

    // Connect to each device
    for (const device of this.midiDevices.values()) {
      try {
        // In "all devices" mode, we need to directly set up the connection
        // without going through connectToDevice (which would disconnect others)
        const deviceId = device.id;

        // Create new MIDI input
        const input = new easymidi.Input(device.name);

        // Add to inputs map
        this.midiInputs.set(deviceId, input);

        // Set up event listeners for MIDI note events
        input.on('noteon', msg => {
          this.handleNoteOn({...msg, deviceId});
          this.emit('midiActivity', {type: 'noteon', ...msg, deviceId, deviceName: device.name});
        });

        input.on('noteoff', msg => {
          this.emit('midiActivity', {type: 'noteoff', ...msg, deviceId, deviceName: device.name});
        });

        // For other message types
        try {
          const otherMessageTypes = ['cc', 'program', 'channel aftertouch', 'pitch', 'position', 'mtc', 'select', 'clock', 'start', 'continue', 'stop', 'reset'];
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

        logger.info(`Connected to MIDI device in all-devices mode: ${device.name}`);
      } catch (error) {
        logger.error(`Failed to connect to MIDI device: ${device.name}`, { error });
      }
    }

    // Emit event for updated devices
    this.emit('devicesUpdated', this.getDevices());
  }

  /**
   * Discover MIDI devices
   */
  private discoverDevices(): void {
    try {
      // Get available MIDI inputs
      const inputs = easymidi.getInputs();
      logger.info('Available MIDI inputs:', { inputs });

      // Keep track of existing device IDs to detect removed devices
      const existingDeviceIds = new Set<string>();

      // Mapping of device names to their IDs for quick lookup
      const deviceNameToId = new Map<string, string>();

      // First, build lookup maps of existing devices
      this.midiDevices.forEach((device, id) => {
        existingDeviceIds.add(id);
        deviceNameToId.set(device.name, id);
      });

      // Create or update devices for each input
      inputs.forEach((inputName) => {
        // Check if we already have this device by name
        if (deviceNameToId.has(inputName)) {
          // Device already exists, update the existing entry
          const deviceId = deviceNameToId.get(inputName)!;
          const existingDevice = this.midiDevices.get(deviceId);

          if (existingDevice) {
            // Mark that we've seen this device
            existingDeviceIds.delete(deviceId);
            logger.debug(`Existing MIDI device found: ${inputName} (${deviceId})`);
          }
        } else {
          // This is a new device
          const deviceId = `device-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

          // Create new device
          this.midiDevices.set(deviceId, {
            id: deviceId,
            name: inputName,
            isConnected: false
          });

          logger.info(`New MIDI device discovered: ${inputName} (${deviceId})`);
        }
      });

      // Check for devices that are no longer available
      existingDeviceIds.forEach(deviceId => {
        const device = this.midiDevices.get(deviceId);
        if (device) {
          logger.info(`MIDI device no longer available: ${device.name} (${deviceId})`);

          // If device is connected, disconnect it
          if (device.isConnected) {
            // Close the input if it exists
            const input = this.midiInputs.get(deviceId);
            if (input) {
              try {
                input.removeAllListeners();
                input.close();
                logger.info(`Closed MIDI input for removed device: ${device.name}`);
              } catch (closeError) {
                logger.error(`Error closing MIDI input for removed device:`, closeError);
              }

              this.midiInputs.delete(deviceId);
            }

            // If this was the active device, clear the reference
            if (deviceId === this.activeDeviceId) {
              this.activeDevice = null;
              this.activeDeviceId = null;
            }
          }

          // Remove the device from our map
          this.midiDevices.delete(deviceId);
        }
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
      // Discover current devices to ensure our device list is up to date
      this.discoverDevices();

      // If we have a specific device selected, check if it's available
      if (this.midiConfig.enabled && this.midiConfig.deviceName) {
        // Find the device ID for the selected device name
        let selectedDeviceId = null;
        let selectedDeviceConnected = false;

        for (const [id, device] of this.midiDevices.entries()) {
          if (device.name === this.midiConfig.deviceName) {
            selectedDeviceId = id;
            selectedDeviceConnected = device.isConnected;
            break;
          }
        }

        // If the device exists but isn't connected, connect to it
        if (selectedDeviceId && !selectedDeviceConnected) {
          logger.info('Reconnecting to selected MIDI device:', { deviceName: this.midiConfig.deviceName });
          this.connectToDevice(this.midiConfig.deviceName);
        }
        // If the selected device doesn't exist anymore
        else if (!selectedDeviceId) {
          logger.warn('Selected MIDI device no longer available:', { deviceName: this.midiConfig.deviceName });

          // If the active device is set, clear it
          if (this.activeDeviceId) {
            this.disconnectFromCurrentDevice();
          }
        }
      }
      // If we're in "all devices" mode, make sure all available devices are connected
      else if (this.midiConfig.enabled && !this.midiConfig.deviceName) {
        // Connect to any newly discovered devices
        let newConnectionsMade = false;

        this.midiDevices.forEach((device, deviceId) => {
          if (!device.isConnected) {
            logger.info('Connecting to newly available MIDI device:', { deviceName: device.name });
            if (this.connectToDevice(device.name)) {
              newConnectionsMade = true;
            }
          }
        });

        // If we made new connections, update the UI
        if (newConnectionsMade) {
          this.emit('devicesUpdated', this.getDevices());
        }
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

    let deviceName = this.midiConfig.deviceName;

    // If device name is configured, use it directly
    if (deviceName) {
      // Check if this device exists
      let deviceExists = false;
      for (const device of this.midiDevices.values()) {
        if (device.name === deviceName) {
          deviceExists = true;
          break;
        }
      }

      if (deviceExists) {
        this.connectToDevice(deviceName);
        return;
      } else {
        logger.warn(`Configured MIDI device not found: ${deviceName}`);
      }
    }

    // If no device configured or not found, use the first device
    const firstDevice = this.midiDevices.values().next().value;
    if (firstDevice) {
      deviceName = firstDevice.name;
      this.connectToDevice(deviceName);
    }
  }

  /**
   * Connect to a MIDI device
   * @param deviceName - Device name
   * @returns True if connected successfully
   */
  public connectToDevice(deviceName: string): boolean {
    // Find device by name
    let device;
    let deviceId;

    // If deviceName is falsy or "null" (string from dropdown),
    // it means "All Available Devices" mode
    if (!deviceName || deviceName === "null") {
      logger.info('Setting "All Available Devices" mode');

      // Disconnect from all devices first to prevent double connections
      this.disconnectAllDevices();

      // Set config to use all devices
      this.midiConfig.deviceName = undefined;

      // Connect to all available devices
      this.connectToAllDevices();

      return true;
    }

    // Find the device with the matching name
    for (const [id, dev] of this.midiDevices.entries()) {
      if (dev.name === deviceName) {
        device = dev;
        deviceId = id;
        break;
      }
    }

    if (!device || !deviceId) {
      logger.error('MIDI device not found by name', { deviceName });
      return false;
    }

    try {
      // When connecting to a specific device, disconnect from all other devices first
      // This ensures we only have one active MIDI device connection
      this.disconnectAllDevices();

      // If device is already connected, close it first to ensure clean reconnection
      // This helps prevent multiple listeners for the same physical device
      if (this.midiInputs.has(deviceId)) {
        try {
          const existingInput = this.midiInputs.get(deviceId);
          if (existingInput) {
            // Remove all listeners before closing to prevent any leaks
            existingInput.removeAllListeners();
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

      // Set this as the active device
      this.activeDevice = input;
      this.activeDeviceId = deviceId;

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

      // Update the config to remember this device selection
      this.midiConfig.deviceName = deviceName;

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
          // Remove all listeners before closing to prevent any event listener leaks
          try {
            input.removeAllListeners();
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
      return;
    }

    const device = this.midiDevices.get(deviceId);
    const deviceName = device ? device.name : 'unknown';


    // Global debounce - check if we've seen this note recently from any device
    // This is the key mechanism that prevents the multiple triggering issue:
    // When a physical MIDI note is pressed, it might be detected by multiple event listeners
    // (due to reconnection or device polling). By tracking the timestamp globally for each note,
    // we ensure that only the first detection triggers an action, and subsequent detections
    // of the same note within the debounce window are ignored.
    const now = Date.now();
    const lastTime = this.lastNoteEvents.get(note);

    if (lastTime && (now - lastTime) < this.debounceWindow) {
      return;
    }

    // Update the last seen time for this note
    this.lastNoteEvents.set(note, now);

    // Find action for this note
    const action = this.findActionForNote(note);
    if (action) {
      // Per-note debounce timer (keeps the map clean after the window expires)
      if (this.noteDebounce.has(note)) {
        clearTimeout(this.noteDebounce.get(note)!);
      }

      this.noteDebounce.set(note, setTimeout(() => {
        this.noteDebounce.delete(note);
        // Also clean up the lastNoteEvents entry
        this.lastNoteEvents.delete(note);
      }, this.debounceWindow));

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

        return undefined;
    }
  }

  /**
   * Update MIDI configuration
   * @param newConfig - New configuration
   */
  public updateConfig(newConfig: Partial<MidiConfig>): void {
    let deviceChanged = false;
    let enabledChanged = false;

    // Update local config
    if (newConfig.enabled !== undefined) {
      enabledChanged = this.midiConfig.enabled !== newConfig.enabled;
      this.midiConfig.enabled = newConfig.enabled;
    }

    // Only use deviceName, not deviceId
    if (newConfig.deviceName !== undefined) {
      // Check if the device selection has changed
      deviceChanged = this.midiConfig.deviceName !== newConfig.deviceName;

      this.midiConfig.deviceName = newConfig.deviceName;

      // If deviceName is empty or "null" (from dropdown), it means "All Available Devices"
      if (!newConfig.deviceName || newConfig.deviceName === "null") {
        this.midiConfig.deviceName = undefined;
      }

      // We should clear deviceId as it's no longer used
      this.midiConfig.deviceId = undefined;

      logger.info('Device selection changed', {
        deviceName: this.midiConfig.deviceName,
        allDevicesMode: this.midiConfig.deviceName === undefined
      });
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

    // Update global config
    config.updateConfig({
      midi: {
        enabled: this.midiConfig.enabled,
        // Convert undefined to null for the config object which expects null
        deviceName: this.midiConfig.deviceName as unknown as null,
        // We don't save deviceId directly to config.ts as it's not part of its schema
        // But we set deviceName to undefined when deviceId is empty (All Available Devices)
        // Use type assertion to force null for channel property
        channel: (this.midiConfig.channel !== undefined ? this.midiConfig.channel : null) as null,
        // Cast the noteMapping to the expected type using type assertion
        noteMapping: noteMapping as { 44: string; 45: string; 46: string; 48: string; 49: string; 50: string; 51: string; }
      }
    });

    logger.info('MIDI configuration updated', {
      enabled: this.midiConfig.enabled,
      deviceName: this.midiConfig.deviceName,
      channel: this.midiConfig.channel,
      deviceChanged: deviceChanged,
      enabledChanged: enabledChanged
    });

    // Handle device and enabled state changes
    if (this.midiConfig.enabled) {
      if (enabledChanged) {
        // If MIDI was just enabled, initialize everything
        this.initialize();
      } else if (deviceChanged) {
        // If device selection changed but MIDI was already enabled,
        // we need to update the connections

        // First disconnect from all current devices
        this.disconnectAllDevices();

        // If a specific device is selected, connect to it
        if (this.midiConfig.deviceName) {
          this.connectToDevice(this.midiConfig.deviceName);
        } else {
          // Otherwise connect to all available devices
          this.connectToAllDevices();
        }
      }
    } else if (enabledChanged) {
      // If MIDI was just disabled, disconnect from all devices
      this.disconnectAllDevices();
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
        // Remove all listeners before closing to prevent any event listener leaks
        input.removeAllListeners();
        input.close();

        // Update device state
        const device = this.midiDevices.get(deviceId);
        if (device) {
          device.isConnected = false;
        }

      } catch (error) {
        logger.error(`Error disconnecting from MIDI device: ${deviceId}`, { error });
      }
    }

    // Clear inputs map
    this.midiInputs.clear();

    // Clear state
    this.activeDevice = null;
    this.activeDeviceId = null;

    // Also clear any pending debounce timers
    for (const timeout of this.noteDebounce.values()) {
      clearTimeout(timeout);
    }
    this.noteDebounce.clear();
    this.lastNoteEvents.clear();

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
    // Log what we're returning to help debug the issue
    logger.info('MidiService.getConfig() returning:', {
      enabled: this.midiConfig.enabled,
      deviceId: this.midiConfig.deviceId,
      deviceName: this.midiConfig.deviceName,
      channel: this.midiConfig.channel,
      noteMappingsCount: this.midiConfig.noteMappings.length,
      noteMappings: this.midiConfig.noteMappings
    });
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
        // Remove all event listeners to prevent any leaks
        input.removeAllListeners();
        input.close();
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

    // Clear event tracking
    this.lastNoteEvents.clear();

    logger.info('MIDI service cleanup complete');
  }
}
