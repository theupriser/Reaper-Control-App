/**
 * Setlist Model
 * Represents a setlist containing regions from a Reaper project
 */

class Setlist {
  /**
   * Create a new Setlist
   * @param {Object} data - Setlist data
   * @param {string} data.id - Setlist ID (optional, will be generated if not provided)
   * @param {string} data.name - Setlist name
   * @param {string} data.projectId - Project ID this setlist belongs to
   * @param {Array} data.items - Array of setlist items (regions)
   * @param {Date} data.createdAt - Creation date (optional)
   * @param {Date} data.updatedAt - Last update date (optional)
   */
  constructor(data) {
    this.id = data.id || this.generateId();
    this.name = data.name;
    this.projectId = data.projectId;
    this.items = Array.isArray(data.items) ? data.items : [];
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
  }

  /**
   * Generate a unique ID for the setlist
   * @returns {string} A unique ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Add an item to the setlist
   * @param {Object} item - Setlist item to add
   * @param {number} item.regionId - ID of the region
   * @param {string} item.name - Name of the region (for display)
   * @param {number} item.position - Position in the setlist (optional)
   * @returns {Object} The added item or existing item if the region is already in the setlist
   */
  addItem(item) {
    // Check if an item with the same regionId already exists
    const existingItem = this.items.find(i => i.regionId === item.regionId);
    if (existingItem) {
      // Return the existing item without modifying the setlist
      return existingItem;
    }
    
    // Ensure the item has a unique ID
    const newItem = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      regionId: item.regionId,
      name: item.name,
      position: item.position !== undefined ? item.position : this.items.length
    };
    
    this.items.push(newItem);
    this.updatedAt = new Date();
    
    return newItem;
  }

  /**
   * Remove an item from the setlist
   * @param {string} itemId - ID of the item to remove
   * @returns {boolean} True if the item was removed, false otherwise
   */
  removeItem(itemId) {
    const initialLength = this.items.length;
    this.items = this.items.filter(item => item.id !== itemId);
    
    // Update positions after removal
    this.items.forEach((item, index) => {
      item.position = index;
    });
    
    this.updatedAt = new Date();
    
    return this.items.length < initialLength;
  }

  /**
   * Move an item to a new position in the setlist
   * @param {string} itemId - ID of the item to move
   * @param {number} newPosition - New position for the item
   * @returns {boolean} True if the item was moved, false otherwise
   */
  moveItem(itemId, newPosition) {
    // Find the item
    const itemIndex = this.items.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return false;
    
    // Ensure the new position is valid
    if (newPosition < 0) newPosition = 0;
    if (newPosition >= this.items.length) newPosition = this.items.length - 1;
    
    // Move the item
    const [item] = this.items.splice(itemIndex, 1);
    this.items.splice(newPosition, 0, item);
    
    // Update positions
    this.items.forEach((item, index) => {
      item.position = index;
    });
    
    this.updatedAt = new Date();
    
    return true;
  }

  /**
   * Update the setlist properties
   * @param {Object} data - New setlist data
   * @param {string} data.name - New setlist name
   * @returns {boolean} True if the setlist was updated, false otherwise
   */
  update(data) {
    if (data.name !== undefined) {
      this.name = data.name;
      this.updatedAt = new Date();
      return true;
    }
    return false;
  }

  /**
   * Convert to a plain object for serialization
   * @returns {Object} Plain object representation
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      projectId: this.projectId,
      items: this.items,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString()
    };
  }
}

module.exports = Setlist;