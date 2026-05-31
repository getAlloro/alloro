import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export type PmsDashboardHeroProps = {
  showUpdateData: boolean;
  onJumpToIngestion: () => void;
};

export function PmsDashboardHero({
  showUpdateData,
  onJumpToIngestion,
}: PmsDashboardHeroProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mb-6 flex flex-col gap-4 pb-2 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Revenue Attribution
        </p>
        <h1 className="font-display text-[28px] font-normal leading-tight tracking-tight text-alloro-navy">
          Referral Intelligence
        </h1>
        <p className="mt-1.5 max-w-[540px] text-[13px] font-normal leading-relaxed text-slate-500">
          See which channels and doctor relationships drive referrals,
          production, and your next best growth moves.
        </p>
      </div>

      {showUpdateData && (
        <button
          type="button"
          onClick={onJumpToIngestion}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-alloro-orange px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-alloro-orange/20 transition-all duration-200 hover:scale-[1.02] hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-alloro-teal/30"
        >
          Update data
          <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </motion.section>
  );
}
