/**
 * Base Service
 * Provides common functionality for all services including event handling and logging
 */

const logger = require('../utils/logger');

class BaseService {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.eventListeners = {};
  }

  /**
   * Register an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  /**
   * Emit an event to all registered listeners
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emitEvent(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => callback(data));
    }
  }

  /**
   * Start a log collection context
   * @param {string} operation - The operation name
   * @returns {string} The log context
   */
  startLogContext(operation) {
    return logger.startCollection(`${this.serviceName}.${operation}`);
  }

  /**
   * Log a message within a context
   * @param {string} context - The log context
   * @param {string} message - The message to log
   * @param {...any} args - Additional arguments to log
   */
  logWithContext(context, message, ...args) {
    logger.collect(context, message, ...args);
  }

  /**
   * Log an error within a context
   * @param {string} context - The log context
   * @param {string} message - The error message
   * @param {Error} error - The error object
   */
  logErrorWithContext(context, message, error) {
    logger.collectError(context, message, error);
  }

  /**
   * Flush logs for a context
   * @param {string} context - The log context
   */
  flushLogs(context) {
    logger.flushLogs(context);
  }

  /**
   * Log a message without context
   * @param {string} message - The message to log
   * @param {...any} args - Additional arguments to log
   */
  log(message, ...args) {
    logger.log(`[${this.serviceName}] ${message}`, ...args);
  }

  /**
   * Log an error without context
   * @param {string} message - The error message
   * @param {Error} error - The error object
   */
  logError(message, error) {
    logger.error(`[${this.serviceName}] ${message}`, error);
  }

  /**
   * Standard error handler that logs the error and emits an error event
   * @param {string} operation - The operation that failed
   * @param {Error} error - The error object
   * @param {string} [context] - Optional log context
   * @throws {Error} Rethrows the original error
   */
  handleError(operation, error, context = null) {
    const errorMessage = `Error in ${operation}: ${error.message}`;
    
    if (context) {
      this.logErrorWithContext(context, errorMessage, error);
    } else {
      this.logError(errorMessage, error);
    }

    // Emit error event if listeners are registered
    this.emitEvent('error', {
      type: 'error',
      operation,
      message: errorMessage,
      details: error.message
    });

    throw error;
  }
}

module.exports = BaseService;