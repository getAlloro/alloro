import { Navigate } from "react-router-dom";
import { getPriorityItem } from "../hooks/useLocalStorage";
import { logger } from "../lib/logger";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute component that redirects unauthenticated users to signin.
 * Checks for JWT token in storage (context-free for route-level protection).
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  // Check for auth_token (email/password login) or token (pilot mode)
  const authToken = getPriorityItem("auth_token");
  const token = getPriorityItem("token");

  const isAuthenticated = !!authToken || !!token;

  if (!isAuthenticated) {
    logger.log(
      "[ProtectedRoute] No JWT token found; redirecting to signin",
      { currentTime: new Date().toISOString() }
    );
    return <Navigate to="/signin" replace />;
  }

  return <>{children}</>;
};
