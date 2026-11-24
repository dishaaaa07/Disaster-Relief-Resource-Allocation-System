// ==========================================
// DRRACS - Stock Inventory Routes
// (routes/stock.routes.js)
// ==========================================

const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stock.controller');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

router.get('/', verifyToken, checkRole(['Admin', 'Relief_Officer']), stockController.getAllStock);
router.get('/:id', verifyToken, checkRole(['Admin', 'Relief_Officer']), stockController.getStockById);

// Protected inventory management endpoints
router.post('/', verifyToken, checkRole(['Admin', 'Relief_Officer']), stockController.receiveStock);
router.put('/:id', verifyToken, checkRole(['Admin', 'Relief_Officer']), stockController.adjustStock);
router.delete('/:id', verifyToken, checkRole(['Admin']), stockController.deleteStock);

module.exports = router;

