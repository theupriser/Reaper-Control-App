/**
 * API Routes
 * Defines all HTTP API endpoints for the application
 */

const express = require('express');
const regionService = require('../services/regionService');
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

module.exports = router;