import { useState } from "react";
import { motion } from "framer-motion";
import { PmsDashboardHero } from "./PmsDashboardHero";
import { PmsEmptyDashboardState } from "./PmsEmptyDashboardState";
import { PmsGrowthOpportunities } from "./PmsGrowthOpportunities";
import { PmsIngestionCard } from "./PmsIngestionCard";
import { PmsProductionChart } from "./PmsProductionChart";
import { PmsProcessingStatusCard } from "./PmsProcessingStatusCard";
import { PmsReferralMixCard } from "./PmsReferralMixCard";
import { PmsReferralsMeaningCard } from "./PmsReferralsMeaningCard";
import { PmsTopSourcesCard } from "./PmsTopSourcesCard";
import { PmsVelocityCard } from "./PmsVelocityCard";
import { DetailsModal } from "../../dashboard/shared/DetailsModal";
import type { PmsDashboardData } from "./types";

type DetailModal = "sources" | "trends" | null;

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
  const [detailModal, setDetailModal] = useState<DetailModal>(null);

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
          <PmsReferralsMeaningCard
            months={monthlyData}
            topSources={topSources}
            totalProduction={totalProduction}
            totalReferrals={totalReferrals}
            doctorPercentage={doctorPercentage}
            referralData={referralData}
            isProcessingInsights={isProcessingInsights}
            onOpenSources={() => setDetailModal("sources")}
            onOpenTrends={() => setDetailModal("trends")}
          />

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

      {/* Detail modals — rendered outside the conditional so AnimatePresence
          exit animations work even when the data section isn't mounted. */}
      <DetailsModal
        open={detailModal === "sources"}
        title="All sources ranked by production"
        eyebrow="Referral Sources"
        onClose={() => setDetailModal(null)}
      >
        <PmsTopSourcesCard
          sources={topSources}
          isProcessingInsights={isProcessingInsights}
          expanded
        />
      </DetailsModal>

      <DetailsModal
        open={detailModal === "trends"}
        title="Production and referral patterns"
        eyebrow="Referral Trends"
        onClose={() => setDetailModal(null)}
      >
        <div className="space-y-5">
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
          <PmsVelocityCard
            months={monthlyData}
            isProcessingInsights={isProcessingInsights}
          />
        </div>
      </DetailsModal>
    </motion.div>
  );
}
