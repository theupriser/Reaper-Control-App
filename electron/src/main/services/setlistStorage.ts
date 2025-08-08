/**
 * Setlist Storage Service
 * Manages persistent storage of setlists in JSON files in the user data directory
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { Setlist } from '../types';
import logger from '../utils/logger';

export class SetlistStorage {
  private storagePath: string;

  constructor() {
    // Create a setlists folder in the userData directory
    this.storagePath = path.join(app.getPath('userData'), 'setlists');
    this.ensureStorageDirectory();
  }

  /**
   * Ensure the storage directory exists
   */
  private async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      logger.info('Setlists storage directory ensured', { path: this.storagePath });
    } catch (error) {
      logger.error('Error ensuring setlists storage directory', { error });
      throw error;
    }
  }

  /**
   * Get the file path for a project's setlists
   * @param projectId - Project ID
   * @returns File path
   */
  private getSetlistFilePath(projectId: string): string {
    return path.join(this.storagePath, `${projectId}.json`);
  }

  /**
   * Save setlists for a project
   * @param projectId - Project ID
   * @param setlists - Map of setlists
   * @param selectedSetlistId - ID of the currently selected setlist
   */
  async saveSetlists(projectId: string, setlists: Map<string, Setlist>, selectedSetlistId: string | null): Promise<void> {
    try {
      logger.info(`Saving setlists for project: ${projectId}`);

      if (!projectId) {
        logger.warn('Cannot save setlists: No project ID');
        return;
      }

      // Convert map to array
      const setlistsArray = Array.from(setlists.values());

      // Create data structure that includes both setlists and metadata
      const data = {
        setlists: setlistsArray,
        metadata: {
          selectedSetlistId: selectedSetlistId || null,
          lastUpdated: new Date().toISOString()
        }
      };

      // Write to file
      const filePath = this.getSetlistFilePath(projectId);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');

      logger.info(`Setlists saved to: ${filePath}`, { count: setlistsArray.length });
    } catch (error) {
      logger.error(`Error saving setlists for project ${projectId}`, { error });
      throw error;
    }
  }

  /**
   * Load setlists for a project
   * @param projectId - Project ID
   * @returns Object containing the setlists map and selected setlist ID
   */
  async loadSetlists(projectId: string): Promise<{ setlists: Map<string, Setlist>, selectedSetlistId: string | null }> {
    try {
      logger.info(`Loading setlists for project: ${projectId}`);

      if (!projectId) {
        logger.warn('Cannot load setlists: No project ID');
        return { setlists: new Map(), selectedSetlistId: null };
      }

      const filePath = this.getSetlistFilePath(projectId);
      const setlistsMap = new Map<string, Setlist>();
      let selectedSetlistId: string | null = null;

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        // File doesn't exist
        logger.info(`No setlist file found for project: ${projectId}`);
        return { setlists: setlistsMap, selectedSetlistId: null };
      }

      // Read and parse the file
      const data = await fs.readFile(filePath, 'utf8');
      const parsedData = JSON.parse(data);

      // Handle both data formats: array of setlists or object with setlists and metadata
      const setlistsArray = Array.isArray(parsedData) ? parsedData : (parsedData.setlists || []);

      // Extract metadata if available
      if (!Array.isArray(parsedData) && parsedData.metadata) {
        selectedSetlistId = parsedData.metadata.selectedSetlistId;
      }

      // Create a map of setlists
      for (const setlist of setlistsArray) {
        setlistsMap.set(setlist.id, setlist);
      }

      logger.info(`Loaded ${setlistsMap.size} setlists from file for project: ${projectId}`);
      return { setlists: setlistsMap, selectedSetlistId };
    } catch (error) {
      logger.error(`Error loading setlists for project ${projectId}`, { error });
      return { setlists: new Map(), selectedSetlistId: null };
    }
  }

  /**
   * Delete a project's setlist file
   * @param projectId - Project ID
   */
  async deleteSetlistFile(projectId: string): Promise<void> {
    try {
      if (!projectId) {
        logger.warn('Cannot delete setlist file: No project ID');
        return;
      }

      const filePath = this.getSetlistFilePath(projectId);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        // File doesn't exist
        logger.info(`No setlist file found to delete for project: ${projectId}`);
        return;
      }

      // Delete the file
      await fs.unlink(filePath);
      logger.info(`Deleted setlist file for project: ${projectId}`);
    } catch (error) {
      logger.error(`Error deleting setlist file for project ${projectId}`, { error });
      throw error;
    }
  }
}
