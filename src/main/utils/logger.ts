/**
 * Logger Utility
 * Provides logging functionality for the application
 */

// Log levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Logger configuration
interface LoggerConfig {
  level: LogLevel;
  includeTimestamp: boolean;
  logToFile: boolean;
  logFilePath?: string;
}

// Default configuration
const defaultConfig: LoggerConfig = {
  level: LogLevel.INFO,
  includeTimestamp: true,
  logToFile: false,
};

// Current configuration
let config: LoggerConfig = { ...defaultConfig };

/**
 * Configure the logger
 * @param newConfig - New logger configuration
 */
function configure(newConfig: Partial<LoggerConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Format a log message
 * @param level - Log level
 * @param message - Log message
 * @param data - Additional data to log
 * @returns Formatted log message
 */
function formatLogMessage(level: LogLevel, message: string, data?: any): string {
  const levelStr = LogLevel[level];
  const timestamp = config.includeTimestamp ? `[${new Date().toISOString()}] ` : '';
  const dataStr = data ? ` ${JSON.stringify(data, null, 2)}` : '';

  return `${timestamp}[${levelStr}] ${message}${dataStr}`;
}

/**
 * Log a message at the specified level
 * @param level - Log level
 * @param message - Log message
 * @param data - Additional data to log
 */
function log(level: LogLevel, message: string, data?: any): void {
  if (level < config.level) return;

  const formattedMessage = formatLogMessage(level, message, data);

  switch (level) {
    case LogLevel.DEBUG:
      console.debug(formattedMessage);
      break;
    case LogLevel.INFO:
      console.info(formattedMessage);
      break;
    case LogLevel.WARN:
      console.warn(formattedMessage);
      break;
    case LogLevel.ERROR:
      console.error(formattedMessage);
      break;
  }

  // TODO: Implement file logging if needed
}

// Public API
export default {
  configure,
  debug: (message: string, data?: any) => log(LogLevel.DEBUG, message, data),
  info: (message: string, data?: any) => log(LogLevel.INFO, message, data),
  warn: (message: string, data?: any) => log(LogLevel.WARN, message, data),
  error: (message: string, data?: any) => log(LogLevel.ERROR, message, data),
  log: (message: string, data?: any) => log(LogLevel.INFO, message, data),
};
