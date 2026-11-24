// ==========================================
// DRRACS - Shipment & Logistics Routes
// (routes/shipment.routes.js)
// ==========================================

const express = require('express');
const router = express.Router();
const shipmentController = require('../controllers/shipment.controller');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

router.get('/', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Shelter_Manager']), shipmentController.getAllShipments);

// Protected Operations
router.post('/', verifyToken, checkRole(['Admin', 'Relief_Officer']), shipmentController.dispatchShipment);
router.post('/:id/verify-delivery', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Shelter_Manager']), shipmentController.verifyDelivery);

module.exports = router;

