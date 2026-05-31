import { motion } from "framer-motion";
import { PmsAttentionCards } from "./PmsAttentionCards";
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
import { PmsVelocityCard } from "./PmsVelocityCard";
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
          <PmsSectionHeader title="PMS Vitals" meta="YTD" />
          <PmsVitalsRow
            months={monthlyData}
            totalProduction={totalProduction}
            totalReferrals={totalReferrals}
            sourceCount={topSources.length}
            isLoading={isLoading}
            isProcessingInsights={isProcessingInsights}
          />

          <PmsAttentionCards
            topSources={topSources}
            monthCount={monthlyData.length}
            doctorPercentage={doctorPercentage}
            isProcessingInsights={isProcessingInsights}
          />

          <PmsExecutiveSummary
            bullets={referralData?.executive_summary}
            isProcessingInsights={isProcessingInsights}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
            <PmsProductionChart
              months={monthlyData}
              isProcessingInsights={isProcessingInsights}
            />
            <PmsReferralMixCard
              months={monthlyData}
              isProcessingInsights={isProcessingInsights}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <PmsTopSourcesCard
              sources={topSources}
              isProcessingInsights={isProcessingInsights}
            />
            <PmsVelocityCard
              months={monthlyData}
              isProcessingInsights={isProcessingInsights}
            />
          </div>

          <PmsGrowthOpportunities referralData={referralData} />

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
