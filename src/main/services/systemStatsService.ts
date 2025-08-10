import { BrowserWindow } from 'electron';
import si from 'systeminformation';
import process from 'process';
import logger from '../utils/logger';

/**
 * Service for monitoring system statistics including CPU and memory usage
 * Uses real data from the systeminformation package
 */
export class SystemStatsService {
  private interval: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;
  private updateIntervalMs: number = 2000;

  /**
   * Create a new SystemStatsService
   * @param mainWindow - The main Electron browser window
   * @param updateIntervalMs - Optional interval in milliseconds for updates (default: 2000ms)
   */
  constructor(mainWindow: BrowserWindow, updateIntervalMs: number = 2000) {
    this.mainWindow = mainWindow;
    this.updateIntervalMs = updateIntervalMs;
    logger.info('SystemStatsService initialized');
  }

  /**
   * Start monitoring system stats and sending updates to the renderer process
   */
  public start(): void {
    // Clear any existing interval
    this.stop();

    // Start a new interval
    this.interval = setInterval(async () => {
      try {
        if (!this.mainWindow) return;

        // Get real CPU information using systeminformation
        const cpuLoad = await si.currentLoad();
        const cpuInfo = await si.cpu();
        const cpuSpeed = await si.cpuCurrentSpeed();

        // Get Node.js process memory usage and system memory information
        const nodeMemory = process.memoryUsage();
        const memInfo = await si.mem();

        const stats = {
          cpu: {
            usage: Math.round(cpuLoad.currentLoad), // Real CPU usage percentage
            cores: cpuInfo.cores,
            speed: Math.round(cpuSpeed.avg * 10) / 10 // Current average CPU speed in GHz
          },
          memory: {
            // Report Node.js process memory (rss) over system total memory
            total: memInfo.total, // Total system memory
            used: nodeMemory.rss, // Resident Set Size - total memory allocated for the Node.js process
            free: memInfo.total - nodeMemory.rss,
            usedPercent: Math.round((nodeMemory.rss / memInfo.total) * 100),
            rss: nodeMemory.rss // Resident Set Size - total memory allocated for the process
          },
          lastUpdated: Date.now()
        };

        // Send stats to the renderer process
        this.mainWindow.webContents.send('system-stats', stats);
      } catch (error) {
        logger.error('Error collecting system stats', { error });
      }
    }, this.updateIntervalMs);

    logger.info('SystemStatsService started');
  }

  /**
   * Stop monitoring system stats
   */
  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('SystemStatsService stopped');
    }
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    this.stop();
    this.mainWindow = null;
    logger.info('SystemStatsService cleaned up');
  }
}
