// ==========================================
// DRRACS - Disaster Incident Routes
// (routes/disaster.routes.js)
// ==========================================

const express = require('express');
const router = express.Router();
const disasterController = require('../controllers/disaster.controller');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

// Authenticated operational and citizen endpoints
router.get('/', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Shelter_Manager']), disasterController.getAllDisasters);
router.get('/track/:ticket', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Citizen']), disasterController.trackCitizenReport);
router.get('/:id', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Shelter_Manager']), disasterController.getDisasterById);
router.post('/citizen-report', verifyToken, checkRole(['Citizen']), disasterController.reportFromCitizen);

// Protected Operations
router.post('/', verifyToken, checkRole(['Admin']), disasterController.createDisaster);
router.put('/:id', verifyToken, checkRole(['Admin', 'Relief_Officer']), disasterController.updateDisaster);
router.delete('/:id', verifyToken, checkRole(['Admin']), disasterController.deleteDisaster);

module.exports = router;

