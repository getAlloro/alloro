import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { showErrorToast, showSparkleToast } from "../../lib/toast";
import { useNavigate } from "react-router-dom";

import {
  fetchPmsKeyData,
  fetchActiveAutomationJobs,
  fetchAutomationStatus,
  updatePmsJobClientApproval,
  type PmsKeyDataResponse,
  type AutomationStatusDetail,
} from "../../api/pms";
import type { ReferralEngineData } from "./ReferralMatrices";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../contexts/OnboardingWizardContext";
import { useLocationContext } from "../../contexts/locationContext";
import { apiGet } from "../../api";
import { getPriorityItem } from "../../hooks/useLocalStorage";
import { derivePmsFocusPeriod } from "../../utils/pmsFocusPeriod";
import { buildDashboardAlerts } from "../../utils/dashboardAlerts";
import {
  useInvalidatePmsFileSurfaces,
  useRerunPmsInsights,
} from "../../hooks/queries/usePmsFileManagerQueries";
import { formatMonthLabel } from "./pmsVisualPillars.utils";
import type { PMSVisualPillarsProps } from "./pmsVisualPillars.types";
import { PMSVisualPillarsLoadingState } from "./PMSVisualPillars/PMSVisualPillarsLoadingState";
import { PMSVisualPillarsSetupRequired } from "./PMSVisualPillars/PMSVisualPillarsSetupRequired";
import { PMSVisualPillarsContent } from "./PMSVisualPillars/PMSVisualPillarsContent";
import { PMSVisualPillarsModals } from "./PMSVisualPillars/PMSVisualPillarsModals";

// Removed DEFAULT_DOMAIN - domain should always be provided by parent component
// to prevent race condition where wrong domain is used on initial render

// Temporarily hidden - Practice Diagnosis section
// const DiagnosisBlock = ({ title, desc }: { title: string; desc: string }) => (
//   <div>
//     <h4 className="text-[10px] font-bold text-alloro-teal mb-1.5 uppercase tracking-widest leading-none">
//       {title}
//     </h4>
//     <p className="text-[13px] text-blue-100/60 leading-relaxed font-medium tracking-tight">
//       {desc}
//     </p>
//   </div>
// );

export const PMSVisualPillars: React.FC<PMSVisualPillarsProps> = ({
  domain,
  organizationId,
  locationId,
  locationName,
  hasProperties = true,
}) => {
  const navigate = useNavigate();
  const { signalContentReady } = useLocationContext();

  // Wizard state
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();

  // Connection status state - track if GBP is connected
  const [connectionStatus, setConnectionStatus] = useState<{
    gbpConnected: boolean;
    isLoading: boolean;
  }>({
    gbpConnected: false,
    isLoading: true,
  });

  const allServicesConnected = connectionStatus.gbpConnected;

  const [showUploadWizard, setShowUploadWizard] = useState(false);
  const [showTemplateUpload, setShowTemplateUpload] = useState(false);
  const [showDirectUpload, setShowDirectUpload] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showFileManager, setShowFileManager] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [fileManagerInitialMonth, setFileManagerInitialMonth] = useState<
    string | null
  >(null);
  const [manualEntryTargetMonth, setManualEntryTargetMonth] = useState<
    string | null
  >(null);
  // Start with loading false if wizard is active (we'll show demo data immediately)
  const [isLoading, setIsLoading] = useState(!isWizardActive);
  const [keyDataLoaded, setKeyDataLoaded] = useState(false);
  const [automationChecked, setAutomationChecked] = useState(false);
  const initialLoadComplete = isWizardActive || (keyDataLoaded && automationChecked);
  const [error, setError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [keyData, setKeyData] = useState<PmsKeyDataResponse["data"] | null>(
    null,
  );
  const [localProcessing, setLocalProcessing] = useState(false);
  const [, setIsConfirming] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isIngestionHighlighted, setIsIngestionHighlighted] = useState(false);

  // Referral Engine data state
  const [referralData, setReferralData] = useState<ReferralEngineData | null>(
    null,
  );
  const [referralPending, setReferralPending] = useState(false);
  const [automationStatus, setAutomationStatus] =
    useState<AutomationStatusDetail | null>(null);

  // Get user role for permission checks (sessionStorage for pilot mode, localStorage for normal)
  const userRole = getPriorityItem("user_role");
  const hasRolePermission = userRole === "admin" || userRole === "manager";
  // Can only upload PMS if user has role permission AND properties are connected (or wizard is active)
  const canUploadPMS = hasRolePermission && (hasProperties || isWizardActive);

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
        const response = await fetchPmsKeyData(organizationId, locationId);

        if (!isMountedRef.current) {
          return;
        }

        if (response?.success && response.data) {
          // Only log if not silent mode (to reduce console noise during polling)
          if (!silent) {
            console.log("📊 loadKeyData response:", {
              organizationId,
              monthsCount: response.data.months?.length,
              sourcesCount: response.data.sources?.length,
              stats: response.data.stats,
              months: response.data.months,
              sources: response.data.sources,
            });
          }
          setKeyData(response.data);
        } else {
          setKeyData(null);
          setError(
            response?.error ||
              response?.message ||
              "Unable to load PMS visual pillars.",
          );
        }
      } catch (err) {
        if (!isMountedRef.current) {
          return;
        }

        setKeyData(null);
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load PMS visual pillars.";
        setError(message);
      } finally {
        if (isMountedRef.current && !silent) {
          setIsLoading(false);
        }
        setKeyDataLoaded(true);
        signalContentReady();
      }
    },
    [organizationId, locationId, isWizardActive],
  );

  useEffect(() => {
    isMountedRef.current = true;
    console.log("🎯 Initial component mount - loading key data for first time");
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
        console.error("Failed to fetch connection status:", err);
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
      const response = await fetch(
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
      console.error("Failed to fetch referral engine data:", err);
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

      console.log("🔍 Initial check for active automation on mount");

      try {
        const response = await fetchActiveAutomationJobs(organizationId, locationId);

        if (response.success && response.data?.jobs?.length) {
          const activeJob = response.data.jobs[0];
          console.log("🔍 Found active job on mount:", {
            jobId: activeJob.jobId,
            status: activeJob.automationStatus?.status,
            currentStep: activeJob.automationStatus?.currentStep,
          });

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
              console.log(
                "🔍 Setting referralPending = true for active automation",
              );
              setReferralPending(true);
              setReferralData(null);
            }
          }
        } else {
          console.log("🔍 No active automation found on mount");
        }
      } catch (err) {
        console.error("❌ Error checking for active automation:", err);
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
      console.log("🔍 loadAutomationStatus: no organizationId or locationId");
      setAutomationStatus(null);
      return;
    }

    console.log("🔍 loadAutomationStatus: fetching for org", organizationId);

    try {
      const response = await fetchActiveAutomationJobs(organizationId, locationId);

      console.log("🔍 fetchActiveAutomationJobs response:", {
        success: response.success,
        jobCount: response.data?.jobs?.length,
        jobs: response.data?.jobs,
      });

      if (response.success && response.data?.jobs?.length) {
        // Get the most recent active job for this domain
        const activeJob = response.data.jobs[0];
        console.log("🔍 Active job found:", {
          jobId: activeJob.jobId,
          status: activeJob.automationStatus?.status,
          currentStep: activeJob.automationStatus?.currentStep,
        });

        if (activeJob?.automationStatus) {
          setAutomationStatus(activeJob.automationStatus);

          // If automation is complete, refresh referral data
          if (activeJob.automationStatus.status === "completed") {
            console.log("🔍 Automation completed, refreshing referral data");
            setReferralPending(false);
            loadReferralData();
          }

          // If automation reached client_approval, refresh key data so banner shows
          if (
            activeJob.automationStatus.status === "awaiting_approval" &&
            activeJob.automationStatus.currentStep === "client_approval"
          ) {
            console.log(
              "🔍 Automation reached client_approval, refreshing key data for banner",
            );
            loadKeyData({ silent: true });
          }
        }
      } else {
        // No active jobs found - automation might have completed
        console.log("🔍 No active jobs found, automation may have completed");

        // If we previously had an active automation, it means it completed
        // Clear the automation status and refresh the referral data
        if (automationStatus || referralPending) {
          console.log(
            "🔍 Clearing automation state and refreshing data after completion",
          );
          setAutomationStatus(null);
          setReferralPending(false);
          // Refresh referral data after automation completion
          loadReferralData();
        } else {
          setAutomationStatus(null);
        }
      }
    } catch (err) {
      console.error("❌ Failed to fetch automation status:", err);
      setAutomationStatus(null);
    }
  }, [domain, organizationId, locationId, loadReferralData, loadKeyData, isWizardActive]);

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
      if (isOnNonPollingStep) {
        if (automationStatus?.status === "completed") {
          console.log(`⏸️ Polling DISABLED - automation completed`);
        } else {
          console.log(
            `⏸️ Polling DISABLED - on ${automationStatus?.currentStep} (approval step)`,
          );
        }
      }
      return;
    }

    console.log(
      `▶️ Polling ENABLED - referralPending: ${referralPending}, status: ${automationStatus?.status}, step: ${automationStatus?.currentStep}`,
    );

    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const pollSequentially = async () => {
      if (isCancelled) return;

      try {
        await loadAutomationStatus();
      } catch (err) {
        console.error("Polling error:", err);
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
  }, [domain, referralPending, automationStatus?.status, loadAutomationStatus, isWizardActive]);

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
        const response = await fetchActiveAutomationJobs(organizationId, locationId);

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
        console.error("Background automation check failed:", err);
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

      console.log("🔍 Fetching automation status for job", latestJobId);

      try {
        const response = await fetchAutomationStatus(latestJobId);

        if (response.success && response.data?.automationStatus) {
          console.log("🔍 Got automation status for job:", {
            jobId: latestJobId,
            status: response.data.automationStatus.status,
            currentStep: response.data.automationStatus.currentStep,
          });
          setAutomationStatus(response.data.automationStatus);
        }
      } catch (err) {
        console.error("❌ Failed to fetch job automation status:", err);
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

  // Demo data for wizard mode - Referral Velocity
  const wizardMonthlyData = useMemo(() => {
    const demoData = wizardDemoData?.referralData?.monthlyData;
    if (!demoData) {
      // Fallback demo data
      return [
        { month: "Jan", selfReferrals: 12, doctorReferrals: 8, total: 20, totalReferrals: 20, productionTotal: 24000 },
        { month: "Feb", selfReferrals: 15, doctorReferrals: 10, total: 25, totalReferrals: 25, productionTotal: 30000 },
        { month: "Mar", selfReferrals: 18, doctorReferrals: 12, total: 30, totalReferrals: 30, productionTotal: 36000 },
        { month: "Apr", selfReferrals: 14, doctorReferrals: 11, total: 25, totalReferrals: 25, productionTotal: 30000 },
        { month: "May", selfReferrals: 20, doctorReferrals: 14, total: 34, totalReferrals: 34, productionTotal: 40000 },
        { month: "Jun", selfReferrals: 22, doctorReferrals: 13, total: 35, totalReferrals: 35, productionTotal: 42000 },
      ];
    }
    return demoData.map((m) => ({
      month: m.month,
      selfReferrals: m.marketing,
      doctorReferrals: m.doctor,
      total: m.marketing + m.doctor,
      totalReferrals: m.marketing + m.doctor,
      productionTotal: (m.marketing + m.doctor) * 1200,
    }));
  }, [wizardDemoData]);

  // Demo data for wizard mode - Referral Engine / Intelligence Hub
  const wizardReferralEngineData = useMemo((): ReferralEngineData => {
    return {
      observed_period: {
        start_date: "2025-01-01",
        end_date: "2025-06-30",
      },
      executive_summary: [
        "Marketing referrals show strong growth trajectory",
        "Doctor referral network expanding steadily",
        "Overall conversion rates above industry average",
      ],
      doctor_referral_matrix: [
        { referrer_name: "Dr. Sarah Johnson", referred: 12, pct_scheduled: 92, pct_examined: 85, pct_started: 75, net_production: 18500, trend_label: "increasing" },
        { referrer_name: "Dr. Michael Chen", referred: 8, pct_scheduled: 88, pct_examined: 80, pct_started: 70, net_production: 12000, trend_label: "stable" },
        { referrer_name: "Dr. Emily Davis", referred: 6, pct_scheduled: 95, pct_examined: 90, pct_started: 82, net_production: 10800, trend_label: "new" },
        { referrer_name: "Dr. Robert Wilson", referred: 5, pct_scheduled: 80, pct_examined: 75, pct_started: 65, net_production: 7500, trend_label: "decreasing" },
      ],
      non_doctor_referral_matrix: [
        { source_label: "Google Search", source_type: "digital", referred: 35, pct_scheduled: 78, pct_examined: 70, pct_started: 58, net_production: 42000, trend_label: "increasing" },
        { source_label: "Patient Referral", source_type: "patient", referred: 28, pct_scheduled: 95, pct_examined: 90, pct_started: 85, net_production: 52000, trend_label: "increasing" },
        { source_label: "Facebook Ads", source_type: "digital", referred: 18, pct_scheduled: 65, pct_examined: 55, pct_started: 45, net_production: 18000, trend_label: "stable" },
        { source_label: "Website Direct", source_type: "digital", referred: 14, pct_scheduled: 72, pct_examined: 65, pct_started: 55, net_production: 16800, trend_label: "new" },
      ],
      growth_opportunity_summary: {
        top_three_fixes: [
          "Increase follow-up on Google Search leads to improve conversion",
          "Implement patient referral program incentives",
          "Optimize Facebook ad targeting for higher quality leads",
        ],
        estimated_additional_annual_revenue: 45000,
      },
    };
  }, []);

  const monthlyData = useMemo(() => {
    // Use wizard demo data if wizard is active and no real data
    if (isWizardActive && !keyData?.months?.length) {
      return wizardMonthlyData;
    }

    if (!keyData?.months?.length) {
      return [];
    }

    return keyData.months.map((month) => {
      const selfReferrals = Number(month.selfReferrals ?? 0);
      const doctorReferrals = Number(month.doctorReferrals ?? 0);
      const totalReferrals = Number(month.totalReferrals ?? 0);
      const productionTotal = Number(
        month.actualProductionTotal ?? month.productionTotal ?? 0
      );
      const attributedProductionTotal = Number(
        month.attributedProductionTotal ?? month.productionTotal ?? 0
      );

      return {
        month: formatMonthLabel(month.month),
        selfReferrals,
        doctorReferrals,
        total: totalReferrals || selfReferrals + doctorReferrals,
        totalReferrals: totalReferrals || selfReferrals + doctorReferrals,
        productionTotal,
        actualProductionTotal: productionTotal,
        attributedProductionTotal,
      };
    });
  }, [keyData, isWizardActive, wizardMonthlyData]);

  // Effective referral data - use wizard demo data if wizard is active and no real data
  const effectiveReferralData = useMemo(() => {
    if (isWizardActive && !referralData) {
      return wizardReferralEngineData;
    }
    return referralData;
  }, [isWizardActive, referralData, wizardReferralEngineData]);

  // Temporarily unused - Data Confidence card removed
  // const monthCount = keyData?.stats?.distinctMonths ?? 0;

  // Calculate total production from sources
  // Use wizard demo data for topSources when wizard is active and no real source data
  const topSources = (keyData?.sources?.length ? keyData.sources : null)
    ?? (isWizardActive ? wizardDemoData?.pmsTopSources ?? [] : []);

  const focusPeriod = useMemo(
    () => derivePmsFocusPeriod(keyData?.months, new Date()),
    [keyData?.months],
  );

  const totalProduction = useMemo(() => {
    const realProduction = topSources.reduce((sum, s) => sum + (s.production || 0), 0);
    // Use wizard demo data if wizard is active and no real production data
    if (isWizardActive && realProduction === 0) {
      return wizardDemoData?.referralData?.keyData?.mktProduction ?? 89000;
    }
    return realProduction;
  }, [topSources, isWizardActive, wizardDemoData]);

  const totalReferrals = useMemo(() => {
    return monthlyData.reduce((sum, m) => sum + m.totalReferrals, 0);
  }, [monthlyData]);

  // Temporarily unused - Practice Diagnosis hidden
  // const selfReferralCount = useMemo(() => {
  //   return monthlyData.reduce((sum, m) => sum + m.selfReferrals, 0);
  // }, [monthlyData]);

  const doctorReferralCount = useMemo(() => {
    return monthlyData.reduce((sum, m) => sum + m.doctorReferrals, 0);
  }, [monthlyData]);

  // Temporarily unused - Practice Diagnosis hidden
  // const marketingCapture =
  //   totalReferrals > 0
  //     ? Math.round((selfReferralCount / totalReferrals) * 100)
  //     : 0;

  const doctorPercentage = useMemo(() => {
    if (totalReferrals > 0) {
      return Math.round((doctorReferralCount / totalReferrals) * 100);
    }
    // Fallback for wizard mode when no real data
    if (isWizardActive) {
      const demoKeyData = wizardDemoData?.referralData?.keyData;
      if (demoKeyData) {
        const total = (demoKeyData.mktProduction ?? 0) + (demoKeyData.docProduction ?? 0);
        if (total > 0) {
          return Math.round(((demoKeyData.docProduction ?? 0) / total) * 100);
        }
      }
      return 43; // Fallback percentage
    }
    return 0;
  }, [totalReferrals, doctorReferralCount, isWizardActive, wizardDemoData]);

  // Debug: Log calculated data only on change (not on every render)
  useMemo(() => {
    console.log("📈 Calculated data:", {
      monthlyData: monthlyData,
      topSources: topSources,
      totalProduction: totalProduction,
      totalReferrals: totalReferrals,
      doctorReferralCount: doctorReferralCount,
      doctorPercentage: doctorPercentage,
      mktProduction: totalProduction,
      docProduction: (totalProduction * doctorPercentage) / 100,
    });
    console.log("🔍 Data source breakdown:", {
      "referralVelocity.selfReferrals": monthlyData.map((m) => ({
        month: m.month,
        selfReferrals: m.selfReferrals,
      })),
      "referralVelocity.doctorReferrals": monthlyData.map((m) => ({
        month: m.month,
        doctorReferrals: m.doctorReferrals,
      })),
      "productionCards.topSources": topSources.map((s) => ({
        name: s.name,
        production: s.production,
      })),
      "productionCards.totalProduction": totalProduction,
      "productionCards.doctorPercentage": doctorPercentage,
    });
  }, [
    monthlyData,
    topSources,
    totalProduction,
    totalReferrals,
    doctorReferralCount,
    doctorPercentage,
  ]);

  const showClientApprovalBanner =
    !isLoading &&
    latestJobIsApproved === true &&
    latestJobIsClientApproved !== true &&
    latestJobId !== null;

  // Only show processing notice if:
  // 1. Not loading
  // 2. Not showing client approval banner
  // 3. There's actually a job that exists (latestJobId is not null)
  // 4. Either localProcessing is true OR job status is pending
  // 5. The job is not yet admin approved (otherwise client approval banner shows)
  const showProcessingNotice =
    !isLoading &&
    !showClientApprovalBanner &&
    latestJobId !== null &&
    latestJobIsApproved !== true &&
    (localProcessing || latestJobStatus?.toLowerCase() === "pending");

  const isAutomationAwaitingClientApproval =
    automationStatus?.status === "awaiting_approval" &&
    automationStatus.currentStep === "client_approval";

  const isAutomationRunning =
    Boolean(automationStatus) &&
    automationStatus?.status !== "completed" &&
    !isAutomationAwaitingClientApproval;

  const showDashboardProcessingStatus =
    !isWizardActive &&
    !isLoading &&
    !showClientApprovalBanner &&
    !isAutomationAwaitingClientApproval &&
    (showProcessingNotice || referralPending || isAutomationRunning);

  // Auto-open disabled - user requested manual control
  // useEffect(() => {
  //   if (showClientApprovalBanner && hasLatestJobRaw && latestJobId) {
  //     setIsEditorOpen(true);
  //   }
  // }, [showClientApprovalBanner, hasLatestJobRaw, latestJobId]);

  const handleConfirmApproval = useCallback(async () => {
    if (!latestJobId) {
      return;
    }

    console.log(
      "✅ handleConfirmApproval called with latestJobId:",
      latestJobId,
    );
    console.log("📊 Current state BEFORE confirmation:", {
      keyData_months: keyData?.months,
      keyData_sources: keyData?.sources,
      monthlyData: monthlyData,
      totalProduction: totalProduction,
      doctorPercentage: doctorPercentage,
      totalReferrals: totalReferrals,
    });

    setIsConfirming(true);
    setBannerError(null);

    // Immediately set pending state to hide stale data
    // This shows "Generating Your Attribution Matrix" right away
    setReferralPending(true);
    setReferralData(null);

    try {
      await updatePmsJobClientApproval(latestJobId, true);

      showSparkleToast(
        "Perfect!",
        "We're now setting up your summary and action items for this month",
      );

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(storageKey);
      }

      console.log(
        "🔄 Calling loadKeyData AFTER confirmation (with silent: false to see fresh data)",
      );
      await loadKeyData({ silent: false });

      // Don't refetch referral data immediately - it will return pending anyway
      // The user will see the "Generating" state until they refresh
      // or until we implement polling
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to confirm PMS data approval.";
      setBannerError(message);
      // Reset pending state on error
      setReferralPending(false);
    } finally {
      setIsConfirming(false);
    }
  }, [latestJobId, loadKeyData, storageKey]);

  const handleEditorSaved = useCallback(async () => {
    setIsEditorOpen(false);
    await loadKeyData();
  }, [loadKeyData]);

  const invalidatePmsFileSurfaces = useInvalidatePmsFileSurfaces(
    organizationId ?? null,
    locationId ?? null,
  );

  const handleUploadWizardSuccess = useCallback(async () => {
    setShowUploadWizard(false);
    // Set pending state to show processing timeline
    setReferralPending(true);
    setReferralData(null);
    // The file-manager panel can stay open behind the entry modal now, so
    // refresh its month grid / job list along with the key data.
    invalidatePmsFileSurfaces();
    await loadKeyData({ silent: true });
    // Fetch automation status to show timeline progress
    await loadAutomationStatus();
  }, [invalidatePmsFileSurfaces, loadKeyData, loadAutomationStatus]);

  const rerunInsights = useRerunPmsInsights(
    organizationId ?? null,
    locationId ?? null,
  );

  // Edit/delete no longer auto-rerun. This just refreshes key data so the
  // "Updated data detected" alert can surface — no processing state is set.
  const handleDataEdited = useCallback(async () => {
    await loadKeyData({ silent: true });
  }, [loadKeyData]);

  // "Get updated insights" CTA: start the rerun and immediately show the
  // animated processing card (mirrors handleConfirmApproval).
  const handleGetUpdatedInsights = useCallback(async () => {
    if (!locationId) return;
    setReferralPending(true);
    setReferralData(null);
    try {
      const response = await rerunInsights.mutateAsync();
      if (!response.success) {
        setReferralPending(false);
        showErrorToast(
          "Couldn't refresh insights",
          response.error || "Please try again.",
        );
        return;
      }
      showSparkleToast(
        "Refreshing insights",
        "We're re-running the analysis with your latest data.",
      );
      await loadKeyData({ silent: true });
      await loadAutomationStatus();
    } catch {
      setReferralPending(false);
      showErrorToast("Couldn't refresh insights", "Please try again.");
    }
  }, [locationId, rerunInsights, loadKeyData, loadAutomationStatus]);

  // Scroll to Data Ingestion Hub section with highlight animation
  const scrollToIngestionHub = useCallback(() => {
    const ingestionSection = document.getElementById("data-ingestion-hub");
    if (ingestionSection) {
      ingestionSection.scrollIntoView({ behavior: "smooth" });
      // Trigger highlight animation after short delay
      setTimeout(() => {
        setIsIngestionHighlighted(true);
        // Remove highlight after 700ms
        setTimeout(() => {
          setIsIngestionHighlighted(false);
        }, 700);
      }, 200);
    }
  }, []);

  // Check for scroll-to-upload flag from sessionStorage (set by PMSUploadBanner)
  useEffect(() => {
    const shouldScroll = sessionStorage.getItem("scrollToUpload");
    if (shouldScroll === "true") {
      sessionStorage.removeItem("scrollToUpload");
      // Delay to ensure component is fully rendered
      setTimeout(() => {
        scrollToIngestionHub();
      }, 500);
    }
  }, [scrollToIngestionHub]);

  if (!initialLoadComplete) {
    return <PMSVisualPillarsLoadingState />;
  }

  // Show setup required screen if not all services are connected
  if (!connectionStatus.isLoading && !allServicesConnected && !isWizardActive) {
    return (
      <PMSVisualPillarsSetupRequired
        gbpConnected={connectionStatus.gbpConnected}
        onNavigateToIntegrations={() => navigate("/settings/integrations")}
      />
    );
  }

  const insightsStale = Boolean(keyData?.stats?.insightsStale);
  const dashboardAlerts = buildDashboardAlerts({
    // Hidden while a run is processing — the processing card owns that state.
    insightsStale: insightsStale && !showDashboardProcessingStatus,
    focusPeriod,
    actions: {
      getUpdatedInsights: {
        onClick: handleGetUpdatedInsights,
        loading: rerunInsights.isPending || referralPending,
      },
      uploadData: { onClick: scrollToIngestionHub },
    },
  });

  return (
    <div className="pm-light min-h-screen bg-alloro-bg font-body text-alloro-navy">
      <PMSVisualPillarsContent
        isLoading={isLoading}
        error={error}
        keyData={keyData}
        dashboardAlerts={dashboardAlerts}
        showClientApprovalBanner={showClientApprovalBanner}
        bannerError={bannerError}
        setIsEditorOpen={setIsEditorOpen}
        latestJobId={latestJobId}
        hasLatestJobRaw={hasLatestJobRaw}
        isWizardActive={isWizardActive}
        showDashboardProcessingStatus={showDashboardProcessingStatus}
        monthlyData={monthlyData}
        topSources={topSources}
        totalProduction={totalProduction}
        totalReferrals={totalReferrals}
        doctorReferralCount={doctorReferralCount}
        doctorPercentage={doctorPercentage}
        effectiveReferralData={effectiveReferralData}
        canUploadPMS={canUploadPMS}
        hasProperties={hasProperties}
        isIngestionHighlighted={isIngestionHighlighted}
        organizationId={organizationId}
        locationId={locationId}
        setManualEntryTargetMonth={setManualEntryTargetMonth}
        setShowManualEntry={setShowManualEntry}
        setFileManagerInitialMonth={setFileManagerInitialMonth}
        setShowFileManager={setShowFileManager}
        setShowCompare={setShowCompare}
        navigate={navigate}
      />

      <PMSVisualPillarsModals
        organizationId={organizationId}
        locationId={locationId}
        locationName={locationName}
        domain={domain}
        hasRolePermission={hasRolePermission}
        showDashboardProcessingStatus={showDashboardProcessingStatus}
        localProcessing={localProcessing}
        referralPending={referralPending}
        showFileManager={showFileManager}
        fileManagerInitialMonth={fileManagerInitialMonth}
        setShowFileManager={setShowFileManager}
        setFileManagerInitialMonth={setFileManagerInitialMonth}
        setManualEntryTargetMonth={setManualEntryTargetMonth}
        setShowManualEntry={setShowManualEntry}
        handleDataEdited={handleDataEdited}
        latestJobId={latestJobId}
        hasLatestJobRaw={hasLatestJobRaw}
        isEditorOpen={isEditorOpen}
        latestJobRaw={latestJobRaw}
        setIsEditorOpen={setIsEditorOpen}
        handleEditorSaved={handleEditorSaved}
        handleConfirmApproval={handleConfirmApproval}
        showUploadWizard={showUploadWizard}
        setShowUploadWizard={setShowUploadWizard}
        handleUploadWizardSuccess={handleUploadWizardSuccess}
        showTemplateUpload={showTemplateUpload}
        setShowTemplateUpload={setShowTemplateUpload}
        showDirectUpload={showDirectUpload}
        setShowDirectUpload={setShowDirectUpload}
        showCompare={showCompare}
        setShowCompare={setShowCompare}
        months={keyData?.months ?? []}
        showManualEntry={showManualEntry}
        manualEntryTargetMonth={manualEntryTargetMonth}
      />
    </div>
  );
};
