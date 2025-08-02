/**
 * API Routes
 * Defines all HTTP API endpoints for the application
 */

const express = require('express');
const regionService = require('../services/regionService');
const setlistService = require('../services/setlistService');
const logger = require('../utils/logger');

// Create a router
const router = express.Router();

/**
 * GET /api/regions
 * Returns all regions
 */
router.get('/regions', (req, res) => {
  try {
    const regions = regionService.getRegions();
    res.json(regions);
  } catch (error) {
    logger.error('Error getting regions:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/playback
 * Returns current playback state
 */
router.get('/playback', (req, res) => {
  try {
    const playbackState = regionService.getPlaybackState();
    res.json(playbackState);
  } catch (error) {
    logger.error('Error getting playback state:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * POST /api/regions/refresh
 * Refreshes the regions from Reaper
 */
router.post('/regions/refresh', async (req, res) => {
  try {
    await regionService.fetchRegions();
    res.json({
      success: true,
      message: 'Regions refreshed successfully',
      regions: regionService.getRegions()
    });
  } catch (error) {
    logger.error('Error refreshing regions:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/regions/current
 * Returns the current region based on playback position
 */
router.get('/regions/current', (req, res) => {
  try {
    const currentRegion = regionService.getCurrentRegion();
    if (currentRegion) {
      res.json(currentRegion);
    } else {
      res.status(404).json({
        error: 'Not found',
        message: 'No current region'
      });
    }
  } catch (error) {
    logger.error('Error getting current region:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/regions/:id
 * Returns a specific region by ID
 */
router.get('/regions/:id', (req, res) => {
  try {
    const regionId = parseInt(req.params.id);
    const region = regionService.findRegionById(regionId);
    
    if (region) {
      res.json(region);
    } else {
      res.status(404).json({
        error: 'Not found',
        message: `Region with ID ${regionId} not found`
      });
    }
  } catch (error) {
    logger.error('Error getting region by ID:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/setlists
 * Returns all setlists for the current project
 */
router.get('/setlists', (req, res) => {
  try {
    const setlists = setlistService.getSetlists();
    res.json(setlists);
  } catch (error) {
    logger.error('Error getting setlists:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/setlists/:id
 * Returns a specific setlist by ID
 */
router.get('/setlists/:id', (req, res) => {
  try {
    const setlistId = req.params.id;
    const setlist = setlistService.getSetlist(setlistId);
    
    if (setlist) {
      res.json(setlist);
    } else {
      res.status(404).json({
        error: 'Not found',
        message: `Setlist with ID ${setlistId} not found`
      });
    }
  } catch (error) {
    logger.error('Error getting setlist by ID:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * POST /api/setlists
 * Creates a new setlist
 */
router.post('/setlists', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Setlist name is required'
      });
    }
    
    // Check if project ID is available
    const projectId = require('../services/projectService').getProjectId();
    if (!projectId) {
      logger.error('Error creating setlist: No project ID available');
      return res.status(400).json({
        error: 'Bad request',
        message: 'No project ID available. Please ensure Reaper is running and a project is loaded.'
      });
    }
    
    const setlist = await setlistService.createSetlist({ name });
    
    res.status(201).json(setlist);
  } catch (error) {
    logger.error('Error creating setlist:', error);
    
    // Provide more specific error messages based on the error
    if (error.message.includes('No project ID available')) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'No project ID available. Please ensure Reaper is running and a project is loaded.'
      });
    }
    
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * PUT /api/setlists/:id
 * Updates a setlist
 */
router.put('/setlists/:id', async (req, res) => {
  try {
    const setlistId = req.params.id;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Setlist name is required'
      });
    }
    
    const setlist = await setlistService.updateSetlist(setlistId, { name });
    
    if (setlist) {
      res.json(setlist);
    } else {
      res.status(404).json({
        error: 'Not found',
        message: `Setlist with ID ${setlistId} not found`
      });
    }
  } catch (error) {
    logger.error('Error updating setlist:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * DELETE /api/setlists/:id
 * Deletes a setlist
 */
router.delete('/setlists/:id', async (req, res) => {
  try {
    const setlistId = req.params.id;
    const deleted = await setlistService.deleteSetlist(setlistId);
    
    if (deleted) {
      res.status(204).end();
    } else {
      res.status(404).json({
        error: 'Not found',
        message: `Setlist with ID ${setlistId} not found`
      });
    }
  } catch (error) {
    logger.error('Error deleting setlist:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * POST /api/setlists/:id/items
 * Adds an item to a setlist
 */
router.post('/setlists/:id/items', async (req, res) => {
  try {
    const setlistId = req.params.id;
    const { regionId, position } = req.body;
    
    if (regionId === undefined) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Region ID is required'
      });
    }
    
    const item = await setlistService.addSetlistItem(setlistId, { regionId, position });
    
    if (item) {
      res.status(201).json(item);
    } else {
      res.status(404).json({
        error: 'Not found',
        message: `Setlist with ID ${setlistId} not found`
      });
    }
  } catch (error) {
    logger.error('Error adding setlist item:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * DELETE /api/setlists/:id/items/:itemId
 * Removes an item from a setlist
 */
router.delete('/setlists/:id/items/:itemId', async (req, res) => {
  try {
    const setlistId = req.params.id;
    const itemId = req.params.itemId;
    
    const removed = await setlistService.removeSetlistItem(setlistId, itemId);
    
    if (removed) {
      res.status(204).end();
    } else {
      res.status(404).json({
        error: 'Not found',
        message: `Setlist item not found`
      });
    }
  } catch (error) {
    logger.error('Error removing setlist item:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * PUT /api/setlists/:id/items/:itemId/move
 * Moves an item within a setlist
 */
router.put('/setlists/:id/items/:itemId/move', async (req, res) => {
  try {
    const setlistId = req.params.id;
    const itemId = req.params.itemId;
    const { position } = req.body;
    
    if (position === undefined) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Position is required'
      });
    }
    
    const moved = await setlistService.moveSetlistItem(setlistId, itemId, position);
    
    if (moved) {
      const setlist = setlistService.getSetlist(setlistId);
      res.json(setlist);
    } else {
      res.status(404).json({
        error: 'Not found',
        message: `Setlist item not found`
      });
    }
  } catch (error) {
    logger.error('Error moving setlist item:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

module.exports = router;