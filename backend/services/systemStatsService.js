/**
 * System Stats Service
 * Provides system-wide CPU and application-specific memory usage information
 */

const si = require('systeminformation');
const logger = require('../utils/logger');
const os = require('os');

// Cache for stats to avoid too frequent updates
let statsCache = {
  cpu: {
    usage: 0,
    cores: os.cpus().length,
    speed: os.cpus()[0].speed / 1000 // Convert MHz to GHz
  },
  memory: {
    total: 0,
    used: 0,
    free: 0,
    usedPercent: 0
  },
  lastUpdated: 0
};

// Update interval in milliseconds (2 seconds)
const UPDATE_INTERVAL = 2000;

/**
 * Get current system-wide CPU and application-specific memory usage stats
 * Uses cache if data is fresh enough
 */
async function getStats() {
  const now = Date.now();
  
  try {
    // Always get current system CPU usage for accurate tracking
    const cpuLoad = await si.currentLoad();
    const totalCpuPercent = Math.round(cpuLoad.currentLoad);
    
    // Return cached data if it's fresh enough, but update the CPU usage
    if (now - statsCache.lastUpdated < UPDATE_INTERVAL) {
      // Update only the CPU usage in the cache
      statsCache.cpu.usage = totalCpuPercent;
      return statsCache;
    }
    
    // Get application memory usage
    const memoryUsage = process.memoryUsage();
    
    // Get system memory for context
    const totalMem = os.totalmem();
    
    // Update cache
    statsCache = {
      cpu: {
        usage: totalCpuPercent,
        cores: os.cpus().length,
        speed: os.cpus()[0].speed / 1000 // Convert MHz to GHz
      },
      memory: {
        total: totalMem,
        used: memoryUsage.rss, // Resident Set Size - total memory allocated for the process
        free: totalMem - memoryUsage.rss,
        usedPercent: Math.round((memoryUsage.rss / totalMem) * 100),
        heapTotal: memoryUsage.heapTotal, // Total size of allocated heap
        heapUsed: memoryUsage.heapUsed,   // Actually used heap
        external: memoryUsage.external    // Memory used by C++ objects bound to JavaScript
      },
      lastUpdated: now
    };
    
    return statsCache;
  } catch (error) {
    logger.error('Error getting system stats:', error);
    return statsCache;
  }
}

module.exports = {
  getStats
};