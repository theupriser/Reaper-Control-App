/**
 * MIDI Service
 * Handles MIDI input events and triggers corresponding actions
 */
import { EventEmitter } from 'events';
import { MidiDevice, MidiNoteMapping, MidiConfig } from '../types';
import config from '../utils/config';
import logger from '../utils/logger';

// Mock MIDI implementation since we don't have actual MIDI hardware
// In a real implementation, this would use a MIDI library like midi or easymidi
class MockMidiInput extends EventEmitter {
  private deviceName: string;
  private isOpen: boolean = false;

  constructor(deviceName: string) {
    super();
    this.deviceName = deviceName;
  }

  open(): boolean {
    this.isOpen = true;
    logger.info(`Opened MIDI device: ${this.deviceName}`);
    return true;
  }

  close(): void {
    this.isOpen = false;
    logger.info(`Closed MIDI device: ${this.deviceName}`);
  }

  isPortOpen(): boolean {
    return this.isOpen;
  }

  // Method to simulate MIDI note events (for testing)
  simulateNoteOn(note: number, velocity: number, channel: number = 0): void {
    if (this.isOpen) {
      this.emit('noteon', { note, velocity, channel });
    }
  }
}

export class MidiService extends EventEmitter {
  private midiDevices: Map<string, MidiDevice> = new Map();
  private midiInputs: Map<string, MockMidiInput> = new Map();
  private activeDevice: MockMidiInput | null = null;
  private activeDeviceId: string | null = null;
  private midiConfig: MidiConfig;
  private noteDebounce: Map<number, NodeJS.Timeout> = new Map();

  /**
   * Constructor
   */
  constructor() {
    super();

    // Get MIDI configuration
    this.midiConfig = {
      enabled: config.getConfig().midi.enabled,
      deviceName: config.getConfig().midi.deviceName,
      noteMappings: []
    };

    // Initialize MIDI
    this.initialize();

    logger.info('MIDI service initialized', { enabled: this.midiConfig.enabled });
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
      // In a real implementation, this would discover actual MIDI devices
      // For now, we'll create mock devices
      this.discoverMockDevices();

      // Connect to the configured device or the first available device
      this.connectToConfiguredDevice();
    } catch (error) {
      logger.error('Failed to initialize MIDI', { error });
    }
  }

  /**
   * Discover mock MIDI devices
   */
  private discoverMockDevices(): void {
    // Create mock devices
    const mockDevices: MidiDevice[] = [
      { id: 'device-1', name: 'MIDI Controller 1', isConnected: false },
      { id: 'device-2', name: 'MIDI Controller 2', isConnected: false },
      { id: 'device-3', name: 'MIDI Keyboard', isConnected: false }
    ];

    // Add devices to map
    mockDevices.forEach(device => {
      this.midiDevices.set(device.id, device);

      // Create mock MIDI input for each device
      const input = new MockMidiInput(device.name);
      this.midiInputs.set(device.id, input);
    });

    logger.info('Discovered MIDI devices', { count: mockDevices.length });
  }

  /**
   * Connect to the configured MIDI device or the first available device
   */
  private connectToConfiguredDevice(): void {
    if (this.midiDevices.size === 0) {
      logger.warn('No MIDI devices available');
      return;
    }

    let deviceId: string | null = null;
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
      deviceId = this.midiDevices.keys().next().value;
      const device = this.midiDevices.get(deviceId);
      if (device) {
        deviceName = device.name;
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
    // Disconnect from current device if any
    this.disconnectFromCurrentDevice();

    // Get device
    const device = this.midiDevices.get(deviceId);
    if (!device) {
      logger.error('MIDI device not found', { deviceId });
      return false;
    }

    // Get MIDI input
    const input = this.midiInputs.get(deviceId);
    if (!input) {
      logger.error('MIDI input not found', { deviceId });
      return false;
    }

    try {
      // Open MIDI input
      const success = input.open();
      if (!success) {
        logger.error('Failed to open MIDI input', { deviceId });
        return false;
      }

      // Set up event listeners
      input.on('noteon', this.handleNoteOn.bind(this));

      // Update state
      this.activeDevice = input;
      this.activeDeviceId = deviceId;
      device.isConnected = true;

      // Update configuration
      this.updateConfig({ deviceId, deviceName: device.name });

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
    if (this.activeDevice && this.activeDeviceId) {
      try {
        // Remove event listeners
        this.activeDevice.removeAllListeners('noteon');

        // Close MIDI input
        this.activeDevice.close();

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
   * @param event - MIDI note on event
   */
  private handleNoteOn(event: { note: number, velocity: number, channel: number }): void {
    const { note, velocity, channel } = event;

    // Ignore note off events (velocity 0)
    if (velocity === 0) {
      return;
    }

    logger.debug('MIDI note on', { note, velocity, channel });

    // Emit MIDI activity event
    this.emit('midiActivity');

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

      // Emit action event
      this.emit('action', action.action, action.params);
      logger.info('MIDI action triggered', { note, action: action.action });
    }
  }

  /**
   * Find action for MIDI note
   * @param note - MIDI note number
   * @returns Action and params or undefined if not found
   */
  private findActionForNote(note: number): { action: string, params?: any } | undefined {
    // Check note mappings
    for (const mapping of this.midiConfig.noteMappings) {
      if (mapping.noteNumber === note) {
        return {
          action: mapping.action,
          params: mapping.params
        };
      }
    }

    // Default mappings if no custom mapping found
    switch (note) {
      case 60: // C4
        return { action: 'togglePlay' };
      case 62: // D4
        return { action: 'nextRegion' };
      case 64: // E4
        return { action: 'previousRegion' };
      case 65: // F4
        return { action: 'seekToCurrentRegionStart' };
      default:
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
    if (newConfig.noteMappings !== undefined) {
      this.midiConfig.noteMappings = newConfig.noteMappings;
    }

    // Update global config
    config.updateConfig({
      midi: {
        enabled: this.midiConfig.enabled,
        deviceName: this.midiConfig.deviceName,
        noteMapping: this.midiConfig.noteMappings.reduce((map: any, mapping) => {
          map[mapping.noteNumber] = mapping.action;
          return map;
        }, {})
      }
    });

    logger.info('MIDI configuration updated', { enabled: this.midiConfig.enabled });

    // Reinitialize if enabled state changed
    if (newConfig.enabled !== undefined) {
      if (this.midiConfig.enabled) {
        this.initialize();
      } else {
        this.disconnectFromCurrentDevice();
      }
    }
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
    if (this.activeDevice) {
      (this.activeDevice as MockMidiInput).simulateNoteOn(note, velocity, channel);
    }
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    // Disconnect from current device
    this.disconnectFromCurrentDevice();

    // Clear all timeouts
    for (const timeout of this.noteDebounce.values()) {
      clearTimeout(timeout);
    }
    this.noteDebounce.clear();
  }
}
