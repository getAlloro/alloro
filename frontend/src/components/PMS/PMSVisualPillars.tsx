import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Lottie from "lottie-react";
import cogitatingSpinner from "../../assets/cogitating-spinner.json";
import { motion } from "framer-motion";
import { showSparkleToast } from "../../lib/toast";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lock,
  Settings,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  fetchPmsKeyData,
  fetchActiveAutomationJobs,
  fetchAutomationStatus,
  updatePmsJobClientApproval,
  type PmsKeyDataResponse,
  type AutomationStatusDetail,
} from "../../api/pms";
import { PMSLatestJobEditor } from "./PMSLatestJobEditor";
import { PMSUploadWizardModal } from "./PMSUploadWizardModal";
import { TemplateUploadModal } from "./TemplateUploadModal";
import { DirectUploadModal } from "./DirectUploadModal";
import { PMSManualEntryModal } from "./PMSManualEntryModal";
import type { ReferralEngineData } from "./ReferralMatrices";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../contexts/OnboardingWizardContext";
import { useLocationContext } from "../../contexts/locationContext";
import { apiGet } from "../../api";
import { getPriorityItem } from "../../hooks/useLocalStorage";
import { PmsDashboardSurface } from "./dashboard/PmsDashboardSurface";
import { PmsFileManager } from "./file-manager/PmsFileManager";
import { derivePmsFocusPeriod } from "../../utils/pmsFocusPeriod";

const COGITATING_PHRASES = [
  "Reading the leaves", "Turning over new leaves", "Tending the garden",
  "Pruning the branches", "Cultivating insights", "Planting seeds",
  "Watching things grow", "Raking through data", "Leafing through results",
  "Letting ideas bloom", "Branching out", "Nurturing the roots",
  "Gathering the harvest", "Sprouting new insights", "Tracing the veins",
  "Following the canopy", "Photosynthesizing", "Unfurling the fronds",
  "Sowing the metrics", "Tilling the numbers", "Training the vines",
  "Mapping the growth rings", "Distilling the nectar", "Shaking the branches",
];

function CogitatingText() {
  const [targetPhrase, setTargetPhrase] = useState(() =>
    COGITATING_PHRASES[Math.floor(Math.random() * COGITATING_PHRASES.length)]
  );
  const [displayed, setDisplayed] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    if (isTyping) {
      if (displayed.length < targetPhrase.length) {
        const t = setTimeout(
          () => setDisplayed(targetPhrase.slice(0, displayed.length + 1)),
          35
        );
        return () => clearTimeout(t);
      }
      const hold = setTimeout(() => setIsTyping(false), 1800);
      return () => clearTimeout(hold);
    }
    setTargetPhrase((prev) => {
      let next: string;
      do {
        next = COGITATING_PHRASES[Math.floor(Math.random() * COGITATING_PHRASES.length)];
      } while (next === prev);
      return next;
    });
    setDisplayed("");
    setIsTyping(true);
  }, [displayed, isTyping, targetPhrase]);

  return (
    <p className="font-semibold text-sm font-display">
      <span className="cogitating-gradient">{displayed}</span>
      <span className="inline-flex w-[1.5em] justify-start ml-[1px]">
        <span className="cogitating-dot" style={{ animationDelay: "0s" }}>.</span>
        <span className="cogitating-dot" style={{ animationDelay: "0.15s" }}>.</span>
        <span className="cogitating-dot" style={{ animationDelay: "0.3s" }}>.</span>
      </span>
    </p>
  );
}

interface PMSVisualPillarsProps {
  domain?: string;
  organizationId?: number | null;
  locationId?: number | null;
  locationName?: string | null;
  hasProperties?: boolean;
}

// Removed DEFAULT_DOMAIN - domain should always be provided by parent component
// to prevent race condition where wrong domain is used on initial render

const formatMonthLabel = (value: string): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
};

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

  const handleUploadWizardSuccess = useCallback(async () => {
    setShowUploadWizard(false);
    // Set pending state to show processing timeline
    setReferralPending(true);
    setReferralData(null);
    await loadKeyData({ silent: true });
    // Fetch automation status to show timeline progress
    await loadAutomationStatus();
  }, [loadKeyData, loadAutomationStatus]);

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
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F7F5F3]">
        <div className="text-center">
          <div className="relative flex items-center justify-center h-16 w-16 mx-auto mb-2">
            <div
              className="absolute inset-0 animate-spin rounded-full border-[3px] border-alloro-orange/15 border-t-alloro-orange"
              style={{ animationDuration: "1.2s" }}
            />
            <Lottie animationData={cogitatingSpinner} loop className="relative z-10 w-9 h-9" />
          </div>
          <CogitatingText />
        </div>
      </div>
    );
  }

  // Show setup required screen if not all services are connected
  if (!connectionStatus.isLoading && !allServicesConnected && !isWizardActive) {
    const disconnectedServices = [];
    if (!connectionStatus.gbpConnected) disconnectedServices.push("Business Profile");

    return (
      <div className="min-h-screen bg-[#F8FAFC] font-body text-alloro-navy flex flex-col items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          {/* Welcome header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-alloro-orange/10 rounded-full mb-4">
              <span className="w-2 h-2 bg-alloro-orange rounded-full animate-pulse"></span>
              <span className="text-xs font-bold text-alloro-orange uppercase tracking-wider">
                Setup Required
              </span>
            </div>
            <h1 className="font-display text-3xl font-medium text-alloro-navy tracking-tight mb-3">
              Let's Set Up Your Dashboard
            </h1>
            <p className="text-lg text-slate-500 font-medium">
              Complete these two steps to unlock your practice insights
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            {/* Step 1 - Connect Properties */}
            <div
              onClick={() => navigate("/settings/integrations")}
              className="group relative bg-white rounded-3xl border-2 border-alloro-orange shadow-xl shadow-alloro-orange/10 p-8 cursor-pointer hover:shadow-2xl hover:shadow-alloro-orange/20 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="flex items-start gap-6">
                {/* Step number */}
                <div className="shrink-0">
                  <div className="w-14 h-14 bg-gradient-to-br from-alloro-orange to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-alloro-orange/30 group-hover:scale-110 transition-transform">
                    <span className="text-2xl font-black text-white">1</span>
                  </div>
                </div>
                {/* Content */}
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-display text-xl font-medium text-alloro-navy tracking-tight">
                      Connect Your Google Business Profile
                    </h3>
                    <span className="px-2 py-1 bg-alloro-orange/10 text-alloro-orange text-[10px] font-black uppercase tracking-wider rounded-lg">
                      Required
                    </span>
                  </div>
                  <p className="text-slate-500 font-medium leading-relaxed mb-3">
                    Link your Google Business Profile to enable tracking and insights.
                  </p>
                  <p className="text-sm text-amber-600 font-semibold">
                    Missing: {disconnectedServices.join(", ")}
                  </p>
                  <div className="flex items-center gap-2 text-alloro-orange font-bold text-sm group-hover:gap-3 transition-all mt-3">
                    <Settings className="w-4 h-4" />
                    <span>Go to Settings</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
              {/* Decorative arrow */}
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center z-10">
                <ChevronDown className="w-4 h-4 text-slate-300" />
              </div>
            </div>

            {/* Step 2 - PMS Data (Locked) */}
            <div className="relative bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 p-8 opacity-60">
              <div className="flex items-start gap-6">
                {/* Step number */}
                <div className="shrink-0">
                  <div className="w-14 h-14 bg-slate-200 rounded-2xl flex items-center justify-center">
                    <span className="text-2xl font-black text-slate-400">2</span>
                  </div>
                </div>
                {/* Content */}
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-black text-slate-400 tracking-tight">
                      Upload Your PMS Data
                    </h3>
                    <span className="px-2 py-1 bg-slate-200 text-slate-400 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Locked
                    </span>
                  </div>
                  <p className="text-slate-400 font-medium leading-relaxed">
                    Once properties are connected, upload your practice management
                    data to see referral analytics and revenue attribution.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Help text */}
          <p className="text-center text-sm text-slate-400 mt-8">
            Need help?{" "}
            <a
              href="mailto:support@alloro.io"
              className="text-alloro-orange font-semibold hover:underline"
            >
              Contact Support
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pm-light min-h-screen bg-[var(--color-pm-bg-primary)] font-body text-alloro-navy">
      <main className="mx-auto w-full max-w-[1320px] space-y-4 px-4 pb-6 sm:px-6 lg:px-8">
        {/* Upload nudge — shown when PMS data is stale */}
        {!isLoading && !error && keyData && focusPeriod.isStale && (
          <section className="flex flex-col gap-4 rounded-[14px] border border-[#E8E4DD] bg-[#FDFDFD] px-6 py-5 shadow-[0_14px_35px_rgba(17,21,28,0.06)] md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-orange">
                Ready for the next focus?
              </div>
              <h3 className="font-display text-[22px] font-medium tracking-tight text-[#1A1A1A]">
                {focusPeriod.nudgeTitle}
              </h3>
              <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-[#6B7280]">
                {focusPeriod.nudgeBody}
              </p>
            </div>
            <button
              type="button"
              onClick={scrollToIngestionHub}
              className="inline-flex items-center justify-center rounded-full bg-alloro-orange px-5 py-3 text-[12px] font-bold uppercase tracking-[0.12em] text-white shadow-[0_8px_20px_rgba(214,104,83,0.28)] transition-all hover:-translate-y-px hover:bg-[#B86650]"
            >
              Upload PMS data
            </button>
          </section>
        )}

        {/* Client Approval Banner */}
        {showClientApprovalBanner && (
          <motion.div
            id="client-approval-banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4 rounded-2xl border border-alloro-orange/20 bg-alloro-orange/5 p-6 sm:flex-row sm:items-center sm:justify-between shadow-premium transition-all duration-300"
          >
            <div className="flex-1 space-y-1">
              <div className="font-bold text-alloro-navy text-base">
                Your PMS data is processed.
              </div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">
                Review the latest results and confirm once everything looks
                good.
              </div>
              {bannerError && (
                <div className="flex items-center gap-2 text-xs text-red-600 mt-2">
                  <AlertCircle className="h-4 w-4" />
                  {bannerError}
                </div>
              )}
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setIsEditorOpen(true)}
                disabled={latestJobId == null || !hasLatestJobRaw}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-alloro-orange bg-white px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-alloro-orange transition hover:bg-alloro-orange/5 disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirm and get insights
              </button>
            </div>
          </motion.div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm shadow-premium"
          >
            <div className="p-2 bg-red-100 rounded-xl">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="font-bold text-red-800">
                Unable to retrieve PMS data.
              </p>
              <p className="text-[10px] text-red-600 font-semibold uppercase tracking-widest mt-0.5">
                {error}
              </p>
            </div>
          </motion.div>
        )}

      </main>

      {!error && (keyData || isWizardActive || showDashboardProcessingStatus) && (
        <PmsDashboardSurface
          monthlyData={monthlyData}
          topSources={topSources}
          totalProduction={totalProduction}
          totalReferrals={totalReferrals}
          doctorReferralCount={doctorReferralCount}
          doctorPercentage={doctorPercentage}
          referralData={effectiveReferralData}
          isLoading={isLoading}
          isProcessingInsights={showDashboardProcessingStatus}
          isWizardActive={isWizardActive}
          canUploadPMS={canUploadPMS}
          hasProperties={hasProperties}
          isIngestionHighlighted={isIngestionHighlighted}
          canOpenDataManager={Boolean(organizationId && locationId)}
          onOpenManualEntry={() => {
            if (locationId) {
              setManualEntryTargetMonth(null);
              setShowManualEntry(true);
            }
          }}
          onOpenDataManager={() => {
            setFileManagerInitialMonth(null);
            setShowFileManager(true);
          }}
          onSelectDataMonth={(month) => {
            setFileManagerInitialMonth(month);
            setShowFileManager(true);
          }}
          onOpenSettings={() => navigate('/settings/integrations')}
        />
      )}

      {organizationId && locationId && (
        <PmsFileManager
          organizationId={organizationId}
          locationId={locationId}
          locationName={locationName}
          canManage={hasRolePermission}
          isProcessing={showDashboardProcessingStatus || localProcessing || referralPending}
          isOpen={showFileManager}
          initialMonth={fileManagerInitialMonth}
          onClose={() => {
            setShowFileManager(false);
            setFileManagerInitialMonth(null);
          }}
          onUploadClick={(targetMonth) => {
            setShowFileManager(false);
            setFileManagerInitialMonth(null);
            setManualEntryTargetMonth(targetMonth ?? null);
            setShowManualEntry(true);
          }}
          onDataChanged={handleUploadWizardSuccess}
        />
      )}


      {latestJobId && hasLatestJobRaw && (
        <PMSLatestJobEditor
          isOpen={isEditorOpen}
          jobId={latestJobId}
          initialData={latestJobRaw}
          onClose={() => setIsEditorOpen(false)}
          onSaved={handleEditorSaved}
          onConfirmApproval={handleConfirmApproval}
        />
      )}

      {/* Upload Wizard Modal - for "Not sure?" flow */}
      <PMSUploadWizardModal
        isOpen={showUploadWizard}
        onClose={() => setShowUploadWizard(false)}
        clientId={domain || ""}
        locationId={locationId}
        onSuccess={handleUploadWizardSuccess}
      />

      {/* Template Upload Modal */}
      <TemplateUploadModal
        isOpen={showTemplateUpload}
        onClose={() => setShowTemplateUpload(false)}
        clientId={domain || ""}
        locationId={locationId}
        onSuccess={handleUploadWizardSuccess}
      />

      {/* Direct Upload Modal */}
      <DirectUploadModal
        isOpen={showDirectUpload}
        onClose={() => setShowDirectUpload(false)}
        clientId={domain || ""}
        locationId={locationId}
        onSuccess={handleUploadWizardSuccess}
      />

      {/* Manual Entry Modal */}
      <PMSManualEntryModal
        isOpen={showManualEntry}
        onClose={() => {
          setShowManualEntry(false);
          setManualEntryTargetMonth(null);
        }}
        clientId={domain || ""}
        locationId={locationId}
        locationName={locationName}
        targetMonth={manualEntryTargetMonth}
        onSuccess={handleUploadWizardSuccess}
      />
    </div>
  );
};
