import { Response, NextFunction } from "express";
import { db } from "../database/connection";
import { AuthRequest } from "./auth";
import { LocationModel } from "../models/LocationModel";
import { UserLocationModel } from "../models/UserLocationModel";
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
    const orgUser = await db("organization_users")
      .where({ user_id: userId })
      .orderByRaw("CASE role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END")
      .first();

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
export const locationScopeMiddleware = async (
  req: LocationScopedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) return next();

    // Get all locations for this org
    const orgLocations = await LocationModel.findByOrganizationId(organizationId);
    const allLocationIds = orgLocations.map((l) => l.id);

    if (req.userRole === "admin") {
      req.accessibleLocationIds = allLocationIds;
    } else {
      // Manager/viewer: check user_locations
      const userLocationIds = await UserLocationModel.getLocationIdsForUser(req.userId!);
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

    // If a specific locationId is requested, validate access
    const requestedLocationId =
      (req.query.locationId as string) ||
      (req.params.locationId as string) ||
      req.body?.locationId;

    if (
      requestedLocationId !== undefined &&
      requestedLocationId !== null &&
      requestedLocationId !== ""
    ) {
      const locId = parseInt(requestedLocationId, 10);
      if (!isNaN(locId) && !req.accessibleLocationIds.includes(locId)) {
        return res.status(403).json({ error: "No access to this location" });
      }
      req.locationId = isNaN(locId) ? null : locId;
    }

    next();
  } catch (error) {
    logger.error({ err: error }, "[RBAC] Error resolving location scope:");
    return res.status(500).json({ error: "Unable to resolve location access" });
  }
};
