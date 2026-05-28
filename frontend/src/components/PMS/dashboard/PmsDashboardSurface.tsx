import { motion } from "framer-motion";
import { PmsDashboardHero } from "./PmsDashboardHero";
import { PmsEmptyDashboardState } from "./PmsEmptyDashboardState";
import { PmsExecutiveSummary } from "./PmsExecutiveSummary";
import { PmsGrowthOpportunities } from "./PmsGrowthOpportunities";
import { PmsIngestionCard } from "./PmsIngestionCard";
import { PmsProductionChart } from "./PmsProductionChart";
import { PmsProcessingStatusCard } from "./PmsProcessingStatusCard";
import { PmsReferralMixCard } from "./PmsReferralMixCard";
import { PmsSectionHeader } from "./PmsSectionHeader";
import { PmsTopSourcesCard } from "./PmsTopSourcesCard";
import { PmsVitalsRow } from "./PmsVitalsRow";
import type { PmsDashboardData } from "./types";

export type PmsDashboardSurfaceProps = PmsDashboardData & {
  onJumpToIngestion: () => void;
  onOpenManualEntry: () => void;
  onOpenSettings: () => void;
};

export function PmsDashboardSurface({
  monthlyData,
  topSources,
  totalProduction,
  totalReferrals,
  doctorReferralCount,
  doctorPercentage,
  referralData,
  isLoading,
  isProcessingInsights,
  isWizardActive,
  canUploadPMS,
  hasProperties,
  isIngestionHighlighted,
  onJumpToIngestion,
  onOpenManualEntry,
  onOpenSettings,
}: PmsDashboardSurfaceProps) {
  const hasExistingData =
    monthlyData.length > 0 ||
    topSources.length > 0 ||
    totalProduction > 0 ||
    totalReferrals > 0;
  const shouldShowUnifiedEmptyState = !isLoading && !hasExistingData;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="pm-light mx-auto w-full max-w-[1320px] space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
    >
      <PmsDashboardHero
        showUpdateData={!shouldShowUnifiedEmptyState}
        onJumpToIngestion={onJumpToIngestion}
      />

      {isProcessingInsights && (
        <PmsProcessingStatusCard />
      )}

      {shouldShowUnifiedEmptyState ? (
        <PmsEmptyDashboardState
          canUploadPMS={canUploadPMS}
          hasProperties={hasProperties}
          isWizardActive={isWizardActive}
          isHighlighted={isIngestionHighlighted}
          isProcessingInsights={isProcessingInsights}
          onOpenManualEntry={onOpenManualEntry}
          onOpenSettings={onOpenSettings}
        />
      ) : (
        <>
          {/* Lead with meaning: the cream hero is the page's first read. */}
          <PmsExecutiveSummary
            bullets={referralData?.executive_summary}
            totalProduction={totalProduction}
            totalReferrals={totalReferrals}
            doctorPercentage={doctorPercentage}
            topSources={topSources}
            isProcessingInsights={isProcessingInsights}
          />

          {/* Best next actions, promoted above the detail cards. */}
          <PmsGrowthOpportunities referralData={referralData} />

          <PmsSectionHeader title="Your referral numbers" />
          <PmsVitalsRow
            months={monthlyData}
            totalProduction={totalProduction}
            totalReferrals={totalReferrals}
            isLoading={isLoading}
            isProcessingInsights={isProcessingInsights}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
            <PmsProductionChart
              months={monthlyData}
              isProcessingInsights={isProcessingInsights}
            />
            <PmsReferralMixCard
              doctorPercentage={doctorPercentage}
              doctorReferralCount={doctorReferralCount}
              totalReferrals={totalReferrals}
              isProcessingInsights={isProcessingInsights}
            />
          </div>

          <PmsTopSourcesCard
            sources={topSources}
            isProcessingInsights={isProcessingInsights}
          />

          <PmsSectionHeader title="Update your data" />
          <PmsIngestionCard
            canUploadPMS={canUploadPMS}
            hasProperties={hasProperties}
            isWizardActive={isWizardActive}
            isHighlighted={isIngestionHighlighted}
            onOpenManualEntry={onOpenManualEntry}
            onOpenSettings={onOpenSettings}
          />
        </>
      )}
    </motion.div>
  );
}
