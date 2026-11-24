// ==========================================
// DRRACS - Auth Middleware (middleware/auth.js)
// Verifies JWT token and attaches user to req
// ==========================================

const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  // 1. Get the Authorization header from the incoming request
  const authHeader = req.headers['authorization'];

  // The header usually looks like: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6Ik..."
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authorization token provided.'
    });
  }

  // 2. Extract the token (split by space and take the second part)
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : authHeader;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Token missing from Authorization header.'
    });
  }

  try {
    // 3. Verify the token signature and expiration
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');

    // 4. Attach the decoded user payload ({ userId, email, role, name }) to req.user
    req.user = decoded;

    // 5. Hand over to the next function (controller)
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token. Please log in again.',
      error: error.message
    });
  }
};

