import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Play, Search } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  useAiSeoAuditActions,
  useAiSeoAuditRun,
  useAiSeoAuditRuns,
} from "../../../hooks/queries/useAiSeoAuditQueries";
import type { AiSeoAuditScope } from "../../../api/aiSeoAudit";
import { AiSeoAuditRunDetail } from "./AiSeoAuditRunDetail";
import { AiSeoAuditRunList } from "./AiSeoAuditRunList";

export type AiSeoAuditPanelProps = {
  organizationId?: number | null;
  projectId?: string | null;
  defaultUrl?: string | null;
  contextLabel?: string;
  runsScope?: AiSeoAuditScope;
  showUrlAction?: boolean;
  showOrganizationAction?: boolean;
  urlActionLabel?: string;
  organizationActionLabel?: string;
};

export function AiSeoAuditPanel({
  organizationId,
  projectId,
  defaultUrl,
  contextLabel,
  runsScope,
  showUrlAction = true,
  showOrganizationAction = true,
  urlActionLabel = "URL",
  organizationActionLabel = "Org",
}: AiSeoAuditPanelProps) {
  const [url, setUrl] = useState(defaultUrl || "");
  const runsQuery = useAiSeoAuditRuns({
    organizationId,
    scope: runsScope,
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRunId = searchParams.get("run");
  const setSelectedRunId = useCallback(
    (id: string | null) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("run", id);
          else next.delete("run");
          return next;
        },
        { replace: true }
      ),
    [setSearchParams]
  );
  const detailQuery = useAiSeoAuditRun(selectedRunId);
  const actions = useAiSeoAuditActions(organizationId);

  useEffect(() => {
    if (!selectedRunId && runsQuery.data?.runs?.[0]) {
      setSelectedRunId(runsQuery.data.runs[0].id);
    }
  }, [runsQuery.data?.runs, selectedRunId, setSelectedRunId]);

  // If the selected run was deleted (here or elsewhere), drop it so the detail
  // pane doesn't keep showing stale kept-previous data.
  useEffect(() => {
    if (detailQuery.isError && selectedRunId) setSelectedRunId(null);
  }, [detailQuery.isError, selectedRunId, setSelectedRunId]);

  useEffect(() => {
    if (!url && defaultUrl) setUrl(defaultUrl);
  }, [defaultUrl, url]);

  const isRunning =
    actions.runUrlAudit.isPending || actions.runOrganizationAudit.isPending;
  const runs = useMemo(() => runsQuery.data?.runs || [], [runsQuery.data?.runs]);
  const resolvedContextLabel =
    contextLabel ||
    (projectId ? `Website project ${projectId}` : "Standalone URL audit");
  const controlLayoutClass =
    showUrlAction && showOrganizationAction
      ? "grid w-full gap-3 lg:max-w-xl lg:grid-cols-[1fr_auto_auto]"
      : showUrlAction
        ? "grid w-full gap-3 lg:max-w-xl lg:grid-cols-[1fr_auto]"
        : "flex w-full justify-end lg:max-w-xs";

  const handleRunUrlAudit = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toast.error("Enter a URL to audit.");
      return;
    }
    try {
      const detail = await actions.runUrlAudit.mutateAsync(trimmedUrl);
      setSelectedRunId(detail.run.id);
      toast.success("URL audit queued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "URL audit failed.");
    }
  };

  const handleRunOrganizationAudit = async () => {
    if (!organizationId) {
      toast.error("Select an organization first.");
      return;
    }
    try {
      const detail = await actions.runOrganizationAudit.mutateAsync();
      setSelectedRunId(detail.run.id);
      toast.success("Organization audit queued");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Organization audit failed."
      );
    }
  };

  const handleDeleteRun = async (runId: string) => {
    try {
      await actions.deleteRun.mutateAsync(runId);
      if (selectedRunId === runId) setSelectedRunId(null);
      toast.success("Run deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed.");
    }
  };

  const handleClearAllRuns = async () => {
    try {
      const { deletedCount } = await actions.deleteAllRuns.mutateAsync({
        organizationId: organizationId ?? undefined,
        scope: runsScope ?? undefined,
      });
      setSelectedRunId(null);
      toast.success(
        `Deleted ${deletedCount} run${deletedCount === 1 ? "" : "s"}`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Clear all failed.");
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-black tracking-tight text-alloro-navy">
              {resolvedContextLabel}
            </h3>
          </div>

          <div className={controlLayoutClass}>
            {showUrlAction && (
              <>
                <label className="sr-only" htmlFor="ai-seo-audit-url">
                  Audit URL
                </label>
                <input
                  id="ai-seo-audit-url"
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com"
                  className="min-h-11 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-900 transition focus:border-alloro-orange focus:bg-white focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
                />
                <button
                  type="button"
                  onClick={handleRunUrlAudit}
                  disabled={isRunning}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-alloro-navy px-4 text-sm font-bold text-white transition-all duration-200 hover:scale-[1.02] hover:bg-alloro-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actions.runUrlAudit.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {urlActionLabel}
                </button>
              </>
            )}
            {showOrganizationAction && (
              <button
                type="button"
                onClick={handleRunOrganizationAudit}
                disabled={isRunning || !organizationId}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-alloro-orange px-4 text-sm font-bold text-white transition-all duration-200 hover:scale-[1.02] hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actions.runOrganizationAudit.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {organizationActionLabel}
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <AiSeoAuditRunList
          runs={runs}
          selectedRunId={selectedRunId}
          isLoading={runsQuery.isLoading}
          onSelect={setSelectedRunId}
          onDelete={handleDeleteRun}
          onClearAll={handleClearAllRuns}
          isClearing={actions.deleteAllRuns.isPending}
          deletingRunId={
            actions.deleteRun.isPending
              ? (actions.deleteRun.variables as string | undefined) ?? null
              : null
          }
        />
        <AiSeoAuditRunDetail
          detail={
            selectedRunId && !detailQuery.isError ? detailQuery.data : undefined
          }
          isLoading={detailQuery.isFetching && Boolean(selectedRunId)}
        />
      </div>
    </div>
  );
}
