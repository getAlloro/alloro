import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { apiGet } from "../api";
import { WebsiteLoadingSkeleton } from "./website/WebsiteLoadingSkeleton";

interface DFYRouteProps {
  children: React.ReactNode;
}

/**
 * DFYRoute - Tier-aware route wrapper
 *
 * Protects DFY-tier routes by:
 * 1. Checking org tier before rendering children
 * 2. Redirecting to /dashboard if tier check fails
 * 3. Showing loading state during tier check
 *
 * Defense in depth: Backend still validates on every API call.
 */
export function DFYRoute({ children }: DFYRouteProps) {
  const [checking, setChecking] = useState(true);
  const [hasDFY, setHasDFY] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkTier = async () => {
      try {
        await apiGet({ path: "/user/website" });
        setHasDFY(true);
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 403) {
          toast.error("Website project is not available yet");
        } else {
          console.error("[DFYRoute] Tier check failed:", error);
        }
        navigate("/dashboard", { replace: true });
      } finally {
        setChecking(false);
      }
    };

    checkTier();
  }, [navigate]);

  if (checking) {
    return <WebsiteLoadingSkeleton />;
  }

  return hasDFY ? <>{children}</> : null;
}
