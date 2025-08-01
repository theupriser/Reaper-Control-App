/**
 * Adapter for Reaper Web Interface
 * This adapter provides a clean API for communicating with the Reaper Web Interface
 */

// Import required modules
const http = require('http');
const https = require('https');
const url = require('url');
const logger = require('../utils/logger');

// Create a Web class that implements the API for Reaper communication
class Web {
  constructor(config) {
    // Store the original config
    this.originalConfig = config;
    
    // Extract configuration
    this.host = config.host || '127.0.0.1';
    this.port = config.webPort || 8080;
    
    // Set up logging context only if WEB_ADAPTER_LOG is enabled
    this.logContext = null;
    if (process.env.WEB_ADAPTER_LOG === 'true') {
      this.logContext = logger.startCollection('WebAdapter');
      
      // Log configuration
      logger.collect(this.logContext, 'Web Adapter Configuration:');
      logger.collect(this.logContext, '- Host:', this.host);
      logger.collect(this.logContext, '- Web Port:', this.port);
    }
    
    // Store for pending responses
    this.pendingCommands = new Map();
    this.nextCommandId = 1;
    
    // Initialize request queue and timer
    this.requestQueue = [];
    this.isProcessingQueue = false;
  }
  
  /**
   * Connect to Reaper
   * @returns {Promise<void>} A promise that resolves when connected
   */
  async connect() {
    try {
      // Test connection by sending a simple request
      const response = await this.sendRequest('TRANSPORT');
      
      if (this.logContext) {
        logger.collect(this.logContext, 'Web Adapter: Connected to Reaper Web Interface');
        logger.collect(this.logContext, 'Web Adapter: Initial transport state:', response);
        // Flush logs after successful connection
        logger.flushLogs(this.logContext);
      } else {
        // Always log connection success, even without detailed logging
        logger.log('Web Adapter: Connected to Reaper Web Interface');
      }
      
      return Promise.resolve();
    } catch (error) {
      if (this.logContext) {
        logger.collectError(this.logContext, 'Web Adapter: Failed to connect to Reaper Web Interface:', error);
        // Error logs are automatically flushed by the logger
      } else {
        // Always log connection errors, even without detailed logging
        logger.error('Web Adapter: Failed to connect to Reaper Web Interface:', error);
      }
      
      return Promise.reject(error);
    }
  }
  
  /**
   * Send a command to Reaper
   * @param {string} command - The command to send
   * @returns {Promise<string>} A promise that resolves with the response
   */
  async send(command) {
    if (this.logContext) {
      logger.collect(this.logContext, `Web Adapter: Sending command: ${command}`);
    }
    
    try {
      // Parse the command to create appropriate request
      if (command === '/REGION') {
        // For region commands, request the region list
        const response = await this.sendRequest('REGION');
        const result = this.formatRegionListResponse(response);
        // Flush logs after important region operations
        if (this.logContext) {
          logger.flushLogs(this.logContext);
        }
        return result;
      } else if (command === '/TRANSPORT') {
        // For transport commands, request the transport state
        const response = await this.sendRequest('TRANSPORT');
        const result = this.formatTransportResponse(response);
        // Flush logs after important transport operations
        if (this.logContext) {
          logger.flushLogs(this.logContext);
        }
        return result;
      } else if (command.startsWith('/SET/POS/')) {
        // For position commands, extract the position value
        const posValue = command.split('/SET/POS/')[1];
        const position = parseFloat(posValue);
        
        // Send the position command
        await this.sendRequest(`SET/POS/${position}`);
        // Flush logs after position change
        if (this.logContext) {
          logger.flushLogs(this.logContext);
        }
        return '';
      } else if (command.match(/^\/\d+$/)) {
        // For action commands like /1007, extract the action ID
        const actionId = parseInt(command.substring(1));
        
        // Send the action command
        await this.sendRequest(`${actionId}`);
        return '';
      } else {
        // For other commands, send as is (removing the leading slash)
        const cleanCommand = command.startsWith('/') ? command.substring(1) : command;
        const response = await this.sendRequest(cleanCommand);
        return response;
      }
    } catch (error) {
      if (this.logContext) {
        logger.collectError(this.logContext, `Web Adapter: Error sending command: ${command}`, error);
        // Error logs are automatically flushed by the logger
      } else {
        // Always log errors, even without detailed logging
        logger.error(`Web Adapter: Error sending command: ${command}`, error);
      }
      throw error;
    }
  }
  
  /**
   * Send a request to the Reaper Web Interface
   * @private
   * @param {string} command - The command to send
   * @returns {Promise<string>} A promise that resolves with the response
   */
  sendRequest(command) {
    return new Promise((resolve, reject) => {
      // Create the request URL
      const requestUrl = `http://${this.host}:${this.port}/_/${command}`;
      
      if (this.logContext) {
        logger.collect(this.logContext, `Web Adapter: Sending request to ${requestUrl}`);
      }
      
      // Parse the URL
      const parsedUrl = url.parse(requestUrl);
      
      // Create the request options
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.path,
        method: 'GET',
        timeout: 5000 // 5 second timeout
      };
      
      // Create the request
      const req = http.request(options, (res) => {
        let data = '';
        
        // Handle data chunks
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        // Handle end of response
        res.on('end', () => {
          if (this.logContext) {
            logger.collect(this.logContext, `Web Adapter: Received response for ${command}:`, data.substring(0, 100) + (data.length > 100 ? '...' : ''));
          }
          resolve(data);
        });
      });
      
      // Handle errors
      req.on('error', (error) => {
        if (this.logContext) {
          logger.collectError(this.logContext, `Web Adapter: Error sending request to ${requestUrl}:`, error);
        } else {
          // Always log errors, even without detailed logging
          logger.error(`Web Adapter: Error sending request to ${requestUrl}:`, error);
        }
        reject(error);
      });
      
      // Handle timeout
      req.on('timeout', () => {
        if (this.logContext) {
          logger.collectError(this.logContext, `Web Adapter: Request to ${requestUrl} timed out`);
        } else {
          // Always log timeout errors, even without detailed logging
          logger.error(`Web Adapter: Request to ${requestUrl} timed out`);
        }
        req.abort();
        reject(new Error('Request timed out'));
      });
      
      // End the request
      req.end();
    });
  }
  
  /**
   * Format a region list response
   * @private
   * @param {string} response - The raw response from Reaper
   * @returns {string} The formatted response
   */
  formatRegionListResponse(response) {
    if (this.logContext) {
      logger.collect(this.logContext, 'Web Adapter: Formatting region list response');
    }
    
    // Initialize the formatted response
    let formattedResponse = 'REGION_LIST\n';
    
    try {
      // Split the response into lines
      const lines = response.split('\n');
      
      // Process each line
      for (const line of lines) {
        // Skip empty lines
        if (!line.trim()) continue;
        
        // Parse the line
        const parts = line.split('\t');
        
        // Check if this is a region line
        if (parts[0] === 'REGION') {
          // Add the region to the formatted response
          formattedResponse += line + '\n';
        }
      }
      
      // Add the end marker
      formattedResponse += 'REGION_LIST_END';
      
      if (this.logContext) {
        logger.collect(this.logContext, 'Web Adapter: Formatted region list response:', formattedResponse);
      }
      return formattedResponse;
    } catch (error) {
      if (this.logContext) {
        logger.collectError(this.logContext, 'Web Adapter: Error formatting region list response:', error);
      } else {
        // Always log errors, even without detailed logging
        logger.error('Web Adapter: Error formatting region list response:', error);
      }
      
      // Return an empty region list in case of error
      return 'REGION_LIST\nREGION_LIST_END';
    }
  }
  
  /**
   * Format a transport response
   * @private
   * @param {string} response - The raw response from Reaper
   * @returns {string} The formatted response
   */
  formatTransportResponse(response) {
    let detailedLogContext = null;
    
    // Only create log context if WEB_ADAPTER_LOG is enabled
    if (process.env.WEB_ADAPTER_LOG === 'true') {
      detailedLogContext = logger.startCollection('format-transport-response');
      logger.collect(detailedLogContext, 'Web Adapter: Formatting transport response');
      logger.collect(detailedLogContext, 'Raw response from Reaper:', response);
    }
    
    try {
      // Split the response into lines
      const lines = response.split('\n');
      if (detailedLogContext) {
        logger.collect(detailedLogContext, 'Response split into lines, count:', lines.length);
      }
      
      // Find the transport line
      let transportLineFound = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip empty lines
        if (!line.trim()) {
          if (detailedLogContext) {
            logger.collect(detailedLogContext, `Line ${i}: Empty line, skipping`);
          }
          continue;
        }
        
        // Parse the line
        const parts = line.split('\t');
        if (detailedLogContext) {
          logger.collect(detailedLogContext, `Line ${i}: Split into ${parts.length} parts:`, parts);
        }
        
        // Check if this is a transport line
        if (parts[0] === 'TRANSPORT') {
          transportLineFound = true;
          
          if (detailedLogContext) {
            logger.collect(detailedLogContext, `Line ${i}: Found transport line:`, line);
            logger.collect(detailedLogContext, 'Transport parts:', parts);
            
            // Log the play state specifically
            if (parts.length > 1) {
              const playstate = parseInt(parts[1]);
              logger.collect(detailedLogContext, 'Playstate value:', playstate);
              logger.collect(detailedLogContext, 'isPlaying (playstate === 1):', playstate === 1);
            }
            
            logger.flushLogs(detailedLogContext);
          }
          
          return line;
        }
      }
      
      // If no transport line was found, return a default response
      if (!transportLineFound) {
        if (detailedLogContext) {
          logger.collect(detailedLogContext, 'Web Adapter: No transport line found in response');
          logger.collect(detailedLogContext, 'Returning default transport response');
          logger.flushLogs(detailedLogContext);
        }
        return 'TRANSPORT\t0\t0\t0\t0:00\t1.1.00';
      }
    } catch (error) {
      if (detailedLogContext) {
        logger.collectError(detailedLogContext, 'Web Adapter: Error formatting transport response:', error);
        logger.collect(detailedLogContext, 'Returning default transport response due to error');
        logger.flushLogs(detailedLogContext);
      } else {
        // Always log errors, even without detailed logging
        logger.error('Web Adapter: Error formatting transport response:', error);
      }
      
      // Return a default transport state in case of error
      return 'TRANSPORT\t0\t0\t0\t0:00\t1.1.00';
    }
  }
}

// Export the Web class
module.exports = { Web };