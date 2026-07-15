import { motion, AnimatePresence } from "framer-motion";
import { Activity } from "lucide-react";
import type { LeadgenEvent } from "../../../../types/leadgen";
import { STAGE_CLASSES, STAGE_TONE } from "../leadgenSubmissionDisplay.utils";
import {
  EVENT_ICONS,
  buildStepDurations,
  eventLabel,
  formatAbsolute,
  formatTimeOnly,
  formatDateOnly,
  formatGapShort,
} from "../leadgenSubmissionDetail.utils";

export type EventTimelineProps = {
  events: LeadgenEvent[];
  hasAudit: boolean;
};

export default function EventTimeline({
  events,
  hasAudit,
}: EventTimelineProps) {
  const stepDurations = buildStepDurations(events);

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">Event timeline</h3>
        <span className="ml-1 text-xs text-gray-400">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
        {events.length > 0 && (
          <span
            className="ml-auto text-[10px] text-gray-400 font-mono whitespace-nowrap"
            title="Date of the first event in this session — per-row labels show time only"
          >
            {formatDateOnly(events[0].created_at)}
          </span>
        )}
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
          No events recorded for this session.
        </div>
      ) : (
        <ol className="relative border-l border-gray-200 pl-5 space-y-7 pt-2">
          <AnimatePresence initial={false}>
            {events.map((ev, i) => {
              const Icon = EVENT_ICONS[ev.event_name] ?? Activity;
              // CTA events have no funnel tone — fall back to gray.
              const tone =
                (
                  STAGE_TONE as Record<
                    string,
                    "green" | "blue" | "red" | "amber" | "gray"
                  >
                )[ev.event_name] ?? "gray";
              const toneClass = STAGE_CLASSES[tone];

              // Gap pill sits on the connector line ABOVE this item, showing
              // how long it took for the user/pipeline to advance from the
              // previous event to this one. Skipped for the first event.
              const prev = i > 0 ? events[i - 1] : null;
              let gapMs: number | null = null;
              if (prev) {
                try {
                  gapMs =
                    new Date(ev.created_at).getTime() -
                    new Date(prev.created_at).getTime();
                  if (!Number.isFinite(gapMs) || gapMs < 0) gapMs = null;
                } catch {
                  gapMs = null;
                }
              }

              return (
                <motion.li
                  key={ev.id}
                  layout
                  initial={{ opacity: 0, x: -12, scale: 0.98 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  className="relative"
                >
                  {gapMs !== null && (
                    <motion.span
                      layout
                      // Center on the connector line both axes:
                      //  - left -20px = the ol's border-l position (pl-5 padding)
                      //  - top -14px = halfway into the 28px gap (space-y-7)
                      //  - translate -50/-50 centers the pill on that point
                      className="absolute -top-[14px] -left-[20px] -translate-x-1/2 -translate-y-1/2 inline-flex items-center rounded-full bg-white text-[10px] font-medium text-gray-500 px-1.5 py-0.5 border border-gray-200 shadow-sm whitespace-nowrap"
                      title={`${Math.round(gapMs / 1000)}s between events`}
                    >
                      {formatGapShort(gapMs)}
                    </motion.span>
                  )}
                  <span
                    className={`absolute -left-[30px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white ${toneClass}`}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-gray-800">
                      {eventLabel(ev.event_name, hasAudit)}
                    </p>
                    <div className="flex flex-col items-end shrink-0 leading-tight">
                      <span
                        className={`text-xs font-semibold ${
                          stepDurations[i] === "current"
                            ? "text-emerald-600"
                            : "text-gray-700"
                        }`}
                        title={
                          stepDurations[i] === "current"
                            ? "This is the latest event — still in progress"
                            : "Time spent on this step (until the next event)"
                        }
                      >
                        {stepDurations[i]}
                      </span>
                      <span
                        className="text-[10px] text-gray-400 font-mono"
                        title={formatAbsolute(ev.created_at)}
                      >
                        {formatTimeOnly(ev.created_at)}
                      </span>
                    </div>
                  </div>
                  {ev.event_data && Object.keys(ev.event_data).length > 0 && (
                    <pre className="mt-1.5 overflow-x-auto rounded-md bg-gray-50 p-2 text-[11px] text-gray-600 border border-gray-100">
                      {JSON.stringify(ev.event_data, null, 2)}
                    </pre>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}
