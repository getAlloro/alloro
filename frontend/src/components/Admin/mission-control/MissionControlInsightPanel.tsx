import { Brain, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import type { MissionControlData } from "../../../api/admin-mission-control";
import { useAdminMissionControlInsight } from "../../../hooks/queries/useAdminMissionControlQueries";

export type MissionControlInsightPanelProps = {
  data: MissionControlData;
};

export function MissionControlInsightPanel({
  data,
}: MissionControlInsightPanelProps) {
  const insightMutation = useAdminMissionControlInsight();
  const insight = insightMutation.data?.insight;
  const bullets = insight?.bullets.length ? insight.bullets : data.movementSignals;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-alloro-teal/10 text-alloro-teal">
            <Brain className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-alloro-navy">
                Movement Insight
              </h2>
              {insight && (
                <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  {insight.source}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs font-medium leading-5 text-gray-500">
              {insight?.narrative ||
                "Generate a concise read on what is moving across the displayed revenue and organization data."}
            </p>
          </div>
        </div>

        <motion.button
          onClick={() => insightMutation.mutate()}
          disabled={insightMutation.isPending}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-alloro-navy px-3.5 py-2 text-xs font-bold text-white transition-all hover:bg-alloro-orange disabled:cursor-not-allowed disabled:opacity-50"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {insightMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate Insight
        </motion.button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2.5">
        {bullets.slice(0, 4).map((signal) => (
          <div
            key={signal}
            className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs font-semibold leading-5 text-gray-700"
          >
            {signal}
          </div>
        ))}
      </div>

      {insightMutation.isError && (
        <p className="mt-3 text-sm font-medium text-red-600">
          AI insight failed. Showing deterministic movement signals instead.
        </p>
      )}
    </section>
  );
}
