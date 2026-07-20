import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchPmsKeyData,
  fetchActiveAutomationJobs,
  fetchAutomationStatus,
  type PmsKeyDataResponse,
  type AutomationStatusDetail,
} from "../../api/pms";
import type { ReferralEngineData } from "./ReferralMatrices";
import { useLocationContext } from "../../contexts/locationContext";
import { apiGet, adminFetch } from "../../api";
import { logger } from "../../lib/logger";
import { usePmsCopy } from "./pmsCopy";

interface UsePmsVisualPillarsParams {
  domain?: string;
  organizationId?: number | null;
  locationId?: number | null;
  isWizardActive: boolean;
}

/**
 * Reactive core for PMSVisualPillars: data-loading (key data + referral engine
 * data) and automation-status polling, lifted verbatim out of the component.
 * Hooks here run in the exact same order they had in the component, so the
 * component calls this hook at the same position in its own hook sequence.
 */
export function usePmsVisualPillars({
  domain,
  organizationId,
  locationId,
  isWizardActive,
}: UsePmsVisualPillarsParams) {
  const { signalContentReady } = useLocationContext();
  const copy = usePmsCopy();

  // Connection status state - track if GBP is connected
  const [connectionStatus, setConnectionStatus] = useState<{
    gbpConnected: boolean;
    isLoading: boolean;
  }>({
    gbpConnected: false,
    isLoading: true,
  });

  // Start with loading false if wizard is active (we'll show demo data immediately)
  const [isLoading, setIsLoading] = useState(!isWizardActive);
  const [keyDataLoaded, setKeyDataLoaded] = useState(false);
  const [automationChecked, setAutomationChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyData, setKeyData] = useState<PmsKeyDataResponse["data"] | null>(
    null,
  );
  const [localProcessing, setLocalProcessing] = useState(false);

  // Referral Engine data state
  const [referralData, setReferralData] = useState<ReferralEngineData | null>(
    null,
  );
  const [referralPending, setReferralPending] = useState(false);
  const [automationStatus, setAutomationStatus] =
    useState<AutomationStatusDetail | null>(null);

  const storageKey = useMemo(
    () => `pmsProcessing:${organizationId || "unknown"}`,
    [organizationId],
  );

  const isMountedRef = useRef(false);

  const loadKeyData = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      // Guard: Skip loading during wizard mode - use demo data instead
      if (isWizardActive) {
        setIsLoading(false);
        return;
      }

      // Guard: Skip loading if organizationId is not available
      if (!organizationId) {
        setIsLoading(false);
        return;
      }

      if (!silent) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const response = await fetchPmsKeyData({ locationId });

        if (!isMountedRef.current) {
          return;
        }

        if (response?.success && response.data) {
          setKeyData(response.data);
        } else {
          setKeyData(null);
          setError(
            response?.error || response?.message || copy.retrieveErrorTitle,
          );
        }
      } catch (err) {
        if (!isMountedRef.current) {
          return;
        }

        setKeyData(null);
        const message =
          err instanceof Error ? err.message : copy.retrieveErrorTitle;
        setError(message);
      } finally {
        if (isMountedRef.current && !silent) {
          setIsLoading(false);
        }
        setKeyDataLoaded(true);
        signalContentReady();
      }
    },
    [
      organizationId,
      locationId,
      isWizardActive,
      copy.retrieveErrorTitle,
      signalContentReady,
    ],
  );

  useEffect(() => {
    isMountedRef.current = true;
    loadKeyData();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadKeyData]);

  // Fetch connection status to check if all 3 Google services are connected
  useEffect(() => {
    const fetchConnectionStatus = async () => {
      // Skip in wizard mode - assume connected
      if (isWizardActive) {
        setConnectionStatus({
          gbpConnected: true,
          isLoading: false,
        });
        return;
      }

      try {
        const response = await apiGet({ path: "/settings/properties" });

        if (response.success) {
          setConnectionStatus({
            gbpConnected:
              response.properties?.gbp && response.properties.gbp.length > 0,
            isLoading: false,
          });
        } else {
          setConnectionStatus((prev) => ({ ...prev, isLoading: false }));
        }
      } catch (err) {
        logger.error("Failed to fetch connection status:", err);
        setConnectionStatus((prev) => ({ ...prev, isLoading: false }));
      }
    };

    fetchConnectionStatus();
  }, [isWizardActive]);

  // Sync loading state - handle both wizard mode AND normal mode
  // When wizard is active, show demo data immediately (no loading)
  // When wizard is NOT active but organizationId is missing, don't show loading forever
  useEffect(() => {
    if (isWizardActive) {
      // Wizard mode: immediately show demo data
      setIsLoading(false);
    } else if (!organizationId) {
      // No org yet but not in wizard: don't stay stuck loading forever
      // The parent (Dashboard.tsx) shows its own skeleton when org is undefined
      setIsLoading(false);
    }
  }, [isWizardActive, organizationId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setLocalProcessing(false);
      return;
    }

    const flag = window.localStorage.getItem(storageKey);
    setLocalProcessing(Boolean(flag));
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || !detail.clientId || detail.clientId === domain) {
        const eventLocationId = detail?.locationId ?? null;
        if (!eventLocationId || eventLocationId === locationId) {
          setLocalProcessing(true);
        }
        loadKeyData({ silent: true });
      }
    };

    window.addEventListener("pms:job-uploaded", handler as EventListener);
    return () => {
      window.removeEventListener("pms:job-uploaded", handler as EventListener);
    };
  }, [domain, locationId, loadKeyData]);

  const latestJobStatus = keyData?.stats?.latestJobStatus ?? null;
  const latestJobIsApproved = keyData?.stats?.latestJobIsApproved ?? null;
  const latestJobIsClientApproved =
    keyData?.stats?.latestJobIsClientApproved ?? null;
  const latestJobId = keyData?.stats?.latestJobId ?? null;
  const latestJobRaw = keyData?.latestJobRaw ?? null;

  const hasLatestJobRaw = useMemo(() => {
    if (latestJobRaw == null) {
      return false;
    }

    if (Array.isArray(latestJobRaw)) {
      return latestJobRaw.length > 0;
    }

    if (typeof latestJobRaw === "object") {
      return Object.keys(latestJobRaw as Record<string, unknown>).length > 0;
    }

    return true;
  }, [latestJobRaw]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // If there's no job at all, clear any stale localStorage flags
    if (latestJobId === null) {
      window.localStorage.removeItem(storageKey);
      setLocalProcessing(false);
      return;
    }

    if (latestJobIsApproved === true) {
      window.localStorage.removeItem(storageKey);
      setLocalProcessing(false);
    } else if (latestJobIsApproved === false) {
      setLocalProcessing(true);
    }
  }, [latestJobIsApproved, latestJobId, storageKey]);

  useEffect(() => {
    if (latestJobStatus?.toLowerCase() === "pending") {
      setLocalProcessing(true);
    }
  }, [latestJobStatus]);

  // Fetch Referral Engine data - skip during wizard mode (use demo data instead)
  const loadReferralData = useCallback(async () => {
    // Skip during wizard mode - use demo data instead
    if (isWizardActive) {
      return;
    }

    if (!organizationId) {
      return;
    }

    try {
      const locParam = locationId ? `?locationId=${locationId}` : "";
      const response = await adminFetch(
        `/api/agents/getLatestReferralEngineOutput/${organizationId}${locParam}`,
      );

      if (!response.ok) {
        setReferralData(null);
        setReferralPending(false);
        return;
      }

      const result = await response.json();

      // Check if referral engine output is pending (monthly agents still running)
      if (result.success && result.pending === true) {
        setReferralPending(true);
        setReferralData(null);
        return;
      }

      // Got actual data
      setReferralPending(false);
      if (result.success && result.data) {
        const dataToSet = Array.isArray(result.data)
          ? result.data[0]
          : result.data;
        setReferralData(dataToSet);
      }
    } catch (err) {
      logger.error("Failed to fetch referral engine data:", err);
      setReferralData(null);
      setReferralPending(false);
    }
  }, [organizationId, locationId, isWizardActive]);

  useEffect(() => {
    loadReferralData();
  }, [loadReferralData]);

  // Check for active automation on mount (handles page refresh during automation)
  // Also handles the case where client approval banner should show the timeline
  // Skip during wizard mode - use demo data instead
  useEffect(() => {
    if (isWizardActive) return;

    const checkForActiveAutomation = async () => {
      if (!organizationId || !locationId) {
        setAutomationChecked(true);
        return;
      }

      try {
        const response = await fetchActiveAutomationJobs(
          organizationId,
          locationId,
        );

        if (response.success && response.data?.jobs?.length) {
          const activeJob = response.data.jobs[0];

          if (activeJob?.automationStatus) {
            // Set automation status
            setAutomationStatus(activeJob.automationStatus);

            // If automation is still in progress (not completed), set pending state
            // This includes 'awaiting_approval' status for client confirmation step
            const activeStatuses = [
              "pending",
              "processing",
              "awaiting_approval",
            ];
            if (activeStatuses.includes(activeJob.automationStatus.status)) {
              setReferralPending(true);
              setReferralData(null);
            }
          }
        }
      } catch (err) {
        logger.error("Error checking for active automation:", err);
      } finally {
        setAutomationChecked(true);
      }
    };

    checkForActiveAutomation();
  }, [organizationId, locationId, isWizardActive]); // Run when organizationId/locationId are available

  // Fetch automation status when processing is pending
  // Skip during wizard mode
  const loadAutomationStatus = useCallback(async () => {
    if (isWizardActive) {
      return;
    }

    if (!organizationId || !locationId) {
      setAutomationStatus(null);
      return;
    }

    try {
      const response = await fetchActiveAutomationJobs(
        organizationId,
        locationId,
      );

      if (response.success && response.data?.jobs?.length) {
        // Get the most recent active job for this domain
        const activeJob = response.data.jobs[0];

        if (activeJob?.automationStatus) {
          setAutomationStatus(activeJob.automationStatus);

          // If automation is complete, refresh referral data
          if (activeJob.automationStatus.status === "completed") {
            setReferralPending(false);
            loadReferralData();
          }

          // If automation reached client_approval, refresh key data so banner shows
          if (
            activeJob.automationStatus.status === "awaiting_approval" &&
            activeJob.automationStatus.currentStep === "client_approval"
          ) {
            loadKeyData({ silent: true });
          }
        }
      } else {
        // No active jobs found - automation might have completed.
        // If we previously had an active automation, it means it completed:
        // clear the automation status and refresh the referral data.
        if (automationStatus || referralPending) {
          setAutomationStatus(null);
          setReferralPending(false);
          // Refresh referral data after automation completion
          loadReferralData();
        } else {
          setAutomationStatus(null);
        }
      }
    } catch (err) {
      logger.error("Failed to fetch automation status:", err);
      setAutomationStatus(null);
    }
  }, [
    domain,
    organizationId,
    locationId,
    loadReferralData,
    loadKeyData,
    isWizardActive,
  ]);

  // Poll for automation status when referralPending is true OR when there's an active automation
  // This ensures real-time updates regardless of how the user got to this page
  // Uses sequential polling: wait for response, then wait 1 second before next request
  // Skip during wizard mode
  useEffect(() => {
    if (!domain || isWizardActive) return;

    // Define statuses that should trigger polling
    const activeStatuses = ["pending", "processing", "awaiting_approval"];

    // Steps where polling should NOT happen (nothing changes until user/admin acts)
    const noPollingSteps = ["client_approval"]; // Only skip polling for client_approval
    const noPollingStatuses = ["completed"]; // Don't poll when complete

    const isOnNonPollingStep =
      (automationStatus &&
        automationStatus.status === "awaiting_approval" &&
        noPollingSteps.includes(automationStatus.currentStep)) ||
      (automationStatus && noPollingStatuses.includes(automationStatus.status));

    const shouldPoll =
      !isOnNonPollingStep &&
      (referralPending ||
        (automationStatus && activeStatuses.includes(automationStatus.status)));

    if (!shouldPoll) {
      return;
    }

    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const pollSequentially = async () => {
      if (isCancelled) return;

      try {
        await loadAutomationStatus();
      } catch (err) {
        logger.error("Polling error:", err);
      }

      if (!isCancelled) {
        // Wait 5 seconds after response before next poll
        timeoutId = setTimeout(pollSequentially, 5000);
      }
    };

    // Start polling immediately
    pollSequentially();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    domain,
    referralPending,
    automationStatus?.status,
    loadAutomationStatus,
    isWizardActive,
  ]);

  // Background polling: Check for new automation jobs periodically
  // This catches cases where automation starts from admin panel while user is viewing page
  // Uses sequential polling: wait for response, then wait 10 seconds before next request
  // Skip during wizard mode
  useEffect(() => {
    if (!domain || isWizardActive || !organizationId || !locationId) return;

    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const checkForNewAutomation = async () => {
      if (isCancelled) return;

      try {
        const response = await fetchActiveAutomationJobs(
          organizationId,
          locationId,
        );

        if (response.success && response.data?.jobs?.length) {
          const activeJob = response.data.jobs[0];

          if (activeJob?.automationStatus) {
            const status = activeJob.automationStatus.status;
            const activeStatuses = [
              "pending",
              "processing",
              "awaiting_approval",
            ];

            // If we found an active automation that we weren't tracking, start tracking it
            if (activeStatuses.includes(status)) {
              setAutomationStatus(activeJob.automationStatus);

              // Set referralPending to trigger the faster polling
              if (!referralPending) {
                setReferralPending(true);
                setReferralData(null);
              }
            }
          }
        }
      } catch (err) {
        logger.error("Background automation check failed:", err);
      }

      if (!isCancelled) {
        // Wait 10 seconds after response before next background check
        timeoutId = setTimeout(checkForNewAutomation, 10000);
      }
    };

    // Start background polling after initial 10 second delay
    timeoutId = setTimeout(checkForNewAutomation, 10000);

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [domain, referralPending, isWizardActive]);

  // Fallback: Fetch automation status for specific job when client approval banner shows
  // but we don't have automation status from the active jobs endpoint
  // Skip during wizard mode
  useEffect(() => {
    if (isWizardActive) return;

    const fetchJobAutomationStatus = async () => {
      // Only run if:
      // 1. Client approval banner should be shown
      // 2. We don't already have automation status
      // 3. We have a valid latestJobId
      const shouldShowClientApproval =
        !isLoading &&
        latestJobIsApproved === true &&
        latestJobIsClientApproved !== true &&
        latestJobId !== null;

      if (!shouldShowClientApproval || automationStatus || !latestJobId) {
        return;
      }

      try {
        const response = await fetchAutomationStatus(latestJobId);

        if (response.success && response.data?.automationStatus) {
          setAutomationStatus(response.data.automationStatus);
        }
      } catch (err) {
        logger.error("Failed to fetch job automation status:", err);
      }
    };

    fetchJobAutomationStatus();
  }, [
    isLoading,
    latestJobIsApproved,
    latestJobIsClientApproved,
    latestJobId,
    automationStatus,
    isWizardActive,
  ]);

  return {
    connectionStatus,
    isLoading,
    keyDataLoaded,
    automationChecked,
    error,
    keyData,
    localProcessing,
    referralData,
    referralPending,
    automationStatus,
    storageKey,
    latestJobStatus,
    latestJobIsApproved,
    latestJobIsClientApproved,
    latestJobId,
    latestJobRaw,
    hasLatestJobRaw,
    loadKeyData,
    loadAutomationStatus,
    setReferralPending,
    setReferralData,
  };
}
