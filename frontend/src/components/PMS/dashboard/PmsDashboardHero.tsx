import { motion } from "framer-motion";
import { Database, PenLine } from "lucide-react";
import { usePmsCopy } from "../pmsCopy";

export type PmsDashboardHeroProps = {
  showUpdateData: boolean;
  canUploadPMS: boolean;
  canOpenDataManager?: boolean;
  onOpenManualEntry: () => void;
  onOpenDataManager?: () => void;
};

export function PmsDashboardHero({
  showUpdateData,
  canUploadPMS,
  canOpenDataManager = false,
  onOpenManualEntry,
  onOpenDataManager,
}: PmsDashboardHeroProps) {
  const copy = usePmsCopy();

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mb-6 flex flex-col gap-4 pb-2 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
          {copy.dashboardDataEyebrow}
        </p>
        <h1 className="font-display text-[28px] font-normal leading-tight tracking-tight text-alloro-navy">
          {copy.dashboardTitle}
        </h1>
        <p className="mt-1.5 max-w-[540px] text-[13px] font-normal leading-relaxed text-[color:var(--color-pm-text-secondary)]">
          {copy.dashboardSubtitle}
        </p>
      </div>

      {showUpdateData && (
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
          <button
            type="button"
            onClick={onOpenManualEntry}
            disabled={!canUploadPMS}
            className="inline-flex min-h-11 min-w-[168px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-alloro-orange px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-alloro-orange/25 transition-all duration-200 hover:scale-[1.02] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/35 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PenLine className="h-4 w-4" />
            {copy.uploadNewDataCta}
          </button>
          {canOpenDataManager && onOpenDataManager && (
            <button
              type="button"
              onClick={onOpenDataManager}
              className="inline-flex min-h-11 min-w-[168px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-line-soft bg-white px-4 py-3 text-[11px] font-black uppercase tracking-widest text-alloro-navy shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-alloro-orange/40 hover:bg-alloro-orange/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/25"
            >
              <Database className="h-4 w-4 text-alloro-orange" />
              Manage Data
            </button>
          )}
        </div>
      )}
    </motion.section>
  );
}
