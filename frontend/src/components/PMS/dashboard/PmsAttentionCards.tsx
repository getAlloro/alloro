import { AlertTriangle, Layers3, PieChart } from "lucide-react";
import type { PmsKeyDataSource } from "../../../api/pms";

export type PmsAttentionCardsProps = {
  topSources: PmsKeyDataSource[];
  monthCount: number;
  doctorPercentage: number;
  isProcessingInsights: boolean;
};

function AttentionCard({
  icon: Icon,
  label,
  title,
  detail,
}: {
  icon: typeof AlertTriangle;
  label: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-premium">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
          {label}
        </span>
        <span className="rounded-xl bg-alloro-orange/10 p-2 text-alloro-orange">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <h3 className="text-base font-black leading-tight text-alloro-navy">
        {title}
      </h3>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
        {detail}
      </p>
    </div>
  );
}

export function PmsAttentionCards({
  topSources,
  monthCount,
  doctorPercentage,
  isProcessingInsights,
}: PmsAttentionCardsProps) {
  const topSource = topSources[0];
  const hasMonthData = monthCount > 0;
  const selfPercentage = Math.max(100 - doctorPercentage, 0);

  return (
    <div data-wizard-target="pms-insights" className="grid gap-4 lg:grid-cols-3">
      <AttentionCard
        icon={Layers3}
        label="Top source"
        title={topSource?.name ?? "No source data yet"}
        detail={
          topSource
            ? `${topSource.referrals} referrals · ${topSource.percentage}% of tracked production.`
            : isProcessingInsights
              ? "Your ranked sources will appear once PMS processing finishes."
              : "Upload approved PMS data to rank referral sources."
        }
      />
      <AttentionCard
        icon={AlertTriangle}
        label="Data coverage"
        title={
          hasMonthData
            ? `${monthCount} month${monthCount === 1 ? "" : "s"} tracked`
            : "No monthly history yet"
        }
        detail={
          monthCount >= 6
            ? "Enough history for month-over-month referral patterns."
            : isProcessingInsights
              ? "Monthly history will populate when the active PMS process finishes."
              : "More monthly history will make source trends more reliable."
        }
      />
      <AttentionCard
        icon={PieChart}
        label="Referral balance"
        title={
          hasMonthData
            ? `${doctorPercentage}% doctor · ${selfPercentage}% self`
            : "Referral split pending"
        }
        detail={
          hasMonthData
            ? "Use this split to see whether growth is coming from peer referrals or patient-driven channels."
            : "Your doctor and self-referral split will appear after PMS referral data is processed."
        }
      />
    </div>
  );
}
