/**
 * Enhanced logger with bundling capabilities
 * Provides standard logging as well as log collection and bundling for better debugging
 */

// Get configuration from environment variables or use defaults
const getConfig = () => {
  return {
    MAX_BUFFER_SIZE: parseInt(process.env.LOG_BUNDLE_SIZE) || 20,
    BUFFER_TIMEOUT: parseInt(process.env.LOG_BUNDLE_TIMEOUT) || 2000
  };
};

class Logger {
  constructor() {
    // Log collection buffers for different contexts
    this.logBuffers = {};
    
    // Get configuration
    const config = getConfig();
    this.MAX_BUFFER_SIZE = config.MAX_BUFFER_SIZE;
    this.BUFFER_TIMEOUT = config.BUFFER_TIMEOUT;
    
    // Timers for auto-flushing buffers
    this.bufferTimers = {};
  }

  // Standard logging functions
  log(...args) {
    // In development mode, log everything (unless being collected)
    if (process.env.NODE_ENV !== 'production') {
      console.log(...args);
    }
  }
  
  error(...args) {
    // Always log errors in any environment
    console.error(...args);
  }
  
  // Start collecting logs for a specific context
  startCollection(context) {
    if (!this.logBuffers[context]) {
      this.logBuffers[context] = [];
    }
    return context;
  }
  
  // Add a log to the collection without immediately outputting
  collect(context, ...args) {
    // If no context or not in development mode, don't collect
    if (!context || process.env.NODE_ENV === 'production') {
      return;
    }
    
    // Create the buffer if it doesn't exist
    if (!this.logBuffers[context]) {
      this.logBuffers[context] = [];
    }
    
    // Add the log to the buffer with timestamp
    this.logBuffers[context].push({
      timestamp: new Date().toISOString(),
      message: args
    });
    
    // Set or reset the auto-flush timer
    if (this.bufferTimers[context]) {
      clearTimeout(this.bufferTimers[context]);
    }
    
    const self = this;
    this.bufferTimers[context] = setTimeout(() => {
      if (self.logBuffers[context] && self.logBuffers[context].length > 0) {
        self.flushLogs(context);
      }
    }, this.BUFFER_TIMEOUT);
    
    // Auto-flush if buffer gets too large
    if (this.logBuffers[context].length >= this.MAX_BUFFER_SIZE) {
      this.flushLogs(context);
    }
  }
  
  // Collect an error log
  collectError(context, ...args) {
    // Always collect errors regardless of environment
    if (!context) {
      // If no context, just log the error directly
      console.error(...args);
      return;
    }
    
    // Create the buffer if it doesn't exist
    if (!this.logBuffers[context]) {
      this.logBuffers[context] = [];
    }
    
    // Add the error to the buffer with timestamp
    this.logBuffers[context].push({
      timestamp: new Date().toISOString(),
      isError: true,
      message: args
    });
    
    // Errors should trigger an immediate flush
    this.flushLogs(context);
  }
  
  // Flush all collected logs for a context
  flushLogs(context) {
    if (!this.logBuffers[context] || this.logBuffers[context].length === 0) {
      return;
    }
    
    // Clear any pending auto-flush timer
    if (this.bufferTimers[context]) {
      clearTimeout(this.bufferTimers[context]);
      delete this.bufferTimers[context];
    }
    
    // Only output in development mode or if there are errors
    if (process.env.NODE_ENV !== 'production' || this.logBuffers[context].some(log => log.isError)) {
      // Format the bundled logs
      const formattedLogs = this.logBuffers[context].map(log => 
        `[${log.timestamp}] ${log.isError ? 'ERROR: ' : ''}${log.message.join(' ')}`
      );
      
      // Build a single string with all bundled logs
      const header = `--- BEGIN ${context} (${this.logBuffers[context].length} entries) ---`;
      const footer = `--- END ${context} ---`;
      const bundledLogs = [header, ...formattedLogs, footer].join('\n');
      
      // Output all bundled logs in a single console.log call
      console.log(bundledLogs + '\n');
    }
    
    // Clear the buffer
    this.logBuffers[context] = [];
  }
}

// Create and export a singleton logger instance
const logger = new Logger();

module.exports = logger;