/**
 * Logger Utility
 * Provides conditional logging based on environment
 */

// Check if we're in production mode
// In Vite/SvelteKit, import.meta.env.PROD is automatically set based on NODE_ENV
const isProduction = import.meta.env.PROD;

/**
 * Logger object with methods that conditionally log based on environment
 */
const logger = {
  /**
   * Log message in development mode only
   * @param {...any} args - Arguments to pass to console.log
   */
  log: (...args) => {
    if (!isProduction) {
      console.log(...args);
    }
  },
  
  /**
   * Log warning in both development and production
   * @param {...any} args - Arguments to pass to console.warn
   */
  warn: (...args) => {
    console.warn(...args);
  },
  
  /**
   * Log error in both development and production
   * @param {...any} args - Arguments to pass to console.error
   */
  error: (...args) => {
    console.error(...args);
  },
  
  /**
   * Log info in both development and production
   * This can be used for important information that should always be logged
   * @param {...any} args - Arguments to pass to console.info
   */
  info: (...args) => {
    console.info(...args);
  }
};

export default logger;