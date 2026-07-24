/**
 * Pure copy + formatting helpers for the Owner Receipt card.
 *
 * Every helper here is honesty-gated (Value #6): an absent number becomes the
 * words "not measured", never a 0 or a dash that reads as zero; the impressions
 * trend only yields a before -> after line when the backend says the windows
 * are honestly covered; the diagnosis only names a driver when the backend says
 * it is diagnosable. No string here claims Alloro caused anything, and none tells
 * the owner to "go look" somewhere without a handled next step (banned copy).
 *
 * Kept pure and framework-free so the honesty rules are unit-testable apart from
 * React (§13.x — logic out of the view).
 */

import type {
  FunnelMovementDiagnosis,
  ImpressionsTrend,
  OwnerReceiptMetric,
  ReceiptGate,
} from "../../../api/ownerReceipt";

/** The words shown wherever a number is genuinely absent. Never "0", never "—". */
export const NOT_MEASURED = "not measured";

/*
 * ── Static card copy, in the owner's voice ────────────────────────────────
 *
 * These live here (not inline in the card) for the same reason the helpers do:
 * so the voice + honesty rules are testable apart from React. The owner is the
 * hero; Alloro is the quiet guide (StoryBrand). The voice is honest-but-
 * intentional — it names a worry before the owner voices it (accusation audit),
 * names a feeling plainly to take its charge off (affect labeling), and never
 * hands the owner homework: an empty or not-ready state closes with "Nothing
 * for you to do," never "take a look" or "check on it". No line claims Alloro
 * caused anything (Value #6) — the dated actions beside the dated numbers are
 * the only witness.
 */

/** Card eyebrow. */
export const RECEIPT_EYEBROW = "Your receipt";

/** Headline — the guide, plain, not a brag. */
export const RECEIPT_HEADLINE =
  "Here's what we did, and here's where your numbers went.";

/**
 * Accusation-audit subline — names the owner's likely worry first, in their own
 * words, so the numbers that follow read as an honest answer, not a sales pitch.
 */
export const RECEIPT_SUBLINE =
  "You might wonder if any of this is really working. Here's the honest answer. These are the days we worked, right next to your numbers.";

/** Section heading over the impressions before -> after. */
export const TREND_HEADING = "Search impressions";

/** Section heading over the dated action list. */
export const ACTIONS_HEADING = "What we did";

/**
 * Empty action list. Affect-labeled, no homework, closes reassuring: the owner
 * has nothing to chase — when the work happens, it appears here on its own.
 */
export const ACTIONS_EMPTY =
  "Nothing is logged for these dates yet. When we do the work, it lands right here. Nothing for you to do.";

/** Not-ready card title. */
export const NOT_READY_TITLE = "Your receipt isn't ready yet.";

/**
 * Not-ready card body. Accusation audit ("you might worry…") + affect labeling +
 * the handled reassurance. It never asks the owner to look, wait-and-check, or
 * do anything.
 */
export const NOT_READY_BODY =
  "You might worry that means something is wrong. It doesn't. We're still gathering your numbers, and the moment they're in we'll show what we did and how they moved. Nothing for you to do.";

/** Group a real number ("27,151"); an absent value becomes the honest words. */
export function formatMetricValue(value: number | null): string {
  if (value === null) return NOT_MEASURED;
  return new Intl.NumberFormat("en-US").format(value);
}

/** A signed count for a delta ("+512", "-84"). Assumes a real number. */
export function formatSignedCount(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("en-US").format(value)}`;
}

/** A signed whole-percent for a fraction ("+18%", "-3%"). Assumes a real number. */
export function formatSignedPercent(fraction: number): string {
  const pct = Math.round(fraction * 100);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

/** ISO date/timestamp -> "Jul 24, 2026". A bad value degrades to the raw string. */
export function formatDay(iso: string | null): string {
  if (!iso) return NOT_MEASURED;
  const day = String(iso).split(/[T ]/)[0];
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Plain owner-facing label + source note for a gate. Source stays honest. */
export function gateLabel(gate: ReceiptGate): string {
  switch (gate) {
    case "impressions":
      return "Search impressions";
    case "visits":
      return "Website visits";
    case "leads":
      return "People who reached out";
  }
}

/** Plain owner-facing provenance for each source the backend can stamp. */
const SOURCE_LABELS: Record<string, string> = {
  gsc_organic: "From Google Search",
  rybbit: "From your website",
  form_submissions: "From your website forms",
};

/**
 * A plain one-line source note for a metric, or empty when there's nothing to add.
 *
 * A present value can still carry a coverage caveat — the contract documents
 * `note` as "why null, OR a coverage caveat", and the backend does return a
 * value and a note together (e.g. `{value: 4102, note: "partial: 19 of 28
 * days"}`). Dropping the note there would render a caveated number as a clean
 * one, so both are shown.
 */
export function metricSourceNote(metric: OwnerReceiptMetric): string {
  if (metric.value === null) return metric.note ?? NOT_MEASURED;
  const sourceLabel =
    metric.source === null ? "" : (SOURCE_LABELS[metric.source] ?? "");
  if (sourceLabel && metric.note) return `${sourceLabel} · ${metric.note}`;
  return sourceLabel || metric.note || "";
}

export interface ImpressionsTrendView {
  /** True when an honest before -> after delta can be shown (rule 3). */
  hasDelta: boolean;
  /** Present only when hasDelta: the plain before/after/change strings. */
  before?: string;
  after?: string;
  change?: string;
  beforeWindow?: string;
  afterWindow?: string;
  /** Present only when NOT hasDelta: the plain coverage-gap reason. */
  reason: string;
}

/**
 * Gate the impressions trend (rule 3): a before -> after delta is built ONLY
 * when `sufficient` is true; otherwise we surface the plain `reason` and no
 * number pretends to be a measured change.
 */
export function buildImpressionsTrendView(
  trend: ImpressionsTrend,
): ImpressionsTrendView {
  if (!trend.sufficient || trend.delta === null || !trend.pre || !trend.post) {
    return {
      hasDelta: false,
      reason:
        trend.reason ??
        "We don't have enough saved history yet to show a fair before-and-after. That's normal this early. Nothing for you to do.",
    };
  }
  const change =
    trend.pctChange !== null
      ? `${formatSignedCount(trend.delta)} (${formatSignedPercent(trend.pctChange)})`
      : formatSignedCount(trend.delta);
  return {
    hasDelta: true,
    before: formatMetricValue(trend.pre.storedImpressions),
    after: formatMetricValue(trend.post.storedImpressions),
    change,
    beforeWindow: `${formatDay(trend.pre.window.start)} – ${formatDay(trend.pre.window.end)}`,
    afterWindow: `${formatDay(trend.post.window.start)} – ${formatDay(trend.post.window.end)}`,
    reason: "",
  };
}

/**
 * Plain doctor-language for which funnel term moved leads (rule 4). Names the
 * term, in the direction leads actually moved, without any causal claim. Falls
 * back to the backend's plain `reason` when it isn't honestly diagnosable.
 */
export function diagnosisSentence(diagnosis: FunnelMovementDiagnosis): string {
  // Each sentence below asserts a DIRECTION ("More"/"Fewer people reached out"),
  // so the direction has to be measured here, not inferred. `leadsChange ?? 0`
  // would call an absent change a fall and a flat month a fall; both are false
  // statements about a month nothing happened in. This gate is the frontend's
  // own — it does not rely on the backend happening to null `primaryDriver`
  // when leads are flat, which is backend behaviour this layer cannot enforce.
  const change = diagnosis.leadsChange;
  if (
    !diagnosis.diagnosable ||
    diagnosis.primaryDriver === null ||
    change === null ||
    change === 0
  ) {
    return (
      diagnosis.reason ??
      "We can't yet say which part of your funnel moved the people who reached out."
    );
  }
  const rose = change > 0;
  switch (diagnosis.primaryDriver) {
    case "impressions":
      return rose
        ? "More people reached out. What moved is the top of the funnel — more people saw you than before."
        : "Fewer people reached out. What moved is the top of the funnel — fewer people saw you than before.";
    case "CTR":
      return rose
        ? "More people reached out. More of the people who saw you clicked through to your site than before."
        : "Fewer people reached out. Fewer of the people who saw you clicked through to your site than before.";
    case "CRO":
      return rose
        ? "More people reached out once they were on your site — the same visits did more this time."
        : "Fewer people reached out once they were on your site. The visits held; fewer of them turned into someone reaching out.";
  }
}

/** Plain label for a logged action type. Unknown types degrade to the raw type. */
export function actionLabel(type: string): string {
  if (type === "review_reply") return "Replied to a review";
  if (type === "local_post") return "Published a post";
  return type;
}

/**
 * "Showing 50 of 120." — rendered ONLY when the fetched page is genuinely
 * shorter than the total the backend reports. A capped list presented as the
 * complete record understates the work and reads as the whole truth; naming the
 * cap is the honest alternative to silently dropping rows.
 */
export function actionsTruncationNote(shown: number, total: number): string {
  return `Showing ${formatMetricValue(shown)} of ${formatMetricValue(total)}.`;
}

/*
 * ── Failure copy ──────────────────────────────────────────────────────────
 *
 * A failed request is a FAILURE, not a data lag. The not-ready copy is honest
 * only when the request SUCCEEDED and there is simply nothing to show yet;
 * rendering it on a 403/404/500 tells a paying owner to wait for data that will
 * never arrive, and support reads the ticket as a data-lag complaint. These
 * strings are what the card shows instead (§16.1).
 */

/** Title for a plain request failure (endpoint down, 500, no response). */
export const RECEIPT_ERROR_TITLE = "We couldn't load your receipt.";

/**
 * Body for a plain request failure. Names the fault as ours, refuses to guess a
 * number, and still hands the owner no errand — there is genuinely nothing they
 * can do about our outage.
 */
export const RECEIPT_ERROR_BODY =
  "This one is on us — the request didn't come back, so we won't guess at your numbers. We're on it. Nothing for you to do.";

/** Title for an access failure (401/403) — a different fault with a different fix. */
export const RECEIPT_ERROR_ACCESS_TITLE = "We can't show you this receipt.";

/**
 * Body for an access failure. Unlike an outage, there IS an honest next step
 * here, so we name it rather than pretending nothing is wrong.
 */
export const RECEIPT_ERROR_ACCESS_BODY =
  "Your sign-in doesn't have access to these numbers right now. That's a permissions setting, not a gap in your data. Tell us and we'll open it up.";

export interface ReceiptErrorCopy {
  title: string;
  body: string;
}

/**
 * HTTP status behind a thrown error, read from `ApiError.status` when the client
 * set one, else from the `HTTP_nnn` code `normalizeApiFailure` stamps. Duck-typed
 * so this module stays framework- and api-layer-free (§13.3) and `unknown`-safe.
 */
function errorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const carrier = error as { status?: unknown; code?: unknown };
  if (typeof carrier.status === "number") return carrier.status;
  if (typeof carrier.code === "string") {
    const match = /^HTTP_(\d{3})$/.exec(carrier.code);
    if (match) return Number(match[1]);
  }
  return null;
}

/** True when the thrown error is a tenant/permission denial rather than an outage. */
function isAccessDenied(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === 401 || status === 403) return true;
  if (typeof error !== "object" || error === null) return false;
  const carrier = error as { code?: unknown };
  return typeof carrier.code === "string" && carrier.code.includes("ACCESS_DENIED");
}

/**
 * The title/body the card shows for a FAILED request. Never returns the
 * not-ready copy — that branch is reserved for a successful request with nothing
 * in it yet.
 */
export function receiptErrorCopy(error: unknown): ReceiptErrorCopy {
  if (isAccessDenied(error)) {
    return {
      title: RECEIPT_ERROR_ACCESS_TITLE,
      body: RECEIPT_ERROR_ACCESS_BODY,
    };
  }
  return { title: RECEIPT_ERROR_TITLE, body: RECEIPT_ERROR_BODY };
}
