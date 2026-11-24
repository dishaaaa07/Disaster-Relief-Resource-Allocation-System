// ==========================================
// DRRACS - Resource Request Routes
// (routes/request.routes.js)
// ==========================================

const express = require('express');
const router = express.Router();
const requestController = require('../controllers/request.controller');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

router.get('/', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Shelter_Manager']), requestController.getAllRequests);
router.get('/:id', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Shelter_Manager']), requestController.getRequestById);

// Protected Operations
router.post('/', verifyToken, checkRole(['Admin', 'Relief_Officer', 'Shelter_Manager']), requestController.createRequest);
router.put('/:id/status', verifyToken, checkRole(['Admin', 'Relief_Officer']), requestController.updateRequestStatus);
router.delete('/:id', verifyToken, checkRole(['Admin']), requestController.deleteRequest);

module.exports = router;

