// ==========================================
// DRRACS - Shelter Routes
// (routes/shelter.routes.js)
// ==========================================

const express = require('express');
const router = express.Router();
const shelterController = require('../controllers/shelter.controller');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

// Shelter details support public evacuation planning for authenticated users.
router.get('/', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Shelter_Manager', 'Citizen']), shelterController.getAllShelters);
router.get('/:id', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Shelter_Manager', 'Citizen']), shelterController.getShelterById);

// Protected mutation endpoints
router.post('/', verifyToken, checkRole(['Admin', 'Relief_Officer']), shelterController.createShelter);
router.put('/:id', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Shelter_Manager']), shelterController.updateShelter);
router.delete('/:id', verifyToken, checkRole(['Admin']), shelterController.deleteShelter);

module.exports = router;

