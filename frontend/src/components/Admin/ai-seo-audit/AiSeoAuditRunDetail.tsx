import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type {
  AiSeoAuditDetail,
  AiSeoAuditExternalSource,
  AiSeoAuditResult,
  AiSeoAuditTarget,
  AiSeoCategoryId,
  AiSeoResultStatus,
} from "../../../api/aiSeoAudit";
import { formatPercent, formatScore, getResultStatusClass } from "./aiSeoAuditFormatters";
import {
  STATUS_INFO,
  categoryInfo,
  checkInfo,
} from "./aiSeoAuditLabels";

export type AiSeoAuditRunDetailProps = {
  detail?: AiSeoAuditDetail;
  isLoading: boolean;
};

const STATUS_RANK: Record<AiSeoResultStatus, number> = {
  fail: 4,
  partial: 3,
  unavailable: 2,
  not_applicable: 1,
  pass: 0,
};

const FIELD_VERDICT: Record<string, { label: string; cls: string }> = {
  consistent: { label: "Matches", cls: "text-emerald-600" },
  // Directory/scraped pages are noisy (wrong address picked, host read as name),
  // so a "conflict" is never asserted as fact — surfaced softly as worth a check.
  conflicting: { label: "Possible mismatch", cls: "text-amber-600" },
  missing_on_site: { label: "Only on listing", cls: "text-amber-600" },
  // The listing may still show a value we couldn't confirm — never claim "not
  // listed" here, since the value column already says so when it's truly absent.
  unavailable: { label: "Unconfirmed", cls: "text-gray-400" },
};

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

type CheckGroup = {
  checkId: string;
  category: AiSeoCategoryId;
  remediation: string | null;
  worstStatus: AiSeoResultStatus;
  counts: Partial<Record<AiSeoResultStatus, number>>;
  total: number;
  /** Score points left on the table by fail/partial results (raw rubric points). */
  lostPoints: number;
  perTarget: Array<{ id: string; label: string; status: AiSeoResultStatus }>;
};

export function AiSeoAuditRunDetail({ detail, isLoading }: AiSeoAuditRunDetailProps) {
  const groupsByCategory = useMemo(
    () => groupResults(detail?.results ?? [], detail?.targets ?? []),
    [detail?.results, detail?.targets]
  );

  if (isLoading && !detail) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading audit detail
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm font-semibold text-gray-600">
          Select or run an audit.
        </p>
      </div>
    );
  }

  const { run } = detail;
  const isActive = run.status === "queued" || run.status === "running";
  const categories = run.summary?.categories ?? [];
  const totalAvailable = categories.reduce(
    (sum, category) => sum + category.availablePoints,
    0,
  );
  const topFixes = Array.from(groupsByCategory.values())
    .flat()
    .filter((group) => group.lostPoints > 0)
    .sort((a, b) => b.lostPoints - a.lostPoints)
    .slice(0, 3)
    .map((group) => ({
      group,
      // Points the run score would gain if this check fully passed everywhere.
      impact: totalAvailable > 0 ? (group.lostPoints / totalAvailable) * 100 : 0,
    }))
    .filter((fix) => fix.impact >= 0.5);
  const totalPages = run.summary?.totalPages;
  const pagesCheckedValue =
    typeof totalPages === "number" && totalPages > detail.targets.length
      ? `${detail.targets.length} of ${totalPages}`
      : `${detail.targets.length}`;
  const grade = gradeFor(toScoreNumber(run.score));

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
      <motion.section
        variants={item}
        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Metric
            label="Overall Score"
            value={formatScore(run.score)}
            large
            badge={grade ?? undefined}
            tip="Your AI/SEO readiness out of 100, weighted across the five areas below. Important pages (like your homepage) count more than boilerplate pages. A serious issue (a 'score limiter') can hold an affected page down until it's fixed."
          />
          <Metric
            label="Coverage"
            value={formatPercent(run.data_coverage)}
            tip="How much of the audit we could actually measure. Lower coverage usually means a missing connection (like Search Console), not a problem with the site."
          />
          <Metric label="Confidence" value={run.confidence || "low"} tip="How much to trust the score, based on how much data we had to work with." />
          <Metric
            label="Pages Checked"
            value={pagesCheckedValue}
            tip={
              typeof totalPages === "number" && totalPages > detail.targets.length
                ? "We audit up to 12 pages per run, prioritizing the homepage and key content pages over legal/utility pages."
                : "How many pages this audit looked at."
            }
          />
        </div>
        {run.error_message && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {run.error_message}
          </p>
        )}
      </motion.section>

      {isActive && (
        <motion.div variants={item}>
          <ProgressPanel run={run} targetCount={detail.targets.length} />
        </motion.div>
      )}

      {run.hard_caps.length > 0 && (
        <motion.section variants={item} className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-black text-red-800">
                Score Limiters
                <InfoTip text="Serious issues that hold an affected page's score down until they're fixed — no matter how good everything else on that page is." />
              </h3>
              <div className="mt-3 space-y-2">
                {run.hard_caps.map((cap) => {
                  const affected = numberOrNull(cap.evidence?.affectedPageCount);
                  const scopeNote =
                    affected && detail.targets.length > 1
                      ? `on ${affected} of ${detail.targets.length} pages — caps those pages at ${cap.maxScore}`
                      : `caps the affected page at ${cap.maxScore}`;
                  return (
                    <p key={cap.code} className="text-sm font-semibold text-red-700">
                      {cap.label}
                      <span className="ml-1 text-red-500">· {scopeNote}</span>
                    </p>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.section>
      )}

      {topFixes.length > 0 && (
        <motion.section variants={item} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-1.5 text-sm font-black text-gray-900">
            Biggest wins
            <InfoTip text="The fixes that would raise your score the most, ranked by impact. '+N pts' is roughly how much the overall score gains if the fix is applied everywhere it's needed." />
          </h3>
          <div className="mt-3 space-y-3">
            {topFixes.map(({ group, impact }) => {
              const info = checkInfo(group.checkId);
              return (
                <div key={`${group.category}-${group.checkId}`} className="flex items-start gap-3">
                  <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-black tabular-nums text-emerald-700">
                    +{impact >= 10 ? Math.round(impact) : impact.toFixed(1)} pts
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">{info.label}</p>
                    {group.remediation && (
                      <p className="mt-0.5 text-sm text-gray-500">{group.remediation}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>
      )}

      {categories.length > 0 && (
        <motion.section variants={item} className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {categories.map((category) => {
            const info = categoryInfo(category.id, category.label);
            return (
              <motion.div
                key={category.id}
                whileHover={{ y: -3 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <p className="flex items-center gap-1 text-[11px] font-black uppercase leading-tight text-gray-400">
                  <span className="truncate">{info.label}</span>
                  <InfoTip text={info.tip} />
                </p>
                <p className="mt-2 text-3xl font-black tabular-nums text-alloro-navy">
                  {category.score === null ? "N/A" : Math.round(category.score)}
                </p>
                <ScoreBar score={category.score} />
              </motion.div>
            );
          })}
        </motion.section>
      )}

      {detail.targets.length > 1 && (
        <motion.div variants={item}>
          <PagesList targets={detail.targets} />
        </motion.div>
      )}

      {detail.externalSources.length > 0 && (
        <motion.div variants={item}>
          <ExternalConsistency sources={detail.externalSources} />
        </motion.div>
      )}

      {categories.length > 0 && (
        <motion.div variants={item}>
          <CriteriaBreakdown
            categories={categories.map((category) => ({
              id: category.id,
              fallback: category.label,
            }))}
            groupsByCategory={groupsByCategory}
          />
        </motion.div>
      )}
    </motion.div>
  );
}

function InfoTip({ text, align = "center" }: { text: string; align?: "center" | "right" }) {
  if (!text) return null;
  const pos = align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span className="group/tip relative inline-flex shrink-0 items-center align-middle">
      <HelpCircle className="h-3.5 w-3.5 cursor-help text-gray-300 transition-colors hover:text-gray-500" />
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full z-50 mt-1.5 w-60 rounded-lg bg-alloro-navy px-3 py-2 text-left text-xs font-medium normal-case leading-snug text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover/tip:opacity-100 ${pos}`}
      >
        {text}
      </span>
    </span>
  );
}

function StatusChip({ status, count }: { status: AiSeoResultStatus; count?: number }) {
  const info = STATUS_INFO[status];
  return (
    <span className="group/sc relative inline-flex shrink-0">
      <span
        className={`inline-flex cursor-help rounded-full border px-2 py-0.5 text-[11px] font-bold ${getResultStatusClass(status)}`}
      >
        {count !== undefined ? `${count} ` : ""}
        {info.label}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-56 rounded-lg bg-alloro-navy px-3 py-2 text-left text-xs font-medium normal-case leading-snug text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover/sc:opacity-100"
      >
        {info.tip}
      </span>
    </span>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  const value = score ?? 0;
  const color =
    score === null
      ? "bg-gray-300"
      : value >= 80
        ? "bg-emerald-500"
        : value >= 55
          ? "bg-amber-500"
          : "bg-red-500";
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${score === null ? 0 : value}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`h-full rounded-full ${color}`}
      />
    </div>
  );
}

function ProgressPanel({
  run,
  targetCount,
}: {
  run: AiSeoAuditDetail["run"];
  targetCount: number;
}) {
  const progress = run.summary?.progress;
  const stepLabel = progress?.step ? prettyStep(progress.step) : "Queued";
  const detail = progress?.detail || {};
  const current = numberOrNull(detail.current);
  const total = numberOrNull(detail.total);

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600" />
        <div className="min-w-0">
          <p className="text-sm font-black text-blue-900">
            {run.status === "queued" ? "Queued" : stepLabel}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-blue-700">
            {run.status === "queued"
              ? "Waiting for an available worker…"
              : current && total
                ? `${current} of ${total}${typeof detail.url === "string" ? ` · ${detail.url}` : ""}`
                : targetCount > 0
                  ? `${targetCount} page${targetCount === 1 ? "" : "s"} in progress`
                  : "Working…"}
          </p>
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tip,
  badge,
  large = false,
}: {
  label: string;
  value: string;
  tip?: string;
  badge?: { label: string; cls: string };
  large?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="flex items-center gap-1 text-xs font-black uppercase text-gray-400">
        <span>{label}</span>
        {tip && <InfoTip text={tip} />}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <p
          className={`font-black capitalize tabular-nums text-alloro-navy ${
            large ? "text-3xl" : "text-2xl"
          }`}
        >
          {value}
        </p>
        {badge && (
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-black ${badge.cls}`}
          >
            {badge.label}
          </span>
        )}
      </div>
    </div>
  );
}

/** Plain-English grade bands so the number reads at a glance. */
function gradeFor(score: number | null): { label: string; cls: string } | null {
  if (score === null) return null;
  if (score >= 90) return { label: "Excellent", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (score >= 75) return { label: "Good", cls: "border-blue-200 bg-blue-50 text-blue-700" };
  if (score >= 55) return { label: "Needs work", cls: "border-amber-200 bg-amber-50 text-amber-700" };
  return { label: "At risk", cls: "border-red-200 bg-red-50 text-red-700" };
}

function toScoreNumber(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function PagesList({ targets }: { targets: AiSeoAuditTarget[] }) {
  const sorted = [...targets].sort(
    (a, b) => (toScoreNumber(a.score) ?? 101) - (toScoreNumber(b.score) ?? 101),
  );
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-sm font-black text-gray-900">
        Page scores
        <InfoTip text="Each audited page's own score, lowest first — start fixing at the top. Your homepage counts more toward the overall score than legal/utility pages." />
      </h3>
      <div className="mt-3 divide-y divide-gray-100">
        {sorted.map((target) => {
          const score = toScoreNumber(target.score);
          const grade = gradeFor(score);
          const path =
            typeof (target.metadata as Record<string, unknown>)?.path === "string"
              ? ((target.metadata as Record<string, unknown>).path as string)
              : target.label || target.url;
          return (
            <div key={target.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 truncate text-sm font-semibold text-gray-700">
                {path || "/"}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {grade && (
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${grade.cls}`}>
                    {grade.label}
                  </span>
                )}
                <span className="w-9 text-right text-sm font-black tabular-nums text-alloro-navy">
                  {score === null ? "—" : Math.round(score)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CriteriaBreakdown({
  categories,
  groupsByCategory,
}: {
  categories: Array<{ id: AiSeoCategoryId; fallback: string }>;
  groupsByCategory: Map<AiSeoCategoryId, CheckGroup[]>;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-sm font-black text-gray-900">
        What we checked
        <InfoTip text="Every individual check, grouped by area. 'Good' passed, 'Partial' is a quick win, 'Needs fixing' wants attention, and 'No data' just means we couldn't measure it (it doesn't hurt your score). Click any row to see it page by page." />
      </h3>
      <div className="mt-4 space-y-5">
        {categories.map((category) => {
          const groups = groupsByCategory.get(category.id) ?? [];
          if (groups.length === 0) return null;
          const info = categoryInfo(category.id, category.fallback);
          return (
            <div key={category.id}>
              <p className="flex items-center gap-1 text-xs font-black uppercase tracking-wide text-gray-400">
                <span>{info.label}</span>
                <InfoTip text={info.tip} />
              </p>
              <div className="mt-2 divide-y divide-gray-100">
                {groups.map((group) => (
                  <CheckGroupRow key={`${group.category}-${group.checkId}`} group={group} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CheckGroupRow({ group }: { group: CheckGroup }) {
  const [open, setOpen] = useState(false);
  const expandable = group.total > 1;
  const info = checkInfo(group.checkId);
  const statuses = (Object.keys(group.counts) as AiSeoResultStatus[]).sort(
    (a, b) => STATUS_RANK[b] - STATUS_RANK[a]
  );

  return (
    <div className="py-3">
      <button
        type="button"
        onClick={() => expandable && setOpen((current) => !current)}
        className={`flex w-full items-start justify-between gap-3 text-left ${
          expandable ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-sm font-bold text-gray-900">
            <span>{info.label}</span>
            <InfoTip text={info.tip} />
          </p>
          {group.remediation && group.worstStatus !== "pass" && (
            <p className="mt-1 text-sm text-gray-500">{group.remediation}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex flex-wrap justify-end gap-1">
            {statuses.map((status) => (
              <StatusChip
                key={status}
                status={status}
                count={group.total > 1 ? group.counts[status] : undefined}
              />
            ))}
          </div>
          {expandable && (
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            />
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && expandable && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-1.5 border-l-2 border-gray-100 pl-3">
              {group.perTarget.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="min-w-0 truncate font-semibold text-gray-600">
                    {entry.label}
                  </span>
                  <StatusChip status={entry.status} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExternalConsistency({ sources }: { sources: AiSeoAuditExternalSource[] }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-sm font-black text-gray-900">
        Where your business is referenced
        <InfoTip text="Third-party sites (directories, social, listings) that mention your business. We surface them as leads to review — not as verdicts. Directory data is often outdated or scraped imperfectly, so any flag here is a 'worth double-checking', not a confirmed problem." />
      </h3>
      <div className="mt-4 divide-y divide-gray-100">
        {sources.slice(0, 10).map((source) => (
          <ExternalSourceRow key={source.id} source={source} />
        ))}
      </div>
    </section>
  );
}

function ExternalSourceRow({ source }: { source: AiSeoAuditExternalSource }) {
  const [open, setOpen] = useState(false);
  const fields = buildFieldRows(source);
  const hasDetail = fields.length > 0;
  const advisory = buildAdvisory(source);

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => hasDetail && setOpen((current) => !current)}
          className={`min-w-0 flex-1 text-left ${hasDetail ? "cursor-pointer" : "cursor-default"}`}
        >
          <p className="truncate text-sm font-bold text-gray-900">
            {source.title || source.source_host}
          </p>
          <p className="truncate text-xs text-gray-500">{source.source_host}</p>
          {advisory && (
            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-600">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {advisory}
            </p>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-600">
            Referenced
          </span>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="text-gray-400 transition-colors hover:text-alloro-orange"
            aria-label="Open listing"
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          {hasDetail && (
            <button type="button" onClick={() => setOpen((c) => !c)} aria-label="Toggle details">
              <ChevronDown
                className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && hasDetail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
              {fields.map((field) => (
                <div key={field.key} className="flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <span className="font-black uppercase tracking-wide text-gray-400">
                      {field.label}
                    </span>
                    <p className="mt-0.5 truncate font-semibold text-gray-700">
                      {field.value || "Not listed"}
                    </p>
                  </div>
                  <span className={`shrink-0 font-bold ${FIELD_VERDICT[field.verdict].cls}`}>
                    {FIELD_VERDICT[field.verdict].label}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function buildAdvisory(source: AiSeoAuditExternalSource): string | null {
  const compared = (source.compared_fields || {}) as Record<string, unknown>;
  const labels: Array<[string, string]> = [
    ["phone", "phone"],
    ["address", "address"],
    ["name", "name"],
    ["domain", "website"],
  ];
  const conflicts = labels
    .filter(([cmp]) => compared[cmp] === "conflicting")
    .map(([, label]) => label);
  if (conflicts.length > 0) {
    return `Possible ${joinWords(conflicts)} mismatch — worth double-checking.`;
  }
  if (source.entity_match_state === "ambiguous_entity") {
    return "Name matches but other details didn't — this may be a different listing.";
  }
  return null;
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  if (words.length === 2) return `${words[0]} & ${words[1]}`;
  return `${words.slice(0, -1).join(", ")} & ${words[words.length - 1]}`;
}

function buildFieldRows(source: AiSeoAuditExternalSource): Array<{
  key: string;
  label: string;
  value: string;
  verdict: string;
}> {
  const extracted = (source.extracted_fields || {}) as Record<string, unknown>;
  const compared = (source.compared_fields || {}) as Record<string, unknown>;
  const defs: Array<{ key: string; label: string; cmp: string }> = [
    { key: "name", label: "Name", cmp: "name" },
    { key: "phone", label: "Phone", cmp: "phone" },
    { key: "address", label: "Address", cmp: "address" },
    { key: "website", label: "Website", cmp: "domain" },
  ];
  const rows = defs.map((def) => {
    const value = typeof extracted[def.key] === "string" ? (extracted[def.key] as string) : "";
    const rawVerdict = typeof compared[def.cmp] === "string" ? (compared[def.cmp] as string) : "unavailable";
    const verdict = FIELD_VERDICT[rawVerdict] ? rawVerdict : "unavailable";
    return { key: def.key, label: def.label, value, verdict };
  });
  // Only show the panel if there's at least one real value or a non-trivial verdict.
  return rows.some((row) => row.value || row.verdict !== "unavailable") ? rows : [];
}

function groupResults(
  results: AiSeoAuditResult[],
  targets: AiSeoAuditTarget[],
): Map<AiSeoCategoryId, CheckGroup[]> {
  const targetLabel = (targetId: string | null): string => {
    if (!targetId) return "Run";
    const target = targets.find((entry) => entry.id === targetId);
    return target ? target.label || target.url : "Target";
  };

  const byCheck = new Map<string, CheckGroup>();
  for (const result of results) {
    const key = `${result.category}::${result.check_id}`;
    let group = byCheck.get(key);
    if (!group) {
      group = {
        checkId: result.check_id,
        category: result.category,
        remediation: null,
        worstStatus: "pass",
        counts: {},
        total: 0,
        lostPoints: 0,
        perTarget: [],
      };
      byCheck.set(key, group);
    }
    group.counts[result.status] = (group.counts[result.status] ?? 0) + 1;
    group.total += 1;
    if (result.status === "fail" || result.status === "partial") {
      group.lostPoints += Math.max(
        0,
        Number(result.weight) - Number(result.points_awarded),
      );
    }
    group.perTarget.push({
      id: result.id,
      label: targetLabel(result.target_id),
      status: result.status,
    });
    if (result.remediation && !group.remediation) {
      group.remediation = result.remediation;
    }
    if (STATUS_RANK[result.status] > STATUS_RANK[group.worstStatus]) {
      group.worstStatus = result.status;
    }
  }

  const byCategory = new Map<AiSeoCategoryId, CheckGroup[]>();
  for (const group of byCheck.values()) {
    const list = byCategory.get(group.category) ?? [];
    list.push(group);
    byCategory.set(group.category, list);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => STATUS_RANK[b.worstStatus] - STATUS_RANK[a.worstStatus]);
  }
  return byCategory;
}

function prettyStep(step: string): string {
  const map: Record<string, string> = {
    resolving_organization: "Gathering business data",
    collecting_pages: "Reading pages",
    external_scan: "Checking the web",
    scoring: "Scoring",
  };
  return map[step] || step.replace(/_/g, " ");
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
