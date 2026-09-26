import { ApiError } from "../utils/ApiError.js";

/**
 * Middleware factory to authorize specific user roles.
 * @param {...string} allowedRoles - Roles allowed to access the route (e.g. 'worker', 'employer', 'admin')
 */
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication required"));
    }

    const userRoles = req.user.roles || [];
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return next(
        new ApiError(
          403,
          `Forbidden: Access denied. Required role: [${allowedRoles.join(", ")}]`
        )
      );
    }

    next();
  };
};
