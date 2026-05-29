import type { GbpReviewMonthBucket } from "../../../api/gbpAutomation";
import { GbpEngagementSparkline } from "./GbpEngagementSparkline";

export type GbpEngagementTrendCardProps = {
  needsReplyMonths: GbpReviewMonthBucket[];
  repliedMonths: GbpReviewMonthBucket[];
};

export function GbpEngagementTrendCard({
  needsReplyMonths,
  repliedMonths,
}: GbpEngagementTrendCardProps) {
  return (
    <section className="mt-4" aria-label="Review reply trend">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-base font-medium text-alloro-navy">
            Review reply trend
          </p>
          <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
            Track total reviews against reviews still waiting on a reply.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-alloro-navy" />
            Total
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-alloro-orange" />
            Unreplied
          </span>
        </div>
      </div>
      <GbpEngagementSparkline
        needsReplyMonths={needsReplyMonths}
        repliedMonths={repliedMonths}
      />
    </section>
  );
}
