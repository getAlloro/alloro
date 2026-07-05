import { useState } from "react";
import { Clock, GitCompareArrows, History, MessageSquare, RotateCcw, X } from "lucide-react";
import type { OsDiffHunk, OsDocumentVersion } from "../../../../api/admin-os";
import {
  useAdminOsVersionDiff,
  useAdminOsVersions,
  useRestoreOsVersion,
} from "../../../../hooks/queries/useAdminOsVersions";
import { useConfirm } from "../../../ui/ConfirmModal";
import { OsErrorState } from "../shared/OsErrorState";
import { OsRelatedRail } from "./OsRelatedRail";
import { formatOsDateTime, formatOsRelativeTime } from "../shared/osFormat";

/**
 * Right rail on the read view (P3 T3/T5): version history with line-diff and
 * non-destructive restore, the live Related section (P4), and a quiet
 * placeholder for Comments (P7). Order: History → Related → Comments. Diff
 * hunks use the semantic soft tokens — add = success-soft, remove = danger-soft
 * (D13).
 */

const DIFF_ROW_CLASSES: Record<OsDiffHunk["type"], string> = {
  add: "bg-success-soft text-green-900 before:content-['+'] before:text-alloro-success",
  remove: "bg-danger-soft text-red-900 before:content-['-'] before:text-alloro-danger",
  context: "text-gray-500 before:content-['\\00a0']",
};

function OsDiffHunks({ hunks }: { hunks: OsDiffHunk[] }) {
  if (hunks.length === 0) {
    return (
      <p className="rounded-lg border border-line-soft bg-gray-50 px-3 py-4 text-center font-mono text-[11px] text-gray-400">
        No differences.
      </p>
    );
  }
  return (
    <div className="max-h-72 overflow-y-auto overflow-x-hidden rounded-lg border border-line-soft bg-alloro-surface font-mono text-[11.5px] leading-5">
      {hunks.map((hunk, hunkIndex) =>
        hunk.text.split("\n").map((line, lineIndex) => (
          <div
            key={`${hunkIndex}-${lineIndex}`}
            className={`whitespace-pre-wrap break-words px-2 py-0.5 before:mr-2 before:inline-block before:w-2 before:select-none ${DIFF_ROW_CLASSES[hunk.type]}`}
          >
            {line === "" ? " " : line}
          </div>
        )),
      )}
    </div>
  );
}

function OsVersionDiffBlock({
  documentId,
  from,
  to,
  onClose,
}: {
  documentId: string;
  from: number;
  to: number | "draft";
  onClose: () => void;
}) {
  const diffQuery = useAdminOsVersionDiff(documentId, from, to);
  return (
    <div className="mt-2">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="font-mono text-[11px] text-gray-400">
          v{from} → {to === "draft" ? "draft" : `v${to}`}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close diff"
          className="flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors duration-150 hover:text-gray-700"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
      {diffQuery.isLoading && (
        <p className="font-mono text-[11px] text-gray-400">Building diff…</p>
      )}
      {diffQuery.isError && (
        <OsErrorState
          message="Couldn't build the diff"
          onRetry={() => void diffQuery.refetch()}
        />
      )}
      {diffQuery.data && <OsDiffHunks hunks={diffQuery.data.hunks} />}
    </div>
  );
}

function OsVersionRow({
  version,
  isCurrent,
  isComparing,
  onToggleCompare,
  onRestore,
}: {
  version: OsDocumentVersion;
  isCurrent: boolean;
  isComparing: boolean;
  onToggleCompare: () => void;
  onRestore: () => void;
}) {
  return (
    <li className="border-t border-line-soft py-3 first:border-t-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-semibold text-alloro-orange">
              v{version.version_no}
            </span>
            {isCurrent && (
              <span className="rounded-full bg-accent-soft px-1.5 py-px font-mono text-[9px] font-semibold uppercase text-alloro-orange">
                Current
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-gray-400"
              title={formatOsDateTime(version.created_at)}
            >
              <Clock className="h-2.5 w-2.5" strokeWidth={1.5} />
              {formatOsRelativeTime(version.created_at)}
            </span>
          </div>
          {version.ai_change_summary && (
            <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-gray-600">
              {version.ai_change_summary}
            </p>
          )}
          {version.human_note && (
            <p className="mt-1 line-clamp-1 font-mono text-[10px] text-gray-400">
              note: {version.human_note}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleCompare}
            aria-label={`Compare v${version.version_no}`}
            title="Compare"
            className={`flex h-6 w-6 items-center justify-center rounded-[7px] transition-colors duration-150 ${
              isComparing
                ? "bg-accent-soft text-alloro-orange"
                : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            }`}
          >
            <GitCompareArrows className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          {!isCurrent && (
            <button
              type="button"
              onClick={onRestore}
              aria-label={`Restore v${version.version_no}`}
              title="Restore"
              className="flex h-6 w-6 items-center justify-center rounded-[7px] text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function OsRailPlaceholder({
  icon: Icon,
  title,
  phase,
}: {
  icon: typeof MessageSquare;
  title: string;
  phase: string;
}) {
  return (
    <section className="py-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-400">
        <Icon className="h-4 w-4" strokeWidth={1.5} />
        {title}
      </h3>
      <p className="mt-1.5 pl-6 font-mono text-[11px] text-gray-300">
        arrives in {phase}
      </p>
    </section>
  );
}

export function OsHistoryRail({
  documentId,
  currentVersionNo,
}: {
  documentId: string;
  currentVersionNo: number | null;
}) {
  const versionsQuery = useAdminOsVersions(documentId);
  const restoreVersion = useRestoreOsVersion(documentId);
  const confirm = useConfirm();
  const [comparingVersionNo, setComparingVersionNo] = useState<number | null>(
    null,
  );

  const handleRestore = async (version: OsDocumentVersion) => {
    const confirmed = await confirm({
      title: `Restore v${version.version_no}?`,
      message: `This creates a new version whose content matches v${version.version_no}. History is preserved.`,
      confirmLabel: "Restore",
    });
    if (confirmed) restoreVersion.mutate(version.version_no);
  };

  const versions = versionsQuery.data?.versions ?? [];
  // Comparing the current version shows its pending draft delta instead.
  const compareTo: number | "draft" =
    comparingVersionNo !== null && comparingVersionNo === currentVersionNo
      ? "draft"
      : (currentVersionNo ?? "draft");

  return (
    <div className="divide-y divide-line-soft">
      <section className="py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <History className="h-4 w-4" strokeWidth={1.5} />
          History
        </h3>
        <div className="mt-2">
          {versionsQuery.isLoading && (
            <p className="font-mono text-[11px] text-gray-400">
              Loading history…
            </p>
          )}
          {versionsQuery.isError && (
            <OsErrorState
              message="Couldn't load the version history"
              onRetry={() => void versionsQuery.refetch()}
            />
          )}
          {!versionsQuery.isLoading && versions.length === 0 && (
            <p className="font-mono text-[11px] text-gray-300">
              No published versions yet.
            </p>
          )}
          <ul>
            {versions.map((version) => (
              <OsVersionRow
                key={version.id}
                version={version}
                isCurrent={version.version_no === currentVersionNo}
                isComparing={comparingVersionNo === version.version_no}
                onToggleCompare={() =>
                  setComparingVersionNo((current) =>
                    current === version.version_no ? null : version.version_no,
                  )
                }
                onRestore={() => void handleRestore(version)}
              />
            ))}
          </ul>
          {comparingVersionNo !== null && (
            <OsVersionDiffBlock
              documentId={documentId}
              from={comparingVersionNo}
              to={compareTo}
              onClose={() => setComparingVersionNo(null)}
            />
          )}
        </div>
      </section>
      <OsRelatedRail documentId={documentId} />
      <OsRailPlaceholder icon={MessageSquare} title="Comments" phase="P7" />
    </div>
  );
}
