// ==========================================
// DRRACS - Allocation Routes
// (routes/allocation.routes.js)
// ==========================================

const express = require('express');
const router = express.Router();
const allocationController = require('../controllers/allocation.controller');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

router.get('/', verifyToken, checkRole(['Admin', 'Relief_Officer']), allocationController.getAllAllocations);

// Protected execution (Admin and Relief Officers)
router.post('/', verifyToken, checkRole(['Admin', 'Relief_Officer']), allocationController.createAllocation);

module.exports = router;

