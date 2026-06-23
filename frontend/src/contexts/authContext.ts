import { createContext } from "react";

// Domain mapping structure - maps display domains to integration identifiers
export interface DomainMapping {
  domain: string;
  displayName: string;
  // GBP integration properties
  gbp_accountId?: string;
  gbp_locationId?: string;
}

// User profile information
export interface UserProfile {
  firstName: string | null;
  lastName: string | null;
  practiceName: string | null;
  domainName: string | null;
  email?: string | null;
  organizationId?: number | null;
  organizationType?: "health" | "generic" | null;
}

// Billing status from GET /api/billing/status
export interface BillingState {
  hasStripeSubscription: boolean;
  isAdminGranted: boolean;
  isLockedOut: boolean;
  subscriptionStatus: string;
}

export interface AuthContextType {
  // Domain State
  domains: DomainMapping[];
  selectedDomain: DomainMapping | null;
  isLoadingUserProperties: boolean;

  // Profile State
  userProfile: UserProfile | null;

  // Onboarding State (centralized to avoid duplicate API calls)
  onboardingCompleted: boolean | null;
  hasProperties: boolean;
  hasGoogleConnection: boolean;

  // Billing State
  billingStatus: BillingState | null;

  // Functions
  handleDomainChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  setSelectedDomain: (domain: DomainMapping | null) => void;
  refreshUserProperties: () => Promise<void>;
  setOnboardingCompleted: (value: boolean | null) => void;
  setHasProperties: (value: boolean) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);
