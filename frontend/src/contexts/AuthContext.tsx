import React, { useState, useEffect, type ReactNode } from "react";
import {
  AuthContext,
  type AuthContextType,
  type BillingState,
  type DomainMapping,
  type UserProfile,
} from "./authContext";
import onboarding from "../api/onboarding";
import { getBillingStatus } from "../api/billing";
import { logger } from "../lib/logger";

interface AuthProviderProps {
  children: ReactNode;
}

// Helper to detect pilot mode - checks sessionStorage for pilot session indicators
function isPilotSession(): boolean {
  return sessionStorage.getItem("pilot_mode") === "true" || !!sessionStorage.getItem("token");
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [selectedDomain, setSelectedDomain] = useState<DomainMapping | null>(
    null
  );
  const [isLoadingUserProperties, setIsLoadingUserProperties] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Centralized onboarding state - avoids duplicate API calls from Dashboard
  // In pilot mode, always start as null (unknown) and let API determine state
  // This prevents showing admin's cached state in pilot window
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(() => {
    const isPilot = isPilotSession();
    if (isPilot) {
      // Never seed from cache in pilot — always wait for API response
      return null;
    }
    const cached = localStorage.getItem("onboardingCompleted");
    return cached === "true" ? true : cached === "false" ? false : null;
  });
  const [hasProperties, setHasProperties] = useState<boolean>(() => {
    const cached = localStorage.getItem("hasProperties");
    return cached !== "false"; // Default to true unless explicitly false
  });
  const [hasGoogleConnection, setHasGoogleConnection] = useState<boolean>(false);

  // Billing state
  const [billingStatus, setBillingStatus] = useState<BillingState | null>(null);

  // Load user properties from the onboarding API (JWT provides auth context)
  const loadUserProperties = async () => {
    setIsLoadingUserProperties(true);
    try {
      const status = await onboarding.getOnboardingStatus();
      logger.log("[AuthContext] onboarding status API response:", JSON.stringify(status));

      // Update centralized onboarding state
      // Guard: never downgrade from true → false (race condition after completeOnboarding)
      const isCompleted = status.success === true && status.onboardingCompleted === true;
      setOnboardingCompleted((prev) => (prev === true && !isCompleted) ? true : isCompleted);
      if (isCompleted && !isPilotSession()) {
        localStorage.setItem("onboardingCompleted", "true");
      }

      // Track Google connection status
      setHasGoogleConnection(!!status.hasGoogleConnection);

      // Keep user_role in localStorage in sync with the backend
      if (status.role) {
        const storage = isPilotSession() ? sessionStorage : localStorage;
        storage.setItem("user_role", status.role);
      }

      if (status.success) {
        // Always set userProfile when status is available — needed for
        // onboarding resume logic (organizationId) even before completion.
        setUserProfile({
          firstName: status.profile?.firstName || null,
          lastName: status.profile?.lastName || null,
          practiceName: status.profile?.practiceName || null,
          domainName: status.profile?.domainName || null,
          email: status.profile?.email || null,
          organizationId: status.organizationId || null,
          organizationType: status.organizationType || null,
        });

        if (status.onboardingCompleted) {
          // Only set selectedDomain and hasProperties if propertyIds exist
          if (status.propertyIds) {
            const userMapping: DomainMapping = {
              domain:
                status.profile?.domainName ||
                "Your Practice",
              displayName:
                status.profile?.practiceName ||
                "Your Practice",
              gbp_accountId: status.propertyIds.gbp?.[0]?.accountId || "",
              gbp_locationId: status.propertyIds.gbp?.[0]?.locationId || "",
            };
            setSelectedDomain(userMapping);

            const hasProps = !!(
              status.propertyIds.gbp && status.propertyIds.gbp.length > 0
            );
            setHasProperties(hasProps);
            localStorage.setItem("hasProperties", String(hasProps));
          } else {
            setHasProperties(false);
            localStorage.setItem("hasProperties", "false");
          }
        } else {
          setSelectedDomain(null);
        }

        // Fetch billing status if user has an org (regardless of onboarding state)
        if (status.organizationId) {
          try {
            const billing = await getBillingStatus();
            if (billing.success !== false) {
              setBillingStatus({
                hasStripeSubscription: billing.hasStripeSubscription,
                isAdminGranted: billing.isAdminGranted,
                isLockedOut: billing.isLockedOut,
                subscriptionStatus: billing.subscriptionStatus,
              });
            }
          } catch {
            // Billing fetch failed — don't block app load
            logger.error("[AuthContext] Failed to fetch billing status");
          }
        }
      } else {
        setSelectedDomain(null);
      }
    } catch (error) {
      logger.error("Failed to load user properties:", error);
      setSelectedDomain(null);
      // On a status-fetch error, replicate the old success:false path:
      // never DOWNGRADE an already-onboarded user to not-onboarded on a
      // transient load error — only fall to false when not already true.
      setOnboardingCompleted((prev) => (prev === true ? true : false));
      setHasGoogleConnection(false);
      // Match the old success:false path: only persist the downgrade when the
      // user wasn't already onboarded (don't clobber a true cache on a blip).
      if (!isPilotSession() && onboardingCompleted !== true) {
        localStorage.setItem("onboardingCompleted", "false");
      }
    } finally {
      setIsLoadingUserProperties(false);
    }
  };

  // Load user's onboarding selections on mount
  useEffect(() => {
    loadUserProperties();
  }, []);

  // Listen for 402 ACCOUNT_LOCKED responses from the API layer
  useEffect(() => {
    const handleLockedOut = () => {
      setBillingStatus((prev) =>
        prev
          ? { ...prev, isLockedOut: true, subscriptionStatus: "inactive" }
          : {
              hasStripeSubscription: false,
              isAdminGranted: false,
              isLockedOut: true,
              subscriptionStatus: "inactive",
            }
      );
    };

    window.addEventListener("billing:locked-out", handleLockedOut);
    return () =>
      window.removeEventListener("billing:locked-out", handleLockedOut);
  }, []);

  const handleDomainChange = () => {
    // Domain change is no longer used since we removed hardcoded mappings
    logger.warn(
      "[AuthContext] handleDomainChange called but no domain mappings exist"
    );
  };

  const contextValue: AuthContextType = {
    domains: [],
    selectedDomain,
    handleDomainChange,
    setSelectedDomain,
    isLoadingUserProperties,
    userProfile,
    refreshUserProperties: loadUserProperties,
    onboardingCompleted,
    hasProperties,
    hasGoogleConnection,
    billingStatus,
    setOnboardingCompleted,
    setHasProperties,
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};
