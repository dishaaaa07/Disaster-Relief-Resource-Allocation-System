// ==========================================
// DRRACS - Role-Based Access Control (RBAC)
// (middleware/checkRole.js)
// ==========================================

/**
 * Middleware factory to restrict access by user role.
 * @param {Array<string>} allowedRoles - e.g. ['Admin'], ['Admin', 'Relief_Officer']
 */
module.exports = (allowedRoles = []) => {
  return (req, res, next) => {
    // 1. Ensure user has already passed through auth middleware (req.user exists)
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before checking permissions.'
      });
    }

    // 2. Check if the user's role is in the list of allowed roles
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access denied. This action requires one of the following roles: [${allowedRoles.join(', ')}]. Your current role is: "${req.user.role}".`
      });
    }

    // 3. User has permission! Proceed to the controller
    next();
  };
};

