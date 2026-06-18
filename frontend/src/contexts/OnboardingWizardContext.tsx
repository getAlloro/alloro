import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getPriorityItem } from "../hooks/useLocalStorage";
import onboarding from "../api/onboarding";
import {
  WIZARD_STEPS,
  WIZARD_DEMO_DATA,
  getPageRoute,
  type WizardStep,
  type WizardPage,
} from "../components/onboarding-wizard/wizardConfig";
import { logger } from "../lib/logger";

interface OnboardingWizardContextType {
  /** Whether the wizard is currently active */
  isWizardActive: boolean;
  /** Whether we're still loading the wizard status from the API */
  isLoadingWizardStatus: boolean;
  /** Whether the welcome modal is showing (before steps begin) */
  showWelcomeModal: boolean;
  /** Dismiss the welcome modal and start the steps */
  dismissWelcomeModal: () => void;
  /** Current step index */
  currentStepIndex: number;
  /** Current step configuration */
  currentStep: WizardStep | null;
  /** Total number of steps */
  totalSteps: number;
  /** Progress percentage (0-100) */
  progress: number;
  /** Demo data to use when wizard is active */
  demoData: typeof WIZARD_DEMO_DATA;
  /** Start the wizard */
  startWizard: () => void;
  /** Go to next step */
  nextStep: () => void;
  /** Go to previous step */
  prevStep: () => void;
  /** Skip the entire wizard */
  skipWizard: () => Promise<void>;
  /** Complete the wizard */
  completeWizard: () => Promise<void>;
  /** Check if navigation should be blocked */
  shouldBlockNavigation: (targetPath: string) => boolean;
  /** Navigate to a page (used by wizard to control navigation) */
  wizardNavigate: (page: WizardPage) => void;
  /** Restart the wizard (for testing/demo purposes) */
  restartWizard: () => Promise<void>;
  /** Re-check wizard status from API and auto-start if not completed */
  recheckWizardStatus: () => Promise<void>;
}

const OnboardingWizardContext = createContext<
  OnboardingWizardContextType | undefined
>(undefined);

export function OnboardingWizardProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { onboardingCompleted } = useAuth();

  const [isWizardActive, setIsWizardActive] = useState(false);
  const [isLoadingWizardStatus, setIsLoadingWizardStatus] = useState(true);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [, setWizardCompleted] = useState<boolean | null>(null);

  const currentStep =
    currentStepIndex >= 0 && currentStepIndex < WIZARD_STEPS.length
      ? WIZARD_STEPS[currentStepIndex]
      : null;

  const totalSteps = WIZARD_STEPS.length;
  const progress = totalSteps > 0 ? ((currentStepIndex + 1) / totalSteps) * 100 : 0;

  // Check wizard status — only when main onboarding is confirmed complete.
  // Without this guard, the wizard would auto-start while the user is still
  // in the onboarding flow (org exists but onboarding_completed is false).
  useEffect(() => {
    if (onboardingCompleted !== true) {
      setIsLoadingWizardStatus(false);
      return;
    }

    const checkWizardStatus = async () => {
      const authToken = getPriorityItem("auth_token") || getPriorityItem("token");
      if (!authToken) {
        setIsLoadingWizardStatus(false);
        return;
      }

      try {
        const response = await onboarding.getWizardStatus();
        if (response && typeof response.onboarding_wizard_completed === "boolean") {
          setWizardCompleted(response.onboarding_wizard_completed);
          if (!response.onboarding_wizard_completed) {
            setShowWelcomeModal(true);
            setIsWizardActive(true);
          }
        }
      } catch (error) {
        logger.error("Failed to check wizard status:", error);
      } finally {
        setIsLoadingWizardStatus(false);
      }
    };

    checkWizardStatus();
  }, [onboardingCompleted]);

  // Navigate to correct page when step changes.
  // Accept sub-routes as matches (e.g. /settings/integrations satisfies /settings)
  // to avoid a navigate loop when the target route redirects to a child index.
  useEffect(() => {
    if (!isWizardActive || !currentStep) return;

    const targetRoute = getPageRoute(currentStep.page);
    const onTargetOrDescendant =
      location.pathname === targetRoute ||
      location.pathname.startsWith(targetRoute + "/");
    if (!onTargetOrDescendant) {
      navigate(targetRoute);
    }
  }, [currentStep, isWizardActive, location.pathname, navigate]);

  const startWizard = useCallback(() => {
    setCurrentStepIndex(0);
    setShowWelcomeModal(true);
    setIsWizardActive(true);
    // Navigate to first step's page
    const firstStep = WIZARD_STEPS[0];
    if (firstStep) {
      navigate(getPageRoute(firstStep.page));
    }
  }, [navigate]);

  const dismissWelcomeModal = useCallback(() => {
    setShowWelcomeModal(false);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  }, [currentStepIndex, totalSteps]);

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [currentStepIndex]);

  const skipWizard = useCallback(async () => {
    try {
      await onboarding.completeWizard();
      setIsWizardActive(false);
      setWizardCompleted(true);
      // Navigate to dashboard after skipping
      navigate("/dashboard");
    } catch (error) {
      logger.error("Failed to skip wizard:", error);
    }
  }, [navigate]);

  const completeWizardHandler = useCallback(async () => {
    try {
      await onboarding.completeWizard();
      setIsWizardActive(false);
      setWizardCompleted(true);
      // Navigate to dashboard after completing
      navigate("/dashboard");
    } catch (error) {
      logger.error("Failed to complete wizard:", error);
    }
  }, [navigate]);

  const restartWizard = useCallback(async () => {
    try {
      await onboarding.restartWizard();
      setCurrentStepIndex(0);
      setWizardCompleted(false);
      setShowWelcomeModal(true);
      setIsWizardActive(true);
      // Navigate to first step's page
      const firstStep = WIZARD_STEPS[0];
      if (firstStep) {
        navigate(getPageRoute(firstStep.page));
      }
    } catch (error) {
      logger.error("Failed to restart wizard:", error);
    }
  }, [navigate]);

  // Re-check wizard status from API and auto-start if not completed.
  // Guarded: only runs when main onboarding is confirmed complete.
  const recheckWizardStatus = useCallback(async () => {
    if (onboardingCompleted !== true) {
      setIsLoadingWizardStatus(false);
      return;
    }

    const authToken = getPriorityItem("auth_token") || getPriorityItem("token");
    if (!authToken) {
      setIsLoadingWizardStatus(false);
      return;
    }

    setIsLoadingWizardStatus(true);
    try {
      const response = await onboarding.getWizardStatus();

      if (typeof response.onboarding_wizard_completed === "boolean") {
        setWizardCompleted(response.onboarding_wizard_completed);
        if (!response.onboarding_wizard_completed) {
          setCurrentStepIndex(0);
          setShowWelcomeModal(true);
          setIsWizardActive(true);
          const firstStep = WIZARD_STEPS[0];
          if (firstStep) {
            navigate(getPageRoute(firstStep.page));
          }
        }
      }
    } catch (error) {
      logger.error("Failed to recheck wizard status:", error);
    } finally {
      setIsLoadingWizardStatus(false);
    }
  }, [navigate, onboardingCompleted]);

  const shouldBlockNavigation = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_targetPath: string): boolean => {
      if (!isWizardActive) return false;
      // During wizard, block all navigation except what the wizard controls
      return true;
    },
    [isWizardActive]
  );

  const wizardNavigate = useCallback(
    (page: WizardPage) => {
      navigate(getPageRoute(page));
    },
    [navigate]
  );

  const contextValue: OnboardingWizardContextType = {
    isWizardActive,
    isLoadingWizardStatus,
    showWelcomeModal,
    dismissWelcomeModal,
    currentStepIndex,
    currentStep,
    totalSteps,
    progress,
    demoData: WIZARD_DEMO_DATA,
    startWizard,
    nextStep,
    prevStep,
    skipWizard,
    completeWizard: completeWizardHandler,
    shouldBlockNavigation,
    wizardNavigate,
    restartWizard,
    recheckWizardStatus,
  };

  return (
    <OnboardingWizardContext.Provider value={contextValue}>
      {children}
    </OnboardingWizardContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOnboardingWizard() {
  const context = useContext(OnboardingWizardContext);
  if (context === undefined) {
    throw new Error(
      "useOnboardingWizard must be used within an OnboardingWizardProvider"
    );
  }
  return context;
}

/**
 * Hook to check if wizard is active (safe to use outside provider)
 * Returns false if provider is not present
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useIsWizardActive(): boolean {
  const context = useContext(OnboardingWizardContext);
  return context?.isWizardActive ?? false;
}

/**
 * Hook to check if wizard status is still loading
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useIsWizardLoading(): boolean {
  const context = useContext(OnboardingWizardContext);
  return context?.isLoadingWizardStatus ?? false;
}

/**
 * Hook to get demo data when wizard is active
 * Returns null if wizard is not active
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useWizardDemoData() {
  const context = useContext(OnboardingWizardContext);
  if (!context?.isWizardActive) return null;
  return context.demoData;
}

/**
 * Hook to recheck wizard status and auto-start if not completed
 * Used after initial onboarding completes to trigger the wizard tour
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useRecheckWizardStatus() {
  const context = useContext(OnboardingWizardContext);
  return context?.recheckWizardStatus ?? (async () => {});
}
