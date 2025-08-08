/**
 * Configuration Utility
 * Provides configuration settings for the application
 */
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import logger from './logger';

// Default configuration
const defaultConfig = {
  reaper: {
    host: 'localhost',
    port: 8080,
    protocol: 'http',
    reconnectInterval: 5000,
    maxReconnectAttempts: 10,
    connectionTimeout: 3000,
    pollingInterval: 1000,
  },
  midi: {
    enabled: true,
    deviceName: null, // Use first available device if null
    noteMapping: {
      // Default MIDI note mappings
      // MIDI note number -> action
      // e.g. 60: 'togglePlay'
    },
  },
  ui: {
    refreshInterval: 1000,
    showDebugInfo: false,
  },
  logging: {
    level: 'info', // debug, info, warn, error
    logToFile: false,
    logFilePath: path.join(app.getPath('userData'), 'logs', 'reaper-control.log'),
  },
};

// Configuration file path
const configFilePath = path.join(app.getPath('userData'), 'config.json');

// Current configuration
let currentConfig = { ...defaultConfig };

/**
 * Load configuration from file
 * @returns The loaded configuration
 */
function loadConfig(): typeof defaultConfig {
  try {
    if (fs.existsSync(configFilePath)) {
      const fileContent = fs.readFileSync(configFilePath, 'utf8');
      const fileConfig = JSON.parse(fileContent);

      // Merge with default config to ensure all properties exist
      const mergedConfig = mergeConfigs(defaultConfig, fileConfig);

      logger.info('Configuration loaded from file', { path: configFilePath });
      return mergedConfig;
    } else {
      logger.info('No configuration file found, using defaults');
      saveConfig(defaultConfig); // Create default config file
      return { ...defaultConfig };
    }
  } catch (error) {
    logger.error('Error loading configuration', { error });
    return { ...defaultConfig };
  }
}

/**
 * Save configuration to file
 * @param config - Configuration to save
 */
function saveConfig(config: typeof defaultConfig): void {
  try {
    const dirPath = path.dirname(configFilePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
    logger.info('Configuration saved to file', { path: configFilePath });
  } catch (error) {
    logger.error('Error saving configuration', { error });
  }
}

/**
 * Merge configurations recursively
 * @param defaultObj - Default configuration
 * @param customObj - Custom configuration
 * @returns Merged configuration
 */
function mergeConfigs(defaultObj: any, customObj: any): any {
  const result = { ...defaultObj };

  for (const key in customObj) {
    if (Object.prototype.hasOwnProperty.call(customObj, key)) {
      if (
        typeof customObj[key] === 'object' &&
        customObj[key] !== null &&
        typeof defaultObj[key] === 'object' &&
        defaultObj[key] !== null &&
        !Array.isArray(customObj[key]) &&
        !Array.isArray(defaultObj[key])
      ) {
        result[key] = mergeConfigs(defaultObj[key], customObj[key]);
      } else {
        result[key] = customObj[key];
      }
    }
  }

  return result;
}

/**
 * Get the current configuration
 * @returns The current configuration
 */
function getConfig(): typeof defaultConfig {
  return currentConfig;
}

/**
 * Update the configuration
 * @param newConfig - New configuration (partial)
 * @param save - Whether to save the configuration to file
 * @returns The updated configuration
 */
function updateConfig(newConfig: Partial<typeof defaultConfig>, save = true): typeof defaultConfig {
  currentConfig = mergeConfigs(currentConfig, newConfig);

  if (save) {
    saveConfig(currentConfig);
  }

  return currentConfig;
}

// Initialize configuration
currentConfig = loadConfig();

// Configure logger based on config
logger.configure({
  level:
    currentConfig.logging.level === 'debug' ? 0 :
    currentConfig.logging.level === 'info' ? 1 :
    currentConfig.logging.level === 'warn' ? 2 :
    currentConfig.logging.level === 'error' ? 3 : 1,
  logToFile: currentConfig.logging.logToFile,
});

// Export configuration API
export default {
  getConfig,
  updateConfig,
  saveConfig,
  loadConfig,
  defaultConfig,
};
