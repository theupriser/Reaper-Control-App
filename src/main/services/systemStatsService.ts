import { BrowserWindow } from 'electron';
import si from 'systeminformation';
import process from 'process';
import logger from '../utils/logger';
import { ReaperConnector } from './reaperConnector';
import { LatencyStats } from '../types';

/**
 * Service for monitoring system statistics including CPU and memory usage
 * Uses real data from the systeminformation package
 */
export class SystemStatsService {
  private interval: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;
  private updateIntervalMs: number = 2000;
  private reaperConnector: ReaperConnector | null = null;
  private lastLatencyMs: number | undefined;

  /**
   * Create a new SystemStatsService
   * @param mainWindow - The main Electron browser window
   * @param updateIntervalMs - Optional interval in milliseconds for updates (default: 2000ms)
   */
  constructor(mainWindow: BrowserWindow, updateIntervalMs: number = 2000, reaperConnector?: ReaperConnector) {
    this.mainWindow = mainWindow;
    this.updateIntervalMs = updateIntervalMs;
    this.reaperConnector = reaperConnector ?? null;

    // If a connector is provided, subscribe to latency updates
    if (this.reaperConnector) {
      try {
        this.reaperConnector.on('latencyUpdate', (stats: LatencyStats) => {
          // Prefer p95 if available, else avg, else last
          const p95 = stats?.p95;
          const avg = stats?.avg;
          const last = stats?.last;
          this.lastLatencyMs = typeof p95 === 'number' ? p95 : (typeof avg === 'number' ? avg : (typeof last === 'number' ? last : undefined));
        });
      } catch (e) {
        logger.warn('Failed to subscribe to reaperConnector latencyUpdate', { error: e });
      }
    }
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
          network: {
            connected: this.reaperConnector ? this.reaperConnector.isConnected() : false,
            latency: this.lastLatencyMs
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
