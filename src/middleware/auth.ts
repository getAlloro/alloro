import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import {
  getRefreshedSessionToken,
  SESSION_REFRESH_HEADER,
} from "../controllers/auth-otp/feature-services/service.jwt-management";

/**
 * Read JWT_SECRET lazily at call time so dotenv.config() has already run.
 * Top-level const would capture the value before dotenv loads .env (ESM hoisting).
 */
function getJwtSecret(): string {
  return process.env.JWT_SECRET || "dev-secret-key-change-in-prod";
}

export interface AuthRequest extends Request {
  user?: {
    userId: number;
    email: string;
  };
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  jwt.verify(token, getJwtSecret(), (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    // Sliding expiry — past half-life, hand the client a fresh token
    const refreshedToken = getRefreshedSessionToken(user);
    if (refreshedToken) {
      res.setHeader(SESSION_REFRESH_HEADER, refreshedToken);
    }

    req.user = user;
    next();
  });
};
