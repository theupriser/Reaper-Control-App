/**
 * Region Model
 * Represents a region in Reaper
 */

class Region {
  /**
   * Create a new Region
   * @param {Object} data - Region data
   * @param {number} data.id - Region ID
   * @param {string} data.name - Region name
   * @param {number} data.start - Start position in seconds
   * @param {number} data.end - End position in seconds
   * @param {string|null} data.color - Region color (if available)
   */
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.start = data.start;
    this.end = data.end;
    this.color = data.color || null;
  }

  /**
   * Check if a position is within this region
   * @param {number} position - Position in seconds
   * @returns {boolean} True if position is within region
   */
  containsPosition(position) {
    // If position is exactly at start, it's in this region
    if (position === this.start) {
      return true;
    }
    
    // Otherwise check if position is between start and end (inclusive of end)
    return position > this.start && position <= this.end;
  }

  /**
   * Get the duration of the region
   * @returns {number} Duration in seconds
   */
  get duration() {
    return this.end - this.start;
  }

  /**
   * Convert to a plain object for serialization
   * @returns {Object} Plain object representation
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      start: this.start,
      end: this.end,
      color: this.color,
      duration: this.duration
    };
  }
}

module.exports = Region;