import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { LocationModel } from "../models/LocationModel";
import { UserLocationModel } from "../models/UserLocationModel";
import { OrganizationUserModel } from "../models/OrganizationUserModel";
import logger from "../lib/logger";

export type UserRole = "admin" | "manager" | "viewer";

export interface RBACRequest extends AuthRequest {
  userRole?: UserRole;
  userId?: number;
  organizationId?: number;
}

export interface LocationScopedRequest extends RBACRequest {
  locationId?: number | null;
  accessibleLocationIds?: number[];
}

export type LocationScopeFailureCode =
  | "LOCATION_ACCESS_DENIED"
  | "LOCATION_ID_INVALID"
  | "LOCATION_SCOPE_UNAVAILABLE";

export type LocationScopeFailureResponder = (
  res: Response,
  status: number,
  code: LocationScopeFailureCode,
  message: string
) => Response;

const legacyLocationScopeFailure: LocationScopeFailureResponder = (
  res,
  status,
  _code,
  message
) => res.status(status).json({ error: message });

/**
 * RBAC Middleware - Checks user role from database on each request.
 * Requires authenticateToken to run first (populates req.user).
 */
export const rbacMiddleware = async (
  req: RBACRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Get user role from organization_users — prefer highest privilege when multiple memberships exist
    const orgUser =
      await OrganizationUserModel.findHighestPrivilegeByUserId(userId);

    if (!orgUser) {
      // User has no organization yet (onboarding not complete)
      req.userRole = "viewer";
      req.userId = userId;
      req.organizationId = undefined;
      return next();
    }

    // Attach role, userId, and organizationId to request
    req.userRole = orgUser.role as UserRole;
    req.userId = userId;
    req.organizationId = orgUser.organization_id;

    next();
  } catch (error) {
    logger.error({ err: error }, "[RBAC] Error checking role:");
    return res.status(500).json({ error: "Failed to verify permissions" });
  }
};

/**
 * Require specific roles to access an endpoint
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: RBACRequest, res: Response, next: NextFunction) => {
    if (!req.userRole) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        error: "Insufficient permissions",
        required: allowedRoles,
        current: req.userRole,
      });
    }

    next();
  };
};

/**
 * Check if user can perform write operations
 */
export const canWrite = (req: RBACRequest): boolean => {
  return req.userRole === "admin" || req.userRole === "manager";
};

/**
 * Check if user is admin
 */
export const isAdmin = (req: RBACRequest): boolean => {
  return req.userRole === "admin";
};

/**
 * Check if user can manage connections (admin only)
 */
export const canManageConnections = (req: RBACRequest): boolean => {
  return req.userRole === "admin";
};

/**
 * Check if user can manage roles (admin only)
 */
export const canManageRoles = (req: RBACRequest): boolean => {
  return req.userRole === "admin";
};

/**
 * Location Scope Middleware - Resolves accessible locations for the user.
 * Requires rbacMiddleware to run first (populates req.organizationId).
 *
 * - Admin users: all locations in their org
 * - Manager/viewer: checks user_locations table; if no explicit grants, defaults to all
 * - Attaches req.accessibleLocationIds and optionally req.locationId
 */
export function createLocationScopeMiddleware(
  respondToFailure: LocationScopeFailureResponder = legacyLocationScopeFailure
) {
  return async (
    req: LocationScopedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) return next();

      // Get all locations for this org
      const orgLocations =
        await LocationModel.findByOrganizationId(organizationId);
      const allLocationIds = orgLocations.map((l) => l.id);

      if (req.userRole === "admin") {
        req.accessibleLocationIds = allLocationIds;
      } else {
        // Manager/viewer: check user_locations
        const userLocationIds = await UserLocationModel.getLocationIdsForUser(
          req.userId!
        );
        if (userLocationIds.length === 0) {
          // No explicit grants → all locations (default behavior)
          req.accessibleLocationIds = allLocationIds;
        } else {
          // Only locations that exist in both user grants AND org locations
          req.accessibleLocationIds = userLocationIds.filter((id) =>
            allLocationIds.includes(id)
          );
        }
      }

      // If a specific location is requested, validate access.
      //
      // Both spellings are accepted deliberately. This middleware historically
      // read only the camelCase `locationId`, while several endpoints (PMS key
      // data among them) send `location_id`. On those routes requestedLocationId
      // resolved to undefined, so the LOCATION_ACCESS_DENIED branch below could
      // never run — mounting the middleware looked like protection and applied
      // none (§5.5).
      // Query and params are held to a stricter standard than the body. Read
      // routes carry no validation schema, so nothing else would catch a
      // malformed value there. A body value belongs to the route's schema,
      // which owns body shape (§11.2) and runs after this router-level
      // middleware — rejecting it here would preempt VALIDATION_ERROR with a
      // less specific failure.
      const scopeParam =
        (req.query.locationId as string) ||
        (req.query.location_id as string) ||
        (req.params.locationId as string) ||
        (req.params.location_id as string);

      const requestedLocationId =
        scopeParam || req.body?.locationId || req.body?.location_id;

      if (
        requestedLocationId !== undefined &&
        requestedLocationId !== null &&
        requestedLocationId !== ""
      ) {
        const locId = parseInt(requestedLocationId, 10);

        // A malformed identifier must not be ignored. This branch previously
        // set req.locationId to null, which reads as "no location filter"
        // downstream — so a garbled value silently widened the request to every
        // location in the organization instead of failing.
        if (isNaN(locId)) {
          if (scopeParam) {
            return respondToFailure(
              res,
              400,
              "LOCATION_ID_INVALID",
              "Invalid location identifier"
            );
          }

          // Body-sourced and malformed: leave req.locationId unset and let the
          // route's schema reject it. Logged because a body route with no
          // schema would reach its controller unscoped.
          logger.warn(
            { path: req.path, userId: req.userId },
            "[RBAC] Malformed locationId in request body — deferring to route validation"
          );
        } else if (!req.accessibleLocationIds.includes(locId)) {
          return respondToFailure(
            res,
            403,
            "LOCATION_ACCESS_DENIED",
            "No access to this location"
          );
        } else {
          req.locationId = locId;
        }
      }

      next();
    } catch (error) {
      logger.error({ err: error }, "[RBAC] Error resolving location scope:");
      return respondToFailure(
        res,
        500,
        "LOCATION_SCOPE_UNAVAILABLE",
        "Unable to resolve location access"
      );
    }
  };
}

export const locationScopeMiddleware = createLocationScopeMiddleware();
