/**
 * Logger Utility
 * Provides logging functionality for the application
 */

// Log levels
enum LogLevel {
  DEBUG = 0,
  LOG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  NONE = 5
}

// Current log level (can be changed at runtime)
let currentLogLevel = LogLevel.LOG;

// Whether to include timestamps in logs
let includeTimestamps = true;

/**
 * Formats a log message with optional timestamp
 * @param message - The message to format
 * @returns Formatted message with timestamp if enabled
 */
function formatMessage(message: string): string {
  if (includeTimestamps) {
    const now = new Date();
    const timestamp = now.toISOString();
    return `[${timestamp}] ${message}`;
  }
  return message;
}

/**
 * Logger object with methods for different log levels
 */
const logger = {
  /**
   * Set the current log level
   * @param level - The log level to set
   */
  setLogLevel(level: LogLevel): void {
    currentLogLevel = level;
  },

  /**
   * Enable or disable timestamps in logs
   * @param enable - Whether to include timestamps
   */
  setIncludeTimestamps(enable: boolean): void {
    includeTimestamps = enable;
  },

  /**
   * Log a debug message
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  debug(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.DEBUG) {
      console.debug(formatMessage(message), ...args);
    }
  },

  /**
   * Log a standard message
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  log(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.LOG) {
      console.log(formatMessage(message), ...args);
    }
  },

  /**
   * Log an info message
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  info(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.INFO) {
      console.info(formatMessage(message), ...args);
    }
  },

  /**
   * Log a warning message
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  warn(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.WARN) {
      console.warn(formatMessage(message), ...args);
    }
  },

  /**
   * Log an error message
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  error(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.ERROR) {
      console.error(formatMessage(message), ...args);
    }
  },

  /**
   * Log a group of messages
   * @param label - The group label
   * @param fn - Function to execute within the group
   */
  group(label: string, fn: () => void): void {
    if (currentLogLevel <= LogLevel.LOG) {
      console.group(formatMessage(label));
      fn();
      console.groupEnd();
    } else {
      fn();
    }
  }
};

export default logger;
