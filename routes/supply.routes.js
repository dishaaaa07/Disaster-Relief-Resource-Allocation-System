// ==========================================
// DRRACS - Supply Catalog Routes
// (routes/supply.routes.js)
// ==========================================

const express = require('express');
const router = express.Router();
const supplyController = require('../controllers/supply.controller');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

router.get('/', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Shelter_Manager']), supplyController.getAllSupplies);
router.get('/:id', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Shelter_Manager']), supplyController.getSupplyById);

// Protected mutation endpoints
router.post('/', verifyToken, checkRole(['Admin', 'Relief_Officer']), supplyController.createSupply);
router.put('/:id', verifyToken, checkRole(['Admin', 'Relief_Officer']), supplyController.updateSupply);
router.delete('/:id', verifyToken, checkRole(['Admin']), supplyController.deleteSupply);

module.exports = router;

