import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import onboarding from "../../api/onboarding";
import { fireConfetti } from "../../lib/confetti";
import { useAuth } from "../../hooks/useAuth";
import { logger } from "../../lib/logger";

interface SetupProgress {
  step1_api_connected: boolean; // All 3 scopes granted AND all 3 services connected
  step2_pms_uploaded: boolean; // At least 1 PMS data uploaded
  dismissed: boolean; // User manually dismissed (still show icon)
  completed: boolean; // All steps done (hide entirely)
}

interface SetupProgressContextType {
  progress: SetupProgress;
  isLoading: boolean;
  refreshProgress: () => Promise<void>;
  markStep1Complete: () => void;
  markStep1Incomplete: () => void;
  markStep2Complete: () => void;
  dismissWizard: () => void;
  resetWizard: () => void;
  justCompletedStep: number | null; // Track which step was just completed for confetti
  clearJustCompleted: () => void;
}

const STORAGE_KEY = "alloro_setup_progress";

const defaultProgress: SetupProgress = {
  step1_api_connected: false,
  step2_pms_uploaded: false,
  dismissed: false,
  completed: false,
};

const SetupProgressContext = createContext<SetupProgressContextType | null>(
  null
);

function getStoredProgress(): SetupProgress {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultProgress, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  return defaultProgress;
}

function saveProgressToStorage(progress: SetupProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage errors
  }
}

export function SetupProgressProvider({ children }: { children: ReactNode }) {
  const { hasGoogleConnection, hasProperties, userProfile } = useAuth();
  const [progress, setProgress] = useState<SetupProgress>(getStoredProgress);
  const [isLoading, setIsLoading] = useState(true);
  const [justCompletedStep, setJustCompletedStep] = useState<number | null>(
    null
  );
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearJustCompleted = useCallback(() => {
    setJustCompletedStep(null);
  }, []);

  // Debounced save to API
  const saveProgressToApi = useCallback((newProgress: SetupProgress) => {
    // Always save to localStorage immediately
    saveProgressToStorage(newProgress);

    // Debounce API calls
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await onboarding.updateSetupProgress(newProgress);
      } catch (err) {
        logger.error("Failed to save setup progress to API:", err);
      }
    }, 500);
  }, []);

  // Fetch progress from database (no live API checks)
  const refreshProgress = useCallback(async () => {
    setIsLoading(true);
    try {
      // Skip API call if user has no organization (e.g., admin users)
      if (!userProfile?.organizationId) {
        setProgress(getStoredProgress());
        setIsLoading(false);
        return;
      }

      const apiProgress = await onboarding.getSetupProgress();

      if (apiProgress.progress) {
        const dbProgress = { ...defaultProgress, ...apiProgress.progress };
        setProgress(dbProgress);
        saveProgressToStorage(dbProgress);
      } else {
        // No progress in the response — fall back to localStorage
        setProgress(getStoredProgress());
      }
    } catch (err) {
      logger.error("Failed to fetch setup progress:", err);
      setProgress(getStoredProgress());
    } finally {
      setIsLoading(false);
    }
  }, [userProfile?.organizationId]);

  // Mark step 1 as complete (with confetti)
  const markStep1Complete = useCallback(() => {
    setProgress((prev) => {
      // Only trigger confetti if this is a new completion
      if (!prev.step1_api_connected) {
        setJustCompletedStep(1);
      }
      const updated = {
        ...prev,
        step1_api_connected: true,
        completed: prev.step2_pms_uploaded, // Complete if step 2 also done
      };
      saveProgressToApi(updated);
      return updated;
    });
  }, [saveProgressToApi]);

  // Mark step 1 as incomplete (when a service is disconnected)
  const markStep1Incomplete = useCallback(() => {
    setProgress((prev) => {
      const updated = { ...prev, step1_api_connected: false, completed: false };
      saveProgressToApi(updated);
      return updated;
    });
  }, [saveProgressToApi]);

  // Mark step 2 as complete
  const markStep2Complete = useCallback(() => {
    setProgress((prev) => {
      // Only trigger confetti if this is a new completion
      if (!prev.step2_pms_uploaded) {
        setJustCompletedStep(2);
      }
      const updated = {
        ...prev,
        step2_pms_uploaded: true,
        completed: prev.step1_api_connected, // Complete if step 1 also done
      };
      saveProgressToApi(updated);
      return updated;
    });
  }, [saveProgressToApi]);

  // Dismiss wizard (hide panel but keep icon)
  const dismissWizard = useCallback(() => {
    setProgress((prev) => {
      const updated = { ...prev, dismissed: true };
      saveProgressToApi(updated);
      return updated;
    });
  }, [saveProgressToApi]);

  // Reset wizard (for testing/debugging)
  const resetWizard = useCallback(() => {
    setProgress(defaultProgress);
    saveProgressToApi(defaultProgress);
  }, [saveProgressToApi]);

  // Initial load and listen for PMS upload events
  useEffect(() => {
    refreshProgress();

    // Listen for PMS upload events - immediately mark step 2 complete for instant feedback
    const handlePmsUpload = () => {
      markStep2Complete();
    };

    window.addEventListener("pms:job-uploaded", handlePmsUpload);
    return () => {
      window.removeEventListener("pms:job-uploaded", handlePmsUpload);
    };
  }, [refreshProgress, markStep2Complete]);

  // Auto-detect: sync step 1 with actual Google connection state
  useEffect(() => {
    if ((hasGoogleConnection || hasProperties) && !progress.step1_api_connected) {
      markStep1Complete();
    } else if (!hasGoogleConnection && !hasProperties && progress.step1_api_connected) {
      markStep1Incomplete();
    }
  }, [hasGoogleConnection, hasProperties, progress.step1_api_connected, markStep1Complete, markStep1Incomplete]);

  // Fire confetti when a step is completed (handled here so it works even if wizard UI is hidden)
  useEffect(() => {
    if (justCompletedStep) {
      // Check if mobile (< 768px) for confetti position
      const isMobile = window.innerWidth < 768;
      // Mobile: bottom-right, Desktop: top-right
      const confettiPosition = isMobile
        ? { x: 0.92, y: 0.92 }
        : { x: 0.92, y: 0.08 };
      fireConfetti(confettiPosition);
    }
  }, [justCompletedStep]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <SetupProgressContext.Provider
      value={{
        progress,
        isLoading,
        refreshProgress,
        markStep1Complete,
        markStep1Incomplete,
        markStep2Complete,
        dismissWizard,
        resetWizard,
        justCompletedStep,
        clearJustCompleted,
      }}
    >
      {children}
    </SetupProgressContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSetupProgress(): SetupProgressContextType {
  const context = useContext(SetupProgressContext);
  if (!context) {
    throw new Error(
      "useSetupProgress must be used within a SetupProgressProvider"
    );
  }
  return context;
}

// Safe hook that returns null if outside provider (for components that may render outside the provider)
// eslint-disable-next-line react-refresh/only-export-components
export function useSetupProgressSafe(): SetupProgressContextType | null {
  return useContext(SetupProgressContext);
}
