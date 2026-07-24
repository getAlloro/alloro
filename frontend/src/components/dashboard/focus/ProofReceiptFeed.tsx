import { MessageSquare, FileText, Building2, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../../../hooks/useAuth";
import { useLocationContext } from "../../../contexts/locationContext";
import { useProofReceipt } from "../../../hooks/queries/useProofReceipt";
import type { ProofReceiptItem, ProofReceiptItemType } from "../../../types/proofReceipt";

/**
 * ProofReceiptFeed — the owner-facing "what Alloro did for you" feed: the dated,
 * item-grain history of published work (a review reply posted, a local post
 * published), so the owner SEES the work being done rather than reading a single
 * summary line.
 *
 * Honest by construction (NS1 + Value #6): every row is a logged, dated fact
 * pulled straight from the proof-receipt (`published_at`). No causal "+N", no
 * promise, nothing modelled. Emptiness is only ever asserted from a LOADED
 * receipt — a missing or failed fetch renders nothing, never the false claim
 * "Alloro did nothing."
 *
 * Data: reuses useProofReceipt (§14.3 hook, §15.1 React Query). It shares the
 * query key with AlloroActivitySummary, so the two render from one deduped fetch
 * — the summary reads `.summary`, this reads `.items`.
 *
 * Scope note: when no single location is selected the receipt blends every
 * accessible office (each row still carries `locationId`); per-office labelling
 * of a blended multi-location feed is a deliberate follow-up, not shipped here.
 *
 * Backend: GET /api/proof-receipt (Tier 1, PR #177). Consumed by #203's summary;
 * this closes the gap to the fuller dated feed.
 */

const HEADING_ID = "proof-receipt-feed-heading";

// Keyed by the content-type union, not by `string`, so a new backend work-item
// type fails the typecheck here instead of silently falling through to the
// generic label. The `??` fallbacks below stay anyway: the wire is untyped JSON,
// and a type this build has never heard of must render as generic work.
const WORK_ITEM_LABEL: Record<ProofReceiptItemType, string> = {
  review_reply: "Review reply posted",
  local_post: "Local post published",
  business_info: "Business info updated",
};

const WORK_ITEM_ICON: Record<ProofReceiptItemType, LucideIcon> = {
  review_reply: MessageSquare,
  local_post: FileText,
  business_info: Building2,
};

/** Shown on a row whose `at` we cannot read — never a silently undated row. */
const UNKNOWN_DATE_LABEL = "Date unknown";

// The receipt window is a UTC calendar month (backend since = 1st-of-month UTC).
// Every date the feed shows — the month header AND each row — is formatted in
// UTC so they read on one clock: a local-time format of a UTC-boundary instant
// would drift a row or the header into the wrong month for users behind UTC.
const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
const DAY_LABEL_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

const MS_PER_DAY = 86_400_000;

/** UTC-midnight epoch (ms) for the day a timestamp falls in. */
function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Human date for a done-item: "Today" / "Yesterday" / "Jul 21" — all in UTC. */
function formatWorkItemDate(at: string, now = new Date()): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const dayDiff = Math.round((utcDayStart(now) - utcDayStart(date)) / MS_PER_DAY);
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  return DAY_LABEL_FORMAT.format(date);
}

/**
 * "June 2026" for the receipt window, formatted in UTC (see note above), or
 * `null` when the response carried no readable window.
 *
 * Returning the CLIENT's current month for a missing `since` would put a
 * factual frame on the card that the response never sent — "Nothing published
 * yet in July 2026" is a claim about a window nobody measured. Abstain instead:
 * every caller below drops the month from its sentence rather than guessing it.
 */
function formatMonthLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return MONTH_LABEL_FORMAT.format(date);
}

function ProofReceiptRow({ item }: { item: ProofReceiptItem }) {
  const Icon = WORK_ITEM_ICON[item.type] ?? CheckCircle2;
  const label = WORK_ITEM_LABEL[item.type] ?? "Work published";
  // An unreadable timestamp says so. Rendering the row undated would make it
  // look like every other row while quietly dropping the one thing this card
  // promises — a date.
  const when = formatWorkItemDate(item.at) || UNKNOWN_DATE_LABEL;

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft-line/60">
        <Icon size={14} strokeWidth={2} className="text-alloro-navy" aria-hidden />
      </span>
      <span className="flex-1 text-[13.5px] font-medium text-alloro-navy">{label}</span>
      <span className="shrink-0 text-[12px] font-medium text-ink-muted tabular-nums">
        {when}
      </span>
    </li>
  );
}

function FeedShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-labelledby={HEADING_ID}
      className="rounded-[14px] border border-line-soft bg-white px-[18px] pb-4 pt-[18px] shadow-premium"
    >
      <h3
        id={HEADING_ID}
        className="mb-1 text-[11.5px] font-bold uppercase tracking-[0.08em] text-alloro-navy"
      >
        What Alloro did for you
      </h3>
      {children}
    </section>
  );
}

export function ProofReceiptFeed() {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId ?? null;
  const locationId = selectedLocation?.id ?? null;

  const { receipt, isLoading, error } = useProofReceipt(orgId, locationId);

  if (orgId === null) return null;

  if (isLoading) {
    return (
      <FeedShell>
        <div
          className="space-y-3 py-1"
          role="status"
          aria-busy="true"
          aria-label="Loading your activity"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded bg-accent-soft-line" />
          ))}
        </div>
      </FeedShell>
    );
  }

  if (error) {
    return (
      <FeedShell>
        <p role="alert" className="py-1 text-[13.5px] text-ink-muted">
          Couldn&rsquo;t load your activity right now. Refresh to try again.
        </p>
      </FeedShell>
    );
  }

  // Emptiness is a factual claim ("Alloro did nothing this month"), so only make
  // it from a LOADED receipt. A null/undefined receipt here (idle/disabled, or a
  // non-Error rejection the hook coerced away) is UNKNOWN, not empty — render
  // nothing rather than assert a result that was never verified (Value #6).
  if (!receipt) return null;

  const items = receipt.items ?? [];
  const total = receipt.summary?.total ?? 0;
  const monthLabel = formatMonthLabel(receipt.since);

  if (items.length === 0) {
    return (
      <FeedShell>
        <p className="py-1 text-[13.5px] text-ink-muted">
          {monthLabel ? `Nothing published yet in ${monthLabel}.` : "Nothing published yet."}{" "}
          When Alloro posts a review reply or a local post for you, it shows up
          here — dated, so you can see exactly what got done.
        </p>
      </FeedShell>
    );
  }

  const hiddenCount = total - items.length;

  return (
    <FeedShell>
      {monthLabel ? (
        <p className="mb-1 text-[12px] font-medium text-ink-muted">{monthLabel}</p>
      ) : null}
      <ul className="divide-y divide-line-soft">
        {items.map((item) => (
          <ProofReceiptRow key={item.workItemId} item={item} />
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <p className="mt-2 border-t border-line-soft pt-2 text-[12px] font-medium text-ink-muted">
          {monthLabel
            ? `Showing your ${items.length} most recent · ${total} in ${monthLabel}.`
            : `Showing your ${items.length} most recent · ${total} published.`}
        </p>
      ) : null}
    </FeedShell>
  );
}

export default ProofReceiptFeed;
