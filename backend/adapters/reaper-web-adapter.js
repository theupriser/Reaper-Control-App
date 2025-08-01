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
    
    // Set up logging context
    this.logContext = logger.startCollection('WebAdapter');
    
    // Log configuration
    logger.collect(this.logContext, 'Web Adapter Configuration:');
    logger.collect(this.logContext, '- Host:', this.host);
    logger.collect(this.logContext, '- Web Port:', this.port);
    
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
      logger.collect(this.logContext, 'Web Adapter: Connected to Reaper Web Interface');
      logger.collect(this.logContext, 'Web Adapter: Initial transport state:', response);
      // Flush logs after successful connection
      logger.flushLogs(this.logContext);
      return Promise.resolve();
    } catch (error) {
      logger.collectError(this.logContext, 'Web Adapter: Failed to connect to Reaper Web Interface:', error);
      // Error logs are automatically flushed by the logger
      return Promise.reject(error);
    }
  }
  
  /**
   * Send a command to Reaper
   * @param {string} command - The command to send
   * @returns {Promise<string>} A promise that resolves with the response
   */
  async send(command) {
    logger.collect(this.logContext, `Web Adapter: Sending command: ${command}`);
    
    try {
      // Parse the command to create appropriate request
      if (command === '/REGION') {
        // For region commands, request the region list
        const response = await this.sendRequest('REGION');
        const result = this.formatRegionListResponse(response);
        // Flush logs after important region operations
        logger.flushLogs(this.logContext);
        return result;
      } else if (command === '/TRANSPORT') {
        // For transport commands, request the transport state
        const response = await this.sendRequest('TRANSPORT');
        const result = this.formatTransportResponse(response);
        // Flush logs after important transport operations
        logger.flushLogs(this.logContext);
        return result;
      } else if (command.startsWith('/SET/POS/')) {
        // For position commands, extract the position value
        const posValue = command.split('/SET/POS/')[1];
        const position = parseFloat(posValue);
        
        // Send the position command
        await this.sendRequest(`SET/POS/${position}`);
        // Flush logs after position change
        logger.flushLogs(this.logContext);
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
      logger.collectError(this.logContext, `Web Adapter: Error sending command: ${command}`, error);
      // Error logs are automatically flushed by the logger
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
      
      logger.collect(this.logContext, `Web Adapter: Sending request to ${requestUrl}`);
      
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
          logger.collect(this.logContext, `Web Adapter: Received response for ${command}:`, data.substring(0, 100) + (data.length > 100 ? '...' : ''));
          resolve(data);
        });
      });
      
      // Handle errors
      req.on('error', (error) => {
        logger.collectError(this.logContext, `Web Adapter: Error sending request to ${requestUrl}:`, error);
        reject(error);
      });
      
      // Handle timeout
      req.on('timeout', () => {
        logger.collectError(this.logContext, `Web Adapter: Request to ${requestUrl} timed out`);
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
    logger.collect(this.logContext, 'Web Adapter: Formatting region list response');
    
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
      
      logger.collect(this.logContext, 'Web Adapter: Formatted region list response:', formattedResponse);
      return formattedResponse;
    } catch (error) {
      logger.collectError(this.logContext, 'Web Adapter: Error formatting region list response:', error);
      
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
    logger.collect(this.logContext, 'Web Adapter: Formatting transport response');
    
    try {
      // Split the response into lines
      const lines = response.split('\n');
      
      // Find the transport line
      for (const line of lines) {
        // Skip empty lines
        if (!line.trim()) continue;
        
        // Parse the line
        const parts = line.split('\t');
        
        // Check if this is a transport line
        if (parts[0] === 'TRANSPORT') {
          logger.collect(this.logContext, 'Web Adapter: Found transport line:', line);
          return line;
        }
      }
      
      // If no transport line was found, return a default response
      logger.collect(this.logContext, 'Web Adapter: No transport line found, returning default');
      return 'TRANSPORT\t0\t0\t0\t0:00\t1.1.00';
    } catch (error) {
      logger.collectError(this.logContext, 'Web Adapter: Error formatting transport response:', error);
      
      // Return a default transport state in case of error
      return 'TRANSPORT\t0\t0\t0\t0:00\t1.1.00';
    }
  }
}

// Export the Web class
module.exports = { Web };