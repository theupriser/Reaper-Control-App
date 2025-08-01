/**
 * Adapter for reaper-osc package to provide compatibility with the expected API
 * This adapter bridges the gap between the expected API (OSC class) and the available API (Reaper class)
 */

// Import the actual reaper-osc package
const reaperOsc = require('reaper-osc');

// Create a custom OSC class that wraps the Reaper class
class OSC {
  constructor(config) {
    // Store the original config
    this.originalConfig = config;
    
    // Map the config to ReaperConfiguration
    const reaperConfig = new reaperOsc.ReaperConfiguration();
    reaperConfig.remoteAddress = config.host || '127.0.0.1';
    reaperConfig.remotePort = config.port || 8000;
    reaperConfig.localPort = config.localPort || 9000;
    reaperConfig.localAddress = '127.0.0.1';
    
    console.log('OSC Adapter Configuration:');
    console.log('- Remote Address:', reaperConfig.remoteAddress);
    console.log('- Remote Port:', reaperConfig.remotePort);
    console.log('- Local Port:', reaperConfig.localPort);
    console.log('- Local Address:', reaperConfig.localAddress);
    
    // Set up message handler for responses with extra logging
    reaperConfig.afterMessageReceived = (message, handled) => {
      console.log('OSC Adapter: Message received callback triggered');
      console.log('OSC Message:', JSON.stringify(message, null, 2));
      console.log('Handled:', handled);
      this.handleResponse(message, handled);
    };
    
    // Create a Reaper instance with the mapped config
    this.reaper = new reaperOsc.Reaper(reaperConfig);
    
    // Store for pending responses
    this.pendingCommands = new Map();
    this.nextCommandId = 1;
  }
  
  /**
   * Connect to Reaper
   * @returns {Promise<void>} A promise that resolves when connected
   */
  async connect() {
    try {
      // Start the OSC connection
      await this.reaper.start();
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }
  
  /**
   * Send a command to Reaper
   * @param {string} command - The command to send
   * @returns {Promise<string>} A promise that resolves with the response
   */
  async send(command) {
    return new Promise((resolve, reject) => {
      try {
        console.log(`OSC Adapter: Sending command: ${command}`);
        
        // Generate a unique ID for this command
        const commandId = this.nextCommandId++;
        
        // Parse the command to create appropriate message
        if (command.startsWith('/')) {
          // Extract the address and any arguments
          let address = command;
          let args = [];
          
          // Check if the command has arguments (e.g., /SET/POS/123.45)
          if (command.includes('/SET/POS/')) {
            try {
              // Extract position value for SET/POS commands
              const posValue = command.split('/SET/POS/')[1];
              address = '/SET/POS';
              
              // Create a properly formatted argument object for the OSC message
              args = [{ type: 'f', value: parseFloat(posValue) }];
              
              // Send the message and resolve immediately for position commands
              console.log(`OSC Adapter: Creating position message: ${address} with args:`, args);
              const message = new reaperOsc.OscMessage(address, args);
              this.reaper.sendOscMessage(message);
              console.log(`OSC Adapter: Position command sent: ${address} ${JSON.stringify(args)}`);
              resolve('');
              return;
            } catch (error) {
              console.error(`OSC Adapter: Error formatting position command:`, error);
              // Fall back to using the action command for seeking
              console.log(`OSC Adapter: Falling back to action command for seeking`);
              this.reaper.triggerAction(40755); // Go to start of project (as a fallback)
              resolve('');
              return;
            }
          } else if (command.match(/^\/\d+$/)) {
            // For action commands like /1007, use ActionMessage
            const actionId = parseInt(command.substring(1));
            this.reaper.triggerAction(actionId);
            console.log(`OSC Adapter: Action command sent: ${actionId}`);
            resolve('');
            return;
          } else if (command === '/REGION') {
            // For region commands, send the message and wait for a response
            const message = new reaperOsc.OscMessage(address, args);
            this.reaper.sendOscMessage(message);
            console.log(`OSC Adapter: Region command sent: ${address}`);
            
            // Store the resolve function to be called when a response is received
            this.pendingCommands.set(commandId, { resolve, command });
            
            // Set a timeout to handle the case where no response is received
            setTimeout(() => {
              if (this.pendingCommands.has(commandId)) {
                console.log(`OSC Adapter: No response received for region command, resolving with empty region list`);
                this.pendingCommands.delete(commandId);
                resolve('REGION_LIST\nREGION_LIST_END');
              }
            }, 2000); // 2 second timeout
            return;
          } else if (command === '/TRANSPORT') {
            // For transport commands, send the message and wait for a response
            const message = new reaperOsc.OscMessage(address, args);
            this.reaper.sendOscMessage(message);
            console.log(`OSC Adapter: Transport command sent: ${address}`);
            
            // Store the resolve function to be called when a response is received
            this.pendingCommands.set(commandId, { resolve, command });
            
            // Set a timeout to handle the case where no response is received
            setTimeout(() => {
              if (this.pendingCommands.has(commandId)) {
                console.log(`OSC Adapter: No response received for transport command, resolving with default transport state`);
                this.pendingCommands.delete(commandId);
                // Default transport state (stopped at position 0)
                resolve('TRANSPORT\t0\t0\t0\t0:00\t1.1.00');
              }
            }, 1000); // 1 second timeout
            return;
          }
          
          // For other commands, send the message and resolve after a short delay
          const message = new reaperOsc.OscMessage(address, args);
          this.reaper.sendOscMessage(message);
          console.log(`OSC Adapter: Generic command sent: ${address}`);
          
          // Store the resolve function to be called when a response is received
          this.pendingCommands.set(commandId, { resolve, command });
          
          // Set a timeout to clean up if no response is received
          setTimeout(() => {
            if (this.pendingCommands.has(commandId)) {
              // If the command is still pending after timeout, resolve with empty string
              console.log(`OSC Adapter: No response received for command: ${command}, resolving with empty string`);
              this.pendingCommands.delete(commandId);
              resolve('');
            }
          }, 1000); // 1 second timeout (reduced from 5 seconds)
        } else {
          // For non-OSC commands, reject with error
          reject(new Error(`Unsupported command format: ${command}`));
          return;
        }
      } catch (error) {
        console.error(`OSC Adapter: Error sending command: ${command}`, error);
        reject(error);
      }
    });
  }
  
  /**
   * Handle responses from Reaper
   * @private
   * @param {Object} message - The OSC message
   * @param {boolean} handled - Whether the message was handled by a handler
   */
  handleResponse(message, handled) {
    console.log('Received OSC message:', message.address);
    console.log('Message args:', JSON.stringify(message.args, null, 2));
    console.log('Full message:', JSON.stringify(message, null, 2));
    
    // Log all pending commands for debugging
    console.log('Pending commands:', Array.from(this.pendingCommands.entries()).map(([id, { command }]) => ({ id, command })));
    
    // Special handling for specific message types that might not be direct responses
    if (message.address === '/REGION_LIST' || message.address === '/REGION') {
      console.log('Processing region list message');
      // Find any pending REGION command
      for (const [commandId, { resolve, command }] of this.pendingCommands.entries()) {
        if (command === '/REGION') {
          const formattedResponse = this.formatRegionListResponse(message);
          console.log('Formatted region response:', formattedResponse);
          resolve(formattedResponse);
          this.pendingCommands.delete(commandId);
          return;
        }
      }
    }
    
    // Handle transport state responses
    if (message.address === '/TRANSPORT') {
      console.log('Processing transport state message');
      // Find any pending TRANSPORT command
      for (const [commandId, { resolve, command }] of this.pendingCommands.entries()) {
        if (command === '/TRANSPORT') {
          const formattedResponse = this.formatTransportResponse(message);
          console.log('Formatted transport response:', formattedResponse);
          resolve(formattedResponse);
          this.pendingCommands.delete(commandId);
          return;
        }
      }
    }
    
    // For other messages, try to match by address
    for (const [commandId, { resolve, command }] of this.pendingCommands.entries()) {
      // Extract the address from the command (remove any arguments)
      const commandAddress = command.split('/')[1] ? `/${command.split('/')[1]}` : command;
      console.log(`Checking if message address ${message.address} matches command address ${commandAddress}`);
      
      if (message.address === commandAddress) {
        const formattedResponse = this.formatGenericResponse(message);
        console.log('Formatted generic response:', formattedResponse);
        resolve(formattedResponse);
        this.pendingCommands.delete(commandId);
        return;
      }
    }
    
    // If we get here, no pending command matched this message
    console.log('No pending command matched this message, message might be unsolicited or using a different address format');
  }
  
  /**
   * Format a region list response
   * @private
   * @param {Object} message - The OSC message
   * @returns {string} The formatted response
   */
  formatRegionListResponse(message) {
    console.log('Formatting region list response from message:', message.address);
    let response = 'REGION_LIST\n';
    
    // The message might contain region data in different formats depending on the API
    // We need to handle different possible structures
    
    if (Array.isArray(message.args)) {
      console.log('Processing array of args, length:', message.args.length);
      // If args is an array of regions
      for (const arg of message.args) {
        console.log('Processing arg type:', typeof arg);
        if (typeof arg === 'object' && arg !== null) {
          // If each arg is a region object
          console.log('Processing region object:', JSON.stringify(arg));
          const name = arg.name || 'Unnamed';
          const id = arg.id || 0;
          const start = arg.start || 0;
          const end = arg.end || 0;
          const color = arg.color || '';
          
          response += `REGION\t${name}\t${id}\t${start}\t${end}\t${color}\n`;
        } else if (typeof arg === 'string' && arg.startsWith('REGION')) {
          // If each arg is a string in the format "REGION name id start end color"
          console.log('Processing region string:', arg);
          response += arg + '\n';
        } else {
          console.log('Unhandled arg type or format:', typeof arg, arg);
        }
      }
    } else if (typeof message.args === 'object' && message.args !== null) {
      console.log('Processing object args:', JSON.stringify(message.args));
      // If args is a single object with region data
      const regions = message.args.regions || [];
      console.log('Extracted regions array, length:', regions.length);
      for (const region of regions) {
        console.log('Processing region:', JSON.stringify(region));
        const name = region.name || 'Unnamed';
        const id = region.id || 0;
        const start = region.start || 0;
        const end = region.end || 0;
        const color = region.color || '';
        
        response += `REGION\t${name}\t${id}\t${start}\t${end}\t${color}\n`;
      }
    } else {
      console.log('Unhandled message.args type:', typeof message.args);
    }
    
    // No need to add dummy regions, just end the list
    response += 'REGION_LIST_END';
    console.log('Final formatted response:', response);
    console.log('Final formatted response length:', response.length);
    return response;
  }
  
  /**
   * Format a transport response
   * @private
   * @param {Object} message - The OSC message
   * @returns {string} The formatted response
   */
  formatTransportResponse(message) {
    // The expected format is: TRANSPORT playstate position_seconds isRepeatOn position_string position_string_beats
    
    let playstate = 0; // 0=stopped, 1=playing
    let position = 0;
    let isRepeatOn = 0;
    let positionString = '0:00';
    let positionStringBeats = '1.1.00';
    
    // Extract values from the message based on its structure
    if (Array.isArray(message.args) && message.args.length > 0) {
      // If args is an array with transport data
      playstate = message.args[0] || 0;
      position = message.args[1] || 0;
      isRepeatOn = message.args[2] || 0;
      positionString = message.args[3] || '0:00';
      positionStringBeats = message.args[4] || '1.1.00';
    } else if (typeof message.args === 'object' && message.args !== null) {
      // If args is an object with transport properties
      playstate = message.args.playstate || 0;
      position = message.args.position || 0;
      isRepeatOn = message.args.isRepeatOn || 0;
      positionString = message.args.positionString || '0:00';
      positionStringBeats = message.args.positionStringBeats || '1.1.00';
    }
    
    return `TRANSPORT\t${playstate}\t${position}\t${isRepeatOn}\t${positionString}\t${positionStringBeats}`;
  }
  
  /**
   * Format a generic response
   * @private
   * @param {Object} message - The OSC message
   * @returns {string} The formatted response
   */
  formatGenericResponse(message) {
    // For generic responses, just convert to string in a reasonable format
    if (Array.isArray(message.args) && message.args.length > 0) {
      return `${message.address}\t${message.args.join('\t')}`;
    } else if (typeof message.args === 'object' && message.args !== null) {
      return `${message.address}\t${JSON.stringify(message.args)}`;
    } else {
      return message.address;
    }
  }
}

// Export the OSC class
module.exports = { OSC };