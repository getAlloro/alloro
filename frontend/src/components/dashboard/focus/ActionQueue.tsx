import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronRight, Inbox } from "lucide-react";
import { useAuth } from "../../../hooks/useAuth";
import { useLocationContext } from "../../../contexts/locationContext";
import {
  useActionQueue,
  type ActionQueueRow,
  type ActionQueueUrgency,
} from "../../../hooks/queries/useActionQueue";
import { getDomainIcon } from "./icons";
import { useIsWizardActive, useWizardDemoData } from "../../../contexts/OnboardingWizardContext";

/**
 * ActionQueue — the right-column card on the Focus dashboard. Surfaces the
 * remaining SUMMARY actions (after the Hero takes the top one) interleaved
 * with REFERRAL_ENGINE_ANALYSIS items, ordered by `priority_score` desc.
 *
 * Visual ref: ~/Desktop/another-design/project/cards.jsx (lines 105-141)
 *           + ~/Desktop/another-design/project/Focus Dashboard.html (lines 480-554)
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T13)
 */

const URGENCY_TEXT_CLASS: Record<ActionQueueUrgency, string> = {
  High: "text-[#C0392B] font-bold",
  Med: "text-[#B7791F] font-bold",
  Low: "text-[#6B7280] font-semibold",
};

function AgentPill({ agent }: { agent: ActionQueueRow["agent"] }) {
  const isRe = agent === "re";
  const label = isRe ? "Referral Engine" : "Summary";
  const cls = isRe
    ? "bg-[#F7E1D6] text-[#8A4A36]"
    : "bg-[#F0ECE5] text-[#8E8579]";
  return (
    <span
      className={`inline-flex items-center rounded-[4px] px-1.5 py-[2px] text-[9.5px] font-bold uppercase tracking-[0.06em] ${cls}`}
    >
      {label}
    </span>
  );
}

function QueueRowItem({
  row,
  onOpen,
  isLast,
}: {
  row: ActionQueueRow;
  onOpen: () => void;
  isLast: boolean;
}) {
  const { Comp, cls } = getDomainIcon(row.domain);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group -mx-1.5 flex w-full items-center gap-3 rounded-md px-1.5 py-3 text-left transition-colors hover:bg-[#F0ECE5] ${
        isLast ? "" : "border-b border-[#F0ECE5]"
      }`}
    >
      <span
        className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg ${cls}`}
        aria-hidden="true"
      >
        <Comp size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-[1.35] text-alloro-textDark">
          {row.title}
        </span>
        <span className="mt-[3px] flex flex-wrap items-center gap-1.5 text-[11px] text-[#6B7280]">
          <span className={URGENCY_TEXT_CLASS[row.urgency]}>{row.urgency}</span>
          <span
            className="inline-block h-[2.5px] w-[2.5px] rounded-full bg-[#C9C2B5]"
            aria-hidden="true"
          />
          <span>Due {row.due}</span>
          <span
            className="inline-block h-[2.5px] w-[2.5px] rounded-full bg-[#C9C2B5]"
            aria-hidden="true"
          />
          <AgentPill agent={row.agent} />
        </span>
      </span>
      <ChevronRight
        size={15}
        className="shrink-0 text-[#C9C2B5] transition-transform group-hover:translate-x-[2px] group-hover:text-alloro-textDark"
        aria-hidden="true"
      />
    </button>
  );
}

function SkeletonRow({ isLast }: { isLast: boolean }) {
  return (
    <div
      className={`-mx-1.5 flex items-center gap-3 px-1.5 py-3 ${
        isLast ? "" : "border-b border-[#F0ECE5]"
      }`}
    >
      <div className="h-[30px] w-[30px] shrink-0 animate-pulse rounded-lg bg-[#F0ECE5]" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-3/4 animate-pulse rounded bg-[#F0ECE5]" />
        <div className="h-[10px] w-1/2 animate-pulse rounded bg-[#F5F2EC]" />
      </div>
    </div>
  );
}

export function ActionQueue() {
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const navigate = useNavigate();

  const orgId = userProfile?.organizationId ?? null;
  const locationId = selectedLocation?.id ?? null;

  const { rows: realRows, isLoading: realLoading, error, refetch } = useActionQueue(orgId, locationId);

  const rows = isWizardActive ? (wizardDemoData?.actionQueueItems ?? []) as ActionQueueRow[] : realRows;
  const isLoading = isWizardActive ? false : realLoading;

  return (
    <section data-wizard-target="dashboard-queue" className="flex flex-col rounded-[14px] border border-[#EDE8DE] bg-white p-[22px_22px_18px] shadow-[0_1px_2px_rgba(20,18,12,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B7280]">
          Queue · {rows.length} more
        </span>
        <button
          type="button"
          onClick={() => navigate("/tasks")}
          className="inline-flex items-center gap-1.5 bg-transparent text-[12px] font-semibold text-alloro-orange transition-colors hover:text-[#B85339]"
        >
          Open tasks
          <ArrowRight size={11} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col">
        {isLoading ? (
          <>
            {[0, 1, 2].map((i) => (
              <SkeletonRow key={i} isLast={i === 2} />
            ))}
          </>
        ) : error ? (
          <div className="rounded-md border border-[#F3D6C4] bg-[#FFF7F2] px-3 py-3 text-[12px] text-[#8A4A36]">
            <p className="font-semibold">Couldn't load the queue.</p>
            <p className="mt-1 leading-snug">{error.message}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#8A4A36] underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
            <div
              className="mb-3 flex items-center justify-center rounded-full"
              style={{
                width: 44,
                height: 44,
                background: "#FFF7F2",
                color: "#D66853",
              }}
            >
              <Inbox size={20} />
            </div>
            <p className="text-[13.5px] font-semibold leading-snug text-[#1F1B16]">
              No queued actions
            </p>
            <p className="mt-1 max-w-[220px] text-[12px] leading-relaxed text-[#8E8579]">
              You're all caught up for this month.
            </p>
          </div>
        ) : (
          rows.map((row, i) => (
            <QueueRowItem
              key={row.id}
              row={row}
              isLast={i === rows.length - 1}
              onOpen={() => navigate("/tasks")}
            />
          ))
        )}
      </div>

    </section>
  );
}

export default ActionQueue;
