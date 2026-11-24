// ==========================================
// DRRACS - Audit & Metrics Routes
// (routes/audit.routes.js)
// ==========================================

const express = require('express');
const router = express.Router();
const auditController = require('../controllers/audit.controller');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

router.get('/', verifyToken, checkRole(['Admin']), auditController.getActivityLogs);
router.get('/metrics', verifyToken, checkRole(['Admin']), auditController.getDashboardMetrics);

module.exports = router;

