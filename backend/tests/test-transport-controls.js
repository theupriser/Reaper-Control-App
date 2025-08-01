/**
 * Test script to directly test each transport control command and the region fetching mechanism
 * This script will help identify where the issues are occurring
 */

const { OSC } = require('./adapters/reaper-osc-adapter');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create OSC instance
const reaper = new OSC({
  host: process.env.REAPER_HOST || '127.0.0.1',
  port: parseInt(process.env.REAPER_PORT || '9000'),
  localPort: 8001  // Use a different port to avoid conflicts
});

// Function to parse region list response (copied from server.js)
function parseRegionList(response) {
  console.log('Parsing region list response...');
  console.log('Raw response:', response);
  
  const parsedRegions = [];
  
  // Skip the first line (REGION_LIST) and last line (REGION_LIST_END)
  const lines = response.split('\n').filter(line => 
    line !== 'REGION_LIST' && line !== 'REGION_LIST_END' && line.trim() !== '');
  
  console.log('Filtered lines count:', lines.length);
  console.log('Filtered lines:', lines);
  
  for (const line of lines) {
    console.log('Processing line:', line);
    if (line.startsWith('REGION')) {
      const parts = line.split('\t');
      console.log('Line parts:', parts);
      if (parts.length >= 5) {
        const region = {
          id: parseInt(parts[2]),
          name: parts[1],
          start: parseFloat(parts[3]),
          end: parseFloat(parts[4]),
          color: parts[5] ? parts[5] : null
        };
        console.log('Created region object:', region);
        parsedRegions.push(region);
      } else {
        console.log('Skipping line with insufficient parts:', parts.length);
      }
    } else {
      console.log('Skipping non-REGION line');
    }
  }
  
  console.log('Parsed regions count:', parsedRegions.length);
  return parsedRegions;
}

// Function to test all transport control commands
async function testTransportControls() {
  try {
    console.log('Connecting to Reaper...');
    await reaper.connect();
    console.log('Connected to Reaper');
    
    // First, fetch regions to see if we can get them
    console.log('\n--- Testing Region Fetching ---');
    console.log('Fetching regions from Reaper...');
    const regionList = await reaper.send('/REGION');
    console.log('Received region list from OSC adapter:', regionList);
    
    let regions = [];
    if (regionList && regionList.length > 0) {
      console.log('Region list has content, length:', regionList.length);
      // Parse the region list response
      regions = parseRegionList(regionList);
      console.log('Parsed regions:', JSON.stringify(regions, null, 2));
    } else {
      console.log('Region list is empty or invalid:', regionList);
    }
    
    // Test play/pause toggle
    console.log('\n--- Testing Play/Pause Toggle ---');
    
    // First, get current transport state to determine if we're playing
    console.log('Checking current transport state...');
    const currentState = await reaper.send('/TRANSPORT');
    console.log('Current transport state:', currentState);
    
    // Parse the transport state to determine if we're playing
    const parts = currentState.split('\t');
    const isPlaying = parts.length >= 2 && parseInt(parts[1]) === 1;
    
    if (isPlaying) {
      console.log('Currently playing, sending pause command (ID 1008)...');
      await reaper.send('/1008');
      console.log('Pause command sent');
    } else {
      console.log('Currently paused/stopped, sending play command (ID 1007)...');
      await reaper.send('/1007');
      console.log('Play command sent');
    }
    
    // Wait a bit to let Reaper process the command
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test transport state
    console.log('\n--- Testing Transport State ---');
    console.log('Fetching transport state...');
    const transportState = await reaper.send('/TRANSPORT');
    console.log('Received transport state:', transportState);
    
    // If we have regions, test seeking to a region
    if (regions.length > 0) {
      const firstRegion = regions[0];
      console.log('\n--- Testing Seek to Region ---');
      console.log(`Seeking to region "${firstRegion.name}" (ID: ${firstRegion.id}) at position ${firstRegion.start}...`);
      await reaper.send(`/SET/POS/${firstRegion.start}`);
      console.log('Seek command sent');
      
      // Wait a bit to let Reaper process the command
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Test next region
      if (regions.length > 1) {
        const secondRegion = regions[1];
        console.log('\n--- Testing Next Region ---');
        console.log(`Seeking to next region "${secondRegion.name}" (ID: ${secondRegion.id}) at position ${secondRegion.start}...`);
        await reaper.send(`/SET/POS/${secondRegion.start}`);
        console.log('Next region command sent');
        
        // Wait a bit to let Reaper process the command
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Test previous region
        console.log('\n--- Testing Previous Region ---');
        console.log(`Seeking back to region "${firstRegion.name}" (ID: ${firstRegion.id}) at position ${firstRegion.start}...`);
        await reaper.send(`/SET/POS/${firstRegion.start}`);
        console.log('Previous region command sent');
      } else {
        console.log('Not enough regions to test next/previous region commands');
      }
    } else {
      console.log('No regions available to test region-specific commands');
    }
    
    // Test direct OSC message to get regions
    console.log('\n--- Testing Direct OSC Message for Regions ---');
    console.log('Creating and sending direct OSC message for regions...');
    
    // Create a direct OSC message to get regions
    const message = new (require('reaper-osc')).OscMessage('/REGION', []);
    reaper.reaper.sendOscMessage(message);
    console.log('Direct OSC message sent');
    
    // Wait for a response
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    console.error('Error in test script:', error);
    console.error('Error details:', error.stack);
  } finally {
    // Exit the process after testing
    process.exit(0);
  }
}

// Run the tests
testTransportControls();