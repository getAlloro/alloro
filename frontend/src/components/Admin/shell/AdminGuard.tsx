import { useEffect, useState } from "react";
import { apiGet, getAuthToken } from "../../../api";
import { logger } from "../../../lib/logger";
import { AdminLogin } from "./AdminLogin";

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);



  useEffect(() => {
    const checkAuth = async () => {
      const token = getAuthToken();
      
      if (!token) {
        setIsAuthenticated(false);
        setChecking(false);
        return;
      }

      try {
        // Verify if the user is actually a Super Admin
        const res = await apiGet({ path: "/admin/validate", token });
        
        if (res.success) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          // Optional: Clear token if we want to force re-login, 
          // but maybe they are valid for the main app, just not admin.
          // So we just deny access here.
        }
      } catch (error) {
        logger.error("Admin validation failed", error);
        setIsAuthenticated(false);
      } finally {
        setChecking(false);
      }
    };

    checkAuth();
    
    // Listen for storage events in case login happens in another tab
    // or if we want to react to token changes
    window.addEventListener("storage", checkAuth);
    return () => window.removeEventListener("storage", checkAuth);
  }, []);

  if (checking) {
    return null; // Or a loading spinner
  }

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  return <>{children}</>;
}
