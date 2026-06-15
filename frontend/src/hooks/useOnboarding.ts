import { useState, useCallback } from "react";
import onboarding from "../api/onboarding";
import { createCheckoutSession } from "../api/billing";
import { logger } from "../lib/logger";
import { getErrorMessage } from "../lib/errorMessage";

interface GBPSelection {
  accountId: string;
  locationId: string;
  displayName: string;
}

export const useOnboarding = (initialStep: number = 1) => {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const totalSteps = 4;

  // Profile state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [domainName, setDomainName] = useState("");

  // GBP state
  const [selectedGbpLocations, setSelectedGbpLocations] = useState<GBPSelection[]>([]);

  // Checkout state (single-product: always DFY)
  const [isCheckoutProcessing, setIsCheckoutProcessing] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch available GBP locations for the authenticated user
   */
  const fetchAvailableGBP = useCallback(async () => {
    const response = await onboarding.getAvailableGBP();
    if (response.success) {
      return response.properties as Array<{
        id: string;
        name: string;
        accountId: string;
        locationId: string;
        address?: string;
      }>;
    }
    throw new Error(response.errorMessage || "Failed to fetch GBP locations");
  }, []);

  /**
   * Save selected GBP locations
   */
  const saveGbpSelections = useCallback(async (locations: GBPSelection[]) => {
    setSelectedGbpLocations(locations);

    const saveResponse = await onboarding.saveGBP(locations);
    if (!saveResponse.success) {
      throw new Error(saveResponse.errorMessage || "Failed to save GBP selection");
    }

    logger.log("[Onboarding] GBP selections saved:", locations.length, "locations");
  }, []);

  /**
   * Step 2: Save profile data and create/update the organization.
   * Does NOT mark onboarding as complete.
   * Returns the organizationId on success.
   */
  const saveProfileAndCreateOrg = useCallback(async (): Promise<number | null> => {
    setIsSavingProfile(true);
    setError(null);

    try {
      const response = await onboarding.saveProfile({
        profile: {
          firstName,
          lastName,
          phone: "",
          practiceName,
          operationalJurisdiction: "",
          domainName,
        },
      });

      if (response.success) {
        logger.log("[Onboarding] Profile saved, org:", response.organizationId);
        return response.organizationId;
      } else {
        throw new Error(response.errorMessage || response.message || "Failed to save profile");
      }
    } catch (err: unknown) {
      logger.error("[Onboarding] Error saving profile:", err);
      setError(getErrorMessage(err) || "Failed to save profile");
      return null;
    } finally {
      setIsSavingProfile(false);
    }
  }, [firstName, lastName, practiceName, domainName]);

  /**
   * Step 3: Mark onboarding as complete.
   * Profile data was already saved in Step 2.
   */
  const completeOnboarding = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await onboarding.completeOnboarding();

      if (response.success) {
        logger.log("[Onboarding] Successfully completed!");
        return true;
      } else {
        throw new Error(response.message || "Failed to complete onboarding");
      }
    } catch (err: unknown) {
      logger.error("[Onboarding] Error completing onboarding:", err);
      setError(getErrorMessage(err) || "Failed to complete onboarding");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Step 4: Initiate Stripe Checkout.
   * Single-product model — always creates a DFY checkout session.
   * Redirects to Stripe's hosted checkout page.
   */
  const initiateCheckout = useCallback(async () => {
    setIsCheckoutProcessing(true);
    setError(null);

    try {
      const response = await createCheckoutSession("DFY", true);

      if (response.success && response.url) {
        logger.log("[Onboarding] Redirecting to Stripe Checkout");
        window.location.href = response.url;
      } else {
        throw new Error(
          response.error || "Failed to create checkout session"
        );
      }
    } catch (err: unknown) {
      logger.error("[Onboarding] Checkout error:", err);
      setError(getErrorMessage(err) || "Failed to start checkout");
      setIsCheckoutProcessing(false);
    }
    // Note: no finally — if redirect succeeds, we never return here
  }, []);

  /**
   * Move to next step
   */
  const nextStep = useCallback(() => {
    if (currentStep < totalSteps) {
      setCurrentStep((prev) => prev + 1);
      logger.log("[Onboarding] Moving to step", currentStep + 1);
    }
  }, [currentStep, totalSteps]);

  /**
   * Move to previous step
   */
  const previousStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      logger.log("[Onboarding] Moving back to step", currentStep - 1);
    }
  }, [currentStep]);

  /**
   * Reset onboarding state
   */
  const resetOnboarding = useCallback(() => {
    setCurrentStep(1);
    setFirstName("");
    setLastName("");
    setPracticeName("");
    setDomainName("");
    setSelectedGbpLocations([]);
    setError(null);
    logger.log("[Onboarding] Reset");
  }, []);

  return {
    currentStep,
    setCurrentStep,
    totalSteps,
    isLoading,
    isSavingProfile,
    error,

    // Profile state
    firstName,
    lastName,
    practiceName,
    domainName,
    setFirstName,
    setLastName,
    setPracticeName,
    setDomainName,

    // GBP state
    selectedGbpLocations,
    setSelectedGbpLocations,
    fetchAvailableGBP,
    saveGbpSelections,

    // Checkout state
    isCheckoutProcessing,

    // Actions
    saveProfileAndCreateOrg,
    nextStep,
    previousStep,
    completeOnboarding,
    initiateCheckout,
    resetOnboarding,
  };
};
