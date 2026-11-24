// ==========================================
// DRRACS - Auth Routes (routes/auth.routes.js)
// Maps URLs to Auth Controller functions
// ==========================================

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

// Public routes (anyone can access)
router.post('/login', authController.login);
router.post('/register', authController.register);

// Protected route (requires valid JWT token)
router.get('/profile', verifyToken, authController.getProfile);

// RBAC Demo Route (Requires valid token AND Admin role)
router.get('/admin-only', verifyToken, checkRole(['Admin']), (req, res) => {
  res.json({
    success: true,
    message: `Access Granted! Welcome to the Incident Command Center, ${req.user.name}.`,
    role: req.user.role,
    permissionLevel: 'LEVEL_1_COMMAND_ACCESS'
  });
});

module.exports = router;

