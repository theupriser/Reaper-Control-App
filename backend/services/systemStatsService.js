/**
 * System Stats Service
 * Provides application-specific CPU and memory usage information
 */

const si = require('systeminformation');
const logger = require('../utils/logger');
const os = require('os');

// Store previous CPU usage for calculating CPU percentage
let prevCpuUsage = process.cpuUsage();
let prevTimestamp = Date.now();

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
 * Get current application-specific stats (CPU and memory usage)
 * Uses cache if data is fresh enough
 */
async function getStats() {
  const now = Date.now();
  
  // Return cached data if it's fresh enough
  if (now - statsCache.lastUpdated < UPDATE_INTERVAL) {
    return statsCache;
  }
  
  try {
    // Get application CPU usage
    const currentCpuUsage = process.cpuUsage();
    const elapsedTime = now - prevTimestamp;
    
    // Calculate CPU usage percentage
    // (user + system) time divided by elapsed time, multiplied by 100 for percentage
    // Divided by number of cores to get per-core percentage (max 100%)
    const userDiff = currentCpuUsage.user - prevCpuUsage.user;
    const systemDiff = currentCpuUsage.system - prevCpuUsage.system;
    const totalCpuTime = userDiff + systemDiff;
    
    // Convert microseconds to milliseconds and calculate percentage
    const cpuPercent = Math.min(100, Math.round((totalCpuTime / 1000) / elapsedTime * 100));
    
    // Store current values for next calculation
    prevCpuUsage = currentCpuUsage;
    prevTimestamp = now;
    
    // Get application memory usage
    const memoryUsage = process.memoryUsage();
    
    // Get system memory for context
    const totalMem = os.totalmem();
    
    // Update cache
    statsCache = {
      cpu: {
        usage: cpuPercent,
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
    logger.error('Error getting application stats:', error);
    return statsCache;
  }
}

module.exports = {
  getStats
};