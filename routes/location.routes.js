// ==========================================
// DRRACS - Location Routes
// (routes/location.routes.js)
// ==========================================

const express = require('express');
const router = express.Router();
const locationController = require('../controllers/location.controller');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

router.get('/', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Shelter_Manager']), locationController.getAllLocations);
router.get('/:id', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Shelter_Manager']), locationController.getLocationById);

// Protected Operations
router.post('/', verifyToken, checkRole(['Admin', 'Relief_Officer']), locationController.createLocation);
router.put('/:id', verifyToken, checkRole(['Admin', 'Relief_Officer']), locationController.updateLocation);
router.delete('/:id', verifyToken, checkRole(['Admin']), locationController.deleteLocation);

module.exports = router;

