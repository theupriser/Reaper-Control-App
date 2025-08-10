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
    channel: null, // Listen to all channels by default
    noteMapping: {
      // TransportControl events for playback, Autoplay and Countin
      // MIDI note number -> action
      44: 'seekToCurrentRegionStart',
      45: 'toggleAutoplay',
      46: 'toggleCountIn',
      48: 'previousRegion',
      49: 'pause',
      50: 'togglePlay',
      51: 'nextRegion',
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
const userDataPath = app.getPath('userData');
// Log the userData path to help with debugging
console.log('Electron userData path:', userDataPath);
logger.info('Electron userData path:', { userDataPath });
const configFilePath = path.join(userDataPath, 'config.json');

// Current configuration
let currentConfig = { ...defaultConfig };

/**
 * Load configuration from file
 * @returns The loaded configuration
 */
function loadConfig(): typeof defaultConfig {
  try {
    if (fs.existsSync(configFilePath)) {
      logger.info('Loading config from file', { path: configFilePath });

      // Read file content
      const fileContent = fs.readFileSync(configFilePath, 'utf8');

      // Parse JSON and check for parsing errors
      let fileConfig;
      try {
        fileConfig = JSON.parse(fileContent);
        logger.info('Config file parsed successfully', {
          reaperPort: fileConfig.reaper?.port,
          configSize: fileContent.length
        });
      } catch (parseError) {
        logger.error('Error parsing config file JSON', {
          error: parseError,
          fileContent: fileContent.length > 100 ? fileContent.substring(0, 100) + '...' : fileContent
        });
        throw parseError;
      }

      // Merge with default config to ensure all properties exist
      const mergedConfig = mergeConfigs(defaultConfig, fileConfig);

      logger.info('Configuration loaded from file', {
        path: configFilePath,
        reaperPort: mergedConfig.reaper.port
      });

      return mergedConfig;
    } else {
      logger.info('No configuration file found, using defaults', { configPath: configFilePath });
      saveConfig(defaultConfig); // Create default config file
      return { ...defaultConfig };
    }
  } catch (error) {
    logger.error('Error loading configuration', { error, stack: error.stack });
    return { ...defaultConfig };
  }
}

/**
 * Save configuration to file
 * @param config - Configuration to save
 * @returns True if successful, false otherwise
 */
function saveConfig(config: typeof defaultConfig): boolean {
  try {
    const dirPath = path.dirname(configFilePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Check write permissions for the directory
    try {
      // Try to create a temporary test file to verify write permissions
      const testFilePath = path.join(dirPath, '.write-test');
      fs.writeFileSync(testFilePath, 'test', { flag: 'w' });
      fs.unlinkSync(testFilePath);
      logger.info('Directory is writable', { dirPath });
    } catch (permError) {
      logger.error('Directory permission error - cannot write to config directory', {
        dirPath,
        error: permError,
        errorCode: permError.code,
        errorMessage: permError.message
      });
      return false;
    }

    // Add detailed logging before saving
    logger.info('About to save config file', {
      path: configFilePath,
      configData: JSON.stringify(config),
      userData: app.getPath('userData'),
      fileExists: fs.existsSync(configFilePath)
    });

    // Use synchronous write with flush to ensure data is written to disk
    const jsonData = JSON.stringify(config, null, 2);

    // Use a temporary file approach to avoid locking issues
    const tempFilePath = `${configFilePath}.tmp`;
    let fd = null;

    try {
      // Write to temporary file first
      fs.writeFileSync(tempFilePath, jsonData, { encoding: 'utf8', flag: 'w' });
      logger.info('Written config to temporary file', { tempPath: tempFilePath });

      // Force sync the temporary file
      try {
        fd = fs.openSync(tempFilePath, 'r');
        fs.fsyncSync(fd);
      } finally {
        // Always close the file descriptor if it was opened
        if (fd !== null) {
          fs.closeSync(fd);
          fd = null;
        }
      }

      // Now replace the original file with the temporary one
      // First remove the original file if it exists
      if (fs.existsSync(configFilePath)) {
        fs.unlinkSync(configFilePath);
        logger.info('Removed existing config file before replacing');
      }

      // Rename the temporary file to the actual config file
      fs.renameSync(tempFilePath, configFilePath);
      logger.info('Renamed temporary file to final config file');

      // Force sync the directory to ensure the rename is committed
      const dirPath = path.dirname(configFilePath);
      try {
        fd = fs.openSync(dirPath, 'r');
        fs.fsyncSync(fd);
      } finally {
        // Always close the directory descriptor if it was opened
        if (fd !== null) {
          fs.closeSync(fd);
          fd = null;
        }
      }

      logger.info('Forced fsync on directory to ensure file rename is committed');
    } catch (writeError) {
      // Clean up the temporary file if it exists
      if (fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          logger.info('Cleaned up temporary file after error');
        } catch (cleanupError) {
          logger.error('Failed to clean up temporary file', { error: cleanupError });
        }
      }

      logger.error('Error during file write operations', { error: writeError, stack: writeError.stack });
      throw writeError;
    } finally {
      // Extra safety check to ensure file descriptor is closed
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch (closeError) {
          logger.error('Error closing file descriptor', { error: closeError });
        }
      }
    }

    // Verify the file was actually saved and contains the correct data
    const fileExists = fs.existsSync(configFilePath);
    if (!fileExists) {
      logger.error('Config file does not exist after save attempt', { path: configFilePath });
      return false;
    }

    const savedContent = fs.readFileSync(configFilePath, 'utf8');
    try {
      // Validate that the saved content can be parsed as JSON
      const savedConfig = JSON.parse(savedContent);
      // Verify critical values like port are saved correctly
      if (savedConfig.reaper?.port !== config.reaper?.port) {
        logger.error('Config verification failed - port mismatch', {
          expected: config.reaper?.port,
          actual: savedConfig.reaper?.port
        });
        return false;
      }
    } catch (parseError) {
      logger.error('Failed to parse saved config file', { error: parseError });
      return false;
    }

    logger.info('Configuration saved to file successfully', {
      path: configFilePath,
      configReaperPort: config.reaper.port
    });
    return true;
  } catch (error) {
    logger.error('Error saving configuration', { error, stack: error.stack });
    return false;
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
 * @returns The updated configuration or null if saving failed
 */
function updateConfig(newConfig: Partial<typeof defaultConfig>, save = true): typeof defaultConfig | null {
  // Log the update request
  logger.info('Config update requested', {
    newConfig: JSON.stringify(newConfig),
    save,
    currentReaperPort: currentConfig.reaper.port,
    newReaperPort: newConfig.reaper?.port
  });

  // Create a backup of the current config in case save fails
  const backupConfig = { ...currentConfig };

  // Merge configs
  currentConfig = mergeConfigs(currentConfig, newConfig);

  // Log the merged config
  logger.info('Configs merged', {
    mergedReaperPort: currentConfig.reaper.port
  });

  if (save) {
    logger.info('Saving updated config to file');
    const saveSuccess = saveConfig(currentConfig);

    if (!saveSuccess) {
      logger.error('Failed to save config, reverting to previous config');
      // Revert to previous config
      currentConfig = backupConfig;
      return null;
    }

    // Double-check that our currentConfig was updated
    logger.info('Current config after save', {
      reaperPort: currentConfig.reaper.port
    });
  } else {
    logger.info('Skip saving config to file (save=false)');
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
