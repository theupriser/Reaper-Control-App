/**
 * Test script to simulate fetching regions from Reaper
 * This script will help diagnose issues with the region fetching process
 */

const { OSC } = require('./adapters/reaper-osc-adapter');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create OSC instance
const reaper = new OSC({
  host: process.env.REAPER_HOST || '127.0.0.1',
  port: parseInt(process.env.REAPER_PORT || '8000'),
  localPort: 9001  // Use a different port to avoid conflicts
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

// Function to fetch regions and test other commands
async function fetchRegions() {
  try {
    console.log('Connecting to Reaper...');
    await reaper.connect();
    console.log('Connected to Reaper');
    
    // First, try to get transport state to test basic communication
    console.log('Fetching transport state from Reaper...');
    const transportState = await reaper.send('/TRANSPORT');
    console.log('Received transport state from OSC adapter:', transportState);
    
    // Now try to get regions
    console.log('Fetching regions from Reaper...');
    const regionList = await reaper.send('/REGION');
    
    console.log('Received region list from OSC adapter:', regionList);
    
    if (regionList && regionList.length > 0) {
      console.log('Region list has content, length:', regionList.length);
      // Parse the region list response
      const regions = parseRegionList(regionList);
      console.log('Parsed regions:', JSON.stringify(regions, null, 2));
      console.log(`Fetched ${regions.length} regions`);
    } else {
      console.log('Region list is empty or invalid:', regionList);
      console.log('This could be because:');
      console.log('1. No regions are defined in the current Reaper project');
      console.log('2. Reaper is not properly configured for OSC communication');
      console.log('3. The OSC adapter is not correctly receiving or processing the response');
    }
    
    // Try to get marker list as another test
    console.log('Fetching markers from Reaper...');
    const markerList = await reaper.send('/MARKER');
    console.log('Received marker list from OSC adapter:', markerList);
    
  } catch (error) {
    console.error('Error in test script:', error);
    console.error('Error details:', error.stack);
  } finally {
    // Exit the process after testing
    process.exit(0);
  }
}

// Run the test
fetchRegions();