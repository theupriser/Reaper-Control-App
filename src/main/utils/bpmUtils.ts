/**
 * BPM Utilities
 * Provides functions for BPM calculation and management
 */

import logger from './logger';
import { Marker, Region } from '../types';

/**
 * BPM calculation class that maintains beat positions and calculates BPM
 */
class BpmCalculator {
  private beatPositions: Array<{
    positionSeconds: number;
    beatPosition: number;
    timestamp: number;
  }> = [];
  private initialBpm: number | null = null;

  /**
   * Reset the beat positions array
   * This should be called when the region changes or when the tempo changes significantly
   * @param initialBpm - Optional initial BPM to use (from !bpm marker)
   */
  public resetBeatPositions(initialBpm: number | null = null): void {
    logger.debug('Resetting beat positions', { initialBpm });

    if (initialBpm !== null && initialBpm > 0) {
      this.initialBpm = initialBpm;
    } else {
      this.initialBpm = null;
    }

    this.beatPositions = [];
  }

  /**
   * Add a beat position for BPM calculation
   * @param positionSeconds - Position in seconds
   * @param beatPosition - Beat position
   */
  public addBeatPosition(positionSeconds: number, beatPosition: number): void {
    const timestamp = Date.now();

    // Store the current beat position with timestamp
    this.beatPositions.push({
      positionSeconds,
      beatPosition,
      timestamp
    });

    // Keep only the latest 2 beat positions
    if (this.beatPositions.length > 2) {
      this.beatPositions = this.beatPositions.slice(-2);
    }
  }

  /**
   * Calculate BPM from stored beat positions
   * @param defaultBpm - Default BPM to use if calculation fails
   * @returns Calculated BPM
   */
  public calculateBPM(defaultBpm: number = 120): number {
    try {
      // If we have at least 2 beat positions, calculate BPM based on the difference
      if (this.beatPositions.length >= 2) {
        // Get the oldest and newest beat positions
        const oldest = this.beatPositions[0];
        const newest = this.beatPositions[this.beatPositions.length - 1];

        // Calculate the difference in beat position and seconds
        const beatDiff = newest.beatPosition - oldest.beatPosition;
        const secondsDiff = newest.positionSeconds - oldest.positionSeconds;

        // Calculate BPM: (beats / seconds) * 60
        const bpm = (beatDiff / secondsDiff) * 60;

        // Round to 2 decimal places
        const roundedBpm = Math.round(bpm * 100) / 100;

        // Check if the calculated BPM is valid
        if (isNaN(roundedBpm) || !isFinite(roundedBpm) || roundedBpm > 999 || roundedBpm <= 0) {
          // If we have an initial BPM from a marker, use that
          if (this.initialBpm !== null && this.initialBpm > 0) {
            logger.debug(`Calculated BPM is invalid (${roundedBpm}), using initial BPM: ${this.initialBpm}`);
            return this.initialBpm;
          }

          // Otherwise use default BPM
          logger.debug(`Calculated BPM is invalid (${roundedBpm}), using default BPM: ${defaultBpm}`);
          return defaultBpm;
        }

        logger.debug(`Calculated BPM from ${this.beatPositions.length} beat positions: ${roundedBpm}`);
        return roundedBpm;
      }
      // If we only have one beat position
      else if (this.beatPositions.length === 1) {
        // If we have an initial BPM from a marker, use that
        if (this.initialBpm !== null && this.initialBpm > 0) {
          logger.debug(`Using initial BPM from marker: ${this.initialBpm}`);
          return this.initialBpm;
        }

        // Otherwise calculate BPM using the traditional method
        const position = this.beatPositions[0];
        const bpm = (position.beatPosition / position.positionSeconds) * 60;
        const roundedBpm = Math.round(bpm * 100) / 100;

        // Check if the calculated BPM is valid
        if (isNaN(roundedBpm) || !isFinite(roundedBpm) || roundedBpm > 999 || roundedBpm <= 0) {
          logger.debug(`Calculated BPM from single beat position is invalid (${roundedBpm}), using default BPM: ${defaultBpm}`);
          return defaultBpm;
        }

        logger.debug(`Calculated BPM from single beat position: ${roundedBpm}`);
        return roundedBpm;
      }
      // No beat positions available
      else {
        // If we have an initial BPM from a marker, use that
        if (this.initialBpm !== null && this.initialBpm > 0) {
          logger.debug(`No beat positions available, using initial BPM: ${this.initialBpm}`);
          return this.initialBpm;
        }

        // Otherwise use default BPM
        logger.debug(`No beat positions available, using default BPM: ${defaultBpm}`);
        return defaultBpm;
      }
    } catch (error) {
      logger.error('Error calculating BPM:', { error });

      // If we have an initial BPM from a marker, use that
      if (this.initialBpm !== null && this.initialBpm > 0) {
        return this.initialBpm;
      }

      // Return default BPM in case of error
      return defaultBpm;
    }
  }
}

/**
 * Extract BPM from a marker name
 * @param name - Marker name
 * @returns BPM value or null if not a BPM marker
 */
export function extractBpmFromMarker(name: string): number | null {
  const bpmMatch = name.match(/!bpm:(\d+(\.\d+)?)/);
  return bpmMatch ? parseFloat(bpmMatch[1]) : null;
}

/**
 * Get the BPM for a region if a !bpm marker is present
 * @param region - Region object
 * @param markers - Array of markers
 * @returns BPM value or null if no !bpm marker
 */
export function getBpmForRegion(region: Region, markers: Marker[]): number | null {
  if (!region || !markers || markers.length === 0) return null;

  // Find markers that are within the region
  const regionMarkers = markers.filter(marker =>
    marker.position >= region.start &&
    marker.position <= region.end
  );

  // Check each marker for !bpm tag
  for (const marker of regionMarkers) {
    const bpm = extractBpmFromMarker(marker.name);
    if (bpm !== null) {
      return bpm;
    }
  }

  return null;
}

// Create and export a singleton instance of the BPM calculator
export const bpmCalculator = new BpmCalculator();
