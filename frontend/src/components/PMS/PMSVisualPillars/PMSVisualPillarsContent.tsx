import React from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { PmsHubSurface } from "../dashboard/PmsHubSurface";
import { DashboardAlertStack } from "../../dashboard/alerts/DashboardAlertStack";
import type { PmsKeyDataResponse } from "../../../api/pms";
import { usePmsCopy } from "../pmsCopy";

type PmsHubSurfaceProps = React.ComponentProps<typeof PmsHubSurface>;
type DashboardAlerts = React.ComponentProps<typeof DashboardAlertStack>["alerts"];

interface PMSVisualPillarsContentProps {
  isLoading: boolean;
  error: string | null;
  keyData: PmsKeyDataResponse["data"] | null;
  dashboardAlerts: DashboardAlerts;
  showClientApprovalBanner: boolean;
  bannerError: string | null;
  setIsEditorOpen: (value: boolean) => void;
  latestJobId: number | null;
  hasLatestJobRaw: boolean;
  isWizardActive: boolean;
  showDashboardProcessingStatus: boolean;
  monthlyData: PmsHubSurfaceProps["monthlyData"];
  topSources: PmsHubSurfaceProps["topSources"];
  totalProduction: number;
  totalReferrals: number;
  doctorReferralCount: number;
  doctorPercentage: number;
  effectiveReferralData: PmsHubSurfaceProps["referralData"];
  canUploadPMS: boolean;
  hasProperties: boolean;
  isIngestionHighlighted: boolean;
  organizationId?: number | null;
  locationId?: number | null;
  setManualEntryTargetMonth: (value: string | null) => void;
  setShowManualEntry: (value: boolean) => void;
  setFileManagerInitialMonth: (value: string | null) => void;
  setShowFileManager: (value: boolean) => void;
  setShowCompare: (value: boolean) => void;
  navigate: (path: string) => void;
}

export function PMSVisualPillarsContent({
  isLoading,
  error,
  keyData,
  dashboardAlerts,
  showClientApprovalBanner,
  bannerError,
  setIsEditorOpen,
  latestJobId,
  hasLatestJobRaw,
  isWizardActive,
  showDashboardProcessingStatus,
  monthlyData,
  topSources,
  totalProduction,
  totalReferrals,
  doctorReferralCount,
  doctorPercentage,
  effectiveReferralData,
  canUploadPMS,
  hasProperties,
  isIngestionHighlighted,
  organizationId,
  locationId,
  setManualEntryTargetMonth,
  setShowManualEntry,
  setFileManagerInitialMonth,
  setShowFileManager,
  setShowCompare,
  navigate,
}: PMSVisualPillarsContentProps) {
  const copy = usePmsCopy();

  return (
    <main className="mx-auto w-full max-w-[960px] space-y-6 px-4 pb-6 sm:px-6 lg:px-8">
      {/* Cascaded dashboard alerts — stale-data alert (top) + upload nudge.
          Shared 960px container width across Practice Hub / Referrals /
          Rankings; the surface + alerts fill the same centered main. */}
      {!isLoading && !error && keyData && dashboardAlerts.length > 0 && (
        <div className="w-full">
          <DashboardAlertStack alerts={dashboardAlerts} />
        </div>
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
              {copy.processedBannerTitle}
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
              {copy.retrieveErrorTitle}
            </p>
            <p className="text-[10px] text-red-600 font-semibold uppercase tracking-widest mt-0.5">
              {error}
            </p>
          </div>
        </motion.div>
      )}

      {!error && (keyData || isWizardActive || showDashboardProcessingStatus) && (
      <PmsHubSurface
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
        onOpenCompare={() => setShowCompare(true)}
      />
    )}
    </main>
  );
}
