import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  History,
  Loader2,
  Plug,
  Shield,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  backfillRybbitHistory,
  createRybbitIntegration,
  disableRybbitLegacySnippets,
  fetchRybbitStatus,
  type Integration,
  type RybbitLegacySnippet,
  type RybbitStatus,
} from "../../../api/integrations";
import { useConfirm } from "../../ui/ConfirmModal";
import IntegrationPanel from "./IntegrationPanel";
import { RybbitPerformanceDashboard } from "./RybbitPerformanceDashboard";

interface Props {
  projectId: string;
  integration: Integration | null;
  onRefresh: () => void;
}

export default function RybbitTab({
  projectId,
  integration,
  onRefresh,
}: Props) {
  const confirm = useConfirm();
  const [status, setStatus] = useState<RybbitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [siteId, setSiteId] = useState("");

  const loadStatus = async () => {
    setLoading(true);
    try {
      const result = await fetchRybbitStatus(projectId);
      setStatus(result.data);
      setSiteId((current) => current || result.data.suggestedSiteId || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load Rybbit status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, integration?.id]);

  const activeIntegration = integration || status?.integration || null;
  const blockingProjectSnippets = useMemo(
    () =>
      (status?.blockingLegacySnippets ?? []).filter((snippet) => snippet.canDisable),
    [status],
  );
  const hasTemplateBlocker = (status?.blockingLegacySnippets ?? []).some(
    (snippet) => !snippet.canDisable,
  );
  const isBlocked = (status?.blockingLegacySnippets.length ?? 0) > 0;

  const handleDisableLegacy = async () => {
    if (blockingProjectSnippets.length === 0) return;
    const ok = await confirm({
      title: "Disable legacy Rybbit script?",
      message:
        "This disables the detected project-level header/footer Rybbit script so the integration can own tracking injection. It does not delete the snippet.",
      confirmLabel: "Disable script",
      variant: "danger",
    });
    if (!ok) return;

    setSaving(true);
    try {
      const result = await disableRybbitLegacySnippets(
        projectId,
        blockingProjectSnippets.map((snippet) => snippet.id),
      );
      setStatus(result.data);
      toast.success("Legacy Rybbit script disabled");
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disable script");
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    if (!siteId.trim()) {
      toast.error("Enter the Rybbit site ID first");
      return;
    }

    setSaving(true);
    try {
      const result = await createRybbitIntegration(projectId, {
        siteId: siteId.trim(),
      });
      setStatus(result.data.status);
      toast.success("Rybbit integration connected");
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect Rybbit");
    } finally {
      setSaving(false);
    }
  };

  const handleBackfill = async () => {
    if (!activeIntegration) return;
    const ok = await confirm({
      title: "Fetch all historic Rybbit data?",
      message:
        "This clears stored Rybbit daily rows and harvest activity for this website, then rebuilds history from Rybbit through the latest complete reporting day.",
      confirmLabel: "Fetch history",
      variant: "danger",
    });
    if (!ok) return;

    setBackfilling(true);
    try {
      const result = await backfillRybbitHistory(
        projectId,
        activeIntegration.id,
      );
      toast.success(
        result.data.queued
          ? `Historic refresh queued for ${result.data.queuedDays} days`
          : result.data.message || "No complete Rybbit history to fetch yet",
      );
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to queue history");
    } finally {
      setBackfilling(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading Rybbit status...
      </div>
    );
  }

  const connectedSiteId = activeIntegration?.metadata?.siteId
    ? String(activeIntegration.metadata.siteId)
    : null;

  const renderLegacyWarning = () => {
    const blockers = status?.blockingLegacySnippets ?? [];
    if (blockers.length === 0) return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Legacy Rybbit script detected</p>
            <p className="mt-1 text-xs leading-relaxed">
              Disable the old header/footer script before connecting Rybbit
              here, otherwise analytics can double-count.
            </p>
            <div className="mt-3 space-y-2">
              {blockers.map((snippet) => (
                <SnippetRow key={snippet.id} snippet={snippet} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {blockingProjectSnippets.length > 0 && (
                <button
                  type="button"
                  onClick={handleDisableLegacy}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Disable project script
                </button>
              )}
              {hasTemplateBlocker && (
                <span className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
                  Template script must be removed in Code Manager
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  if (!activeIntegration) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {renderLegacyWarning()}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm"
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
              <BarChart3 className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Connect Rybbit Analytics
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-gray-500">
              Add the Rybbit site ID for this website. Alloro will inject the
              tracking script from the integration registry once legacy scripts
              are cleared.
            </p>
            <div className="mx-auto mt-5 max-w-md text-left">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Rybbit site ID
              </label>
              <input
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
                placeholder="265a78f78f4e"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-900 outline-none transition focus:border-purple-300 focus:ring-2 focus:ring-purple-100"
              />
            </div>
            <button
              type="button"
              onClick={handleConnect}
              disabled={saving || isBlocked}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              Connect Rybbit
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      {renderLegacyWarning()}
      <IntegrationPanel
        integration={activeIntegration}
        projectId={projectId}
        onRefresh={onRefresh}
      >
        <RybbitPerformanceDashboard
          projectId={projectId}
          integrationId={activeIntegration.id}
        />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                Site ID
              </div>
              <div className="flex gap-2">
                <input
                  value={siteId}
                  onChange={(event) => setSiteId(event.target.value)}
                  placeholder={connectedSiteId || "Rybbit site ID"}
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs font-medium text-gray-900 outline-none transition focus:border-purple-300 focus:ring-2 focus:ring-purple-100"
                />
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={saving || isBlocked || siteId.trim() === connectedSiteId}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 transition hover:bg-purple-100 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                  Save
                </button>
              </div>
            </div>
            <div>
              <div className="text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                Management
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700">
                  <Shield className="w-3 h-3" />
                  Managed by Alloro
                </span>
                <button
                  type="button"
                  onClick={handleBackfill}
                  disabled={backfilling}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  {backfilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
                  Fetch History
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </IntegrationPanel>
    </div>
  );
}

function SnippetRow({ snippet }: { snippet: RybbitLegacySnippet }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-amber-950">
            {snippet.name}
          </div>
          <div className="mt-0.5 text-[11px] text-amber-700">
            {snippet.scope} · {snippet.location} · site ID {snippet.siteId || "--"}
          </div>
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
          Enabled
        </span>
      </div>
      <div className="mt-1 truncate font-mono text-[10px] text-amber-700">
        {snippet.codePreview}
      </div>
    </div>
  );
}
