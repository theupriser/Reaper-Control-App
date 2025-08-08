/**
 * Marker Model
 * Represents a marker in Reaper
 */

class Marker {
  /**
   * Create a new Marker
   * @param {Object} data - Marker data
   * @param {number} data.id - Marker ID
   * @param {string} data.name - Marker name
   * @param {number} data.position - Marker position in seconds
   * @param {string} data.color - Marker color (hex code)
   */
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.position = data.position;
    this.color = data.color || '#FF0000'; // Default to red if no color specified
  }

  /**
   * Convert to JSON-friendly object
   * @returns {Object} JSON-friendly object
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      position: this.position,
      color: this.color
    };
  }
}

module.exports = Marker;