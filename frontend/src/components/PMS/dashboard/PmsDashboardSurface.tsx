import { useState } from "react";
import { motion } from "framer-motion";
import { PmsDashboardHero } from "./PmsDashboardHero";
import { PmsEmptyDashboardState } from "./PmsEmptyDashboardState";
import { PmsGrowthOpportunities } from "./PmsGrowthOpportunities";
import {
  PmsIngestionCard,
  type PmsDataAvailabilityMonth,
} from "./PmsIngestionCard";
import { PmsProductionChart } from "./PmsProductionChart";
import { PmsProcessingStatusCard } from "./PmsProcessingStatusCard";
import { PmsReferralMixCard } from "./PmsReferralMixCard";
import { PmsReferralsMeaningCard } from "./PmsReferralsMeaningCard";
import { PmsTopSourcesCard } from "./PmsTopSourcesCard";
import { PmsVelocityCard } from "./PmsVelocityCard";
import { DetailsModal } from "../../dashboard/shared/DetailsModal";
import type { PmsDashboardData } from "./types";
import { usePmsCopy } from "../pmsCopy";

type DetailModal = "sources" | "trends" | null;

export type PmsDashboardSurfaceProps = PmsDashboardData & {
  canOpenDataManager?: boolean;
  onOpenManualEntry: () => void;
  onOpenDataManager?: () => void;
  onSelectDataMonth?: (month: string) => void;
  /** Opens the month-comparison modal (rendered by the Referrals Hub surface). */
  onOpenCompare?: () => void;
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
  canOpenDataManager,
  onOpenManualEntry,
  onOpenDataManager,
  onSelectDataMonth,
  onOpenSettings,
}: PmsDashboardSurfaceProps) {
  const copy = usePmsCopy();
  const [detailModal, setDetailModal] = useState<DetailModal>(null);
  const availabilityMonths = buildAvailabilityMonths(monthlyData);

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
        canUploadPMS={canUploadPMS}
        canOpenDataManager={canOpenDataManager}
        onOpenManualEntry={onOpenManualEntry}
        onOpenDataManager={onOpenDataManager}
      />

      {isProcessingInsights && <PmsProcessingStatusCard />}

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
            canOpenDataManager={canOpenDataManager}
            availabilityMonths={availabilityMonths}
            onOpenManualEntry={onOpenManualEntry}
            onOpenDataManager={onOpenDataManager}
            onSelectDataMonth={onSelectDataMonth}
            onOpenSettings={onOpenSettings}
          />
        </>
      )}

      {/* Detail modals — rendered outside the conditional so AnimatePresence
          exit animations work even when the data section isn't mounted. */}
      <DetailsModal
        open={detailModal === "sources"}
        title={copy.allSourcesTitle}
        eyebrow={copy.topSourcesEyebrow}
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
        title={`${copy.moneyLabel} and ${copy.countPlural} patterns`}
        eyebrow={copy.trendEyebrow}
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

function buildAvailabilityMonths(
  monthlyData: PmsDashboardData["monthlyData"],
): PmsDataAvailabilityMonth[] {
  const activeMonthData = new Map<
    string,
    PmsDashboardData["monthlyData"][number]
  >();
  monthlyData.forEach((entry) => {
    const month = normalizeMonthKey(entry.month);
    if (month) activeMonthData.set(month, entry);
  });
  const latestMonth = addMonths(currentMonth(), -1);
  const firstMonth = addMonths(latestMonth, -11);
  const months: PmsDataAvailabilityMonth[] = [];

  for (
    let month = firstMonth;
    month <= latestMonth;
    month = addMonths(month, 1)
  ) {
    const activeMonth = activeMonthData.get(month);
    const isActive = Boolean(activeMonth);
    const isLatest = month === latestMonth;
    months.push({
      month,
      label: formatMonth(month),
      status: isActive ? "active" : isLatest ? "ready" : "missing",
      isLatest,
      productionTotal: activeMonth?.productionTotal ?? null,
      totalReferrals: activeMonth?.totalReferrals ?? null,
    });
  }

  return months;
}

function normalizeMonthKey(value: string): string | null {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parsed = new Date(`${value} 1`);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(ym: string, delta: number): string {
  const [year, month] = ym.split("-").map(Number);
  const totalMonths = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function formatMonth(month: string) {
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}
