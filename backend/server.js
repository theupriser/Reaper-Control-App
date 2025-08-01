const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Web } = require('./adapters/reaper-web-adapter');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Configure Web connection to Reaper
const reaper = new Web({
  host: process.env.REAPER_HOST || '127.0.0.1',
  webPort: parseInt(process.env.REAPER_WEB_PORT || '8080')
});

// Store for regions and current state
let regions = [];
let currentRegion = null;
let playbackState = {
  isPlaying: false,
  currentPosition: 0,
  currentRegionId: null
};

// Initialize connection to Reaper
reaper.connect().then(() => {
  console.log('Connected to Reaper');
  // Get initial regions
  fetchRegions();
  // Start polling for transport state
  startPolling();
}).catch(err => {
  console.error('Failed to connect to Reaper:', err);
});

// Function to fetch all regions from Reaper
async function fetchRegions() {
  try {
    console.log('Fetching regions from Reaper...');
    // Get all regions using the REGION command
    const regionList = await reaper.send('/REGION');
    
    console.log('Received region list from Web adapter:', regionList);
    
    if (regionList && regionList.length > 0) {
      console.log('Region list has content, length:', regionList.length);
      // Parse the region list response
      regions = parseRegionList(regionList);
      console.log('Parsed regions:', JSON.stringify(regions, null, 2));
      
      // Broadcast updated regions to all connected clients
      io.emit('regions', regions);
      console.log(`Fetched and emitted ${regions.length} regions to all clients`);
    } else {
      console.log('Region list is empty or invalid:', regionList);
      
      // Even if no regions were found, emit an empty array with a status message
      io.emit('regions', []);
      io.emit('status', {
        type: 'warning',
        message: 'No regions found in Reaper. Please check if Reaper is running and has regions defined.',
        details: 'Make sure Reaper is running, the web interface is enabled on port 8080, and regions are defined in your project.'
      });
      console.log('Emitted empty regions array and status message to all clients');
    }
  } catch (error) {
    console.error('Error fetching regions:', error);
    console.error('Error details:', error.stack);
    
    // Emit error status to clients
    io.emit('status', {
      type: 'error',
      message: 'Error communicating with Reaper',
      details: error.message
    });
  }
}

// Function to parse region list response
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

// Function to poll transport state
async function startPolling() {
  setInterval(async () => {
    try {
      // Get transport state
      const transportState = await reaper.send('/TRANSPORT');
      if (transportState) {
        updatePlaybackState(transportState);
      }
    } catch (error) {
      console.error('Error polling transport state:', error);
    }
  }, 500); // Poll every 500ms
}

// Function to update playback state
function updatePlaybackState(transportResponse) {
  const parts = transportResponse.split('\t');
  if (parts.length >= 3) {
    const playstate = parseInt(parts[1]);
    const position = parseFloat(parts[2]);
    
    playbackState.isPlaying = playstate === 1;
    playbackState.currentPosition = position;
    
    // Find current region based on position
    const currentRegion = findCurrentRegion(position);
    if (currentRegion) {
      playbackState.currentRegionId = currentRegion.id;
    } else {
      playbackState.currentRegionId = null;
    }
    
    // Broadcast updated state to all connected clients
    io.emit('playbackState', playbackState);
  }
}

// Function to find the current region based on position
function findCurrentRegion(position) {
  return regions.find(region => 
    position >= region.start && position <= region.end
  );
}

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  console.log('Current regions count at connection time:', regions.length);
  
  // Send initial data to the newly connected client
  console.log('Sending initial regions to client:', socket.id);
  socket.emit('regions', regions);
  console.log('Sending initial playback state to client:', socket.id);
  socket.emit('playbackState', playbackState);
  
  // Log all socket events for debugging
  const originalOn = socket.on;
  socket.on = function(event, handler) {
    if (event !== 'disconnect') {
      const wrappedHandler = function(...args) {
        console.log(`Socket ${socket.id} received event: ${event}`, args);
        return handler.apply(this, args);
      };
      return originalOn.call(this, event, wrappedHandler);
    } else {
      return originalOn.call(this, event, handler);
    }
  };
  
  // Handle play/pause toggle
  socket.on('togglePlay', async () => {
    try {
      console.log('Client requested play/pause toggle');
      // Send play or pause command based on current state
      if (playbackState.isPlaying) {
        // If currently playing, send pause command (ID 1008)
        console.log('Currently playing, sending pause command (ID 1008)');
        await reaper.send('/1008');
      } else {
        // If currently paused/stopped, send play command (ID 1007)
        console.log('Currently paused/stopped, sending play command (ID 1007)');
        await reaper.send('/1007');
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
    }
  });
  
  // Handle seek to position
  socket.on('seekToPosition', async (position) => {
    try {
      // Set position in seconds
      await reaper.send(`/SET/POS/${position}`);
    } catch (error) {
      console.error('Error seeking to position:', error);
    }
  });
  
  // Handle seek to region
  socket.on('seekToRegion', async (regionId) => {
    try {
      const region = regions.find(r => r.id === regionId);
      if (region) {
        // Set position to start of region
        await reaper.send(`/SET/POS/${region.start}`);
      }
    } catch (error) {
      console.error('Error seeking to region:', error);
    }
  });
  
  // Handle seek to beginning of current region
  socket.on('seekToCurrentRegionStart', async () => {
    try {
      if (playbackState.currentRegionId) {
        const region = regions.find(r => r.id === playbackState.currentRegionId);
        if (region) {
          // Set position to start of current region
          await reaper.send(`/SET/POS/${region.start}`);
        }
      }
    } catch (error) {
      console.error('Error seeking to current region start:', error);
    }
  });
  
  // Handle next region
  socket.on('nextRegion', async () => {
    try {
      if (playbackState.currentRegionId) {
        const currentIndex = regions.findIndex(r => r.id === playbackState.currentRegionId);
        if (currentIndex >= 0 && currentIndex < regions.length - 1) {
          const nextRegion = regions[currentIndex + 1];
          // Set position to start of next region
          await reaper.send(`/SET/POS/${nextRegion.start}`);
        }
      }
    } catch (error) {
      console.error('Error going to next region:', error);
    }
  });
  
  // Handle previous region
  socket.on('previousRegion', async () => {
    try {
      if (playbackState.currentRegionId) {
        const currentIndex = regions.findIndex(r => r.id === playbackState.currentRegionId);
        if (currentIndex > 0) {
          const prevRegion = regions[currentIndex - 1];
          // Set position to start of previous region
          await reaper.send(`/SET/POS/${prevRegion.start}`);
        }
      }
    } catch (error) {
      console.error('Error going to previous region:', error);
    }
  });
  
  // Handle refresh regions
  socket.on('refreshRegions', async () => {
    await fetchRegions();
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// API endpoint to get all regions
app.get('/api/regions', (req, res) => {
  res.json(regions);
});

// API endpoint to get current playback state
app.get('/api/playback', (req, res) => {
  res.json(playbackState);
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});