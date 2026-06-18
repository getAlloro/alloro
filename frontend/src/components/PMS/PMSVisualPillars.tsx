import React, { useCallback, useEffect, useMemo, useState } from "react";
import { showErrorToast, showSparkleToast } from "../../lib/toast";
import { useNavigate } from "react-router-dom";

import { updatePmsJobClientApproval } from "../../api/pms";
import type { ReferralEngineData } from "./ReferralMatrices";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../contexts/OnboardingWizardContext";
import { getPriorityItem } from "../../hooks/useLocalStorage";
import { derivePmsFocusPeriod } from "../../utils/pmsFocusPeriod";
import { buildDashboardAlerts } from "../../utils/dashboardAlerts";
import {
  useInvalidatePmsFileSurfaces,
  useRerunPmsInsights,
} from "../../hooks/queries/usePmsFileManagerQueries";
import { formatMonthLabel } from "./pmsVisualPillars.utils";
import { usePmsVisualPillars } from "./usePmsVisualPillars";
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

  // Wizard state
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();

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
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [, setIsConfirming] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isIngestionHighlighted, setIsIngestionHighlighted] = useState(false);

  // Reactive core: data-loading + automation polling (state, effects, loaders).
  // Lifted verbatim into a custom hook; hook order/deps/behavior are unchanged.
  const {
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
  } = usePmsVisualPillars({
    domain,
    organizationId,
    locationId,
    isWizardActive,
  });

  const allServicesConnected = connectionStatus.gbpConnected;
  const initialLoadComplete =
    isWizardActive || (keyDataLoaded && automationChecked);

  // Get user role for permission checks (sessionStorage for pilot mode, localStorage for normal)
  const userRole = getPriorityItem("user_role");
  const hasRolePermission = userRole === "admin" || userRole === "manager";
  // Can only upload PMS if user has role permission AND properties are connected (or wizard is active)
  const canUploadPMS = hasRolePermission && (hasProperties || isWizardActive);

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
  }, [
    latestJobId,
    loadKeyData,
    storageKey,
    setReferralPending,
    setReferralData,
  ]);

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
  }, [
    invalidatePmsFileSurfaces,
    loadKeyData,
    loadAutomationStatus,
    setReferralPending,
    setReferralData,
  ]);

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
  }, [
    locationId,
    rerunInsights,
    loadKeyData,
    loadAutomationStatus,
    setReferralPending,
    setReferralData,
  ]);

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
