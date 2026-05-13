import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  disableClarityLegacySnippets,
  fetchClarityStatus,
  saveClarityIntegration,
  type ClarityStatus,
  type Integration,
} from "../../../api/integrations";
import { useConfirm } from "../../ui/ConfirmModal";
import ClarityLegacyWarning from "./ClarityLegacyWarning";
import ClaritySettingsCard from "./ClaritySettingsCard";
import IntegrationPanel from "./IntegrationPanel";

type ClarityTabProps = {
  projectId: string;
  integration: Integration | null;
  onRefresh: () => void;
};

export default function ClarityTab({
  projectId,
  integration,
  onRefresh,
}: ClarityTabProps) {
  const confirm = useConfirm();
  const [status, setStatus] = useState<ClarityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clarityProjectId, setClarityProjectId] = useState("");
  const [apiToken, setApiToken] = useState("");

  const loadStatus = async () => {
    setLoading(true);
    try {
      const result = await fetchClarityStatus(projectId);
      setStatus(result.data);
      setClarityProjectId((current) => current || result.data.suggestedProjectId || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load Clarity status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, integration?.id]);

  const activeIntegration = integration || status?.integration || null;
  const connectedProjectId = activeIntegration?.metadata?.projectId
    ? String(activeIntegration.metadata.projectId)
    : null;
  const hasDataExportToken =
    status?.hasDataExportToken ?? activeIntegration?.type === "hybrid";
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
      title: "Disable legacy Clarity script?",
      message:
        "This disables the detected project-level header/footer Clarity script so the integration can own tracking injection. It does not delete the snippet.",
      confirmLabel: "Disable script",
      variant: "danger",
    });
    if (!ok) return;

    setSaving(true);
    try {
      const result = await disableClarityLegacySnippets(
        projectId,
        blockingProjectSnippets.map((snippet) => snippet.id),
      );
      setStatus(result.data);
      toast.success("Legacy Clarity script disabled");
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disable script");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!clarityProjectId.trim()) {
      toast.error("Enter the Clarity Project ID first");
      return;
    }

    setSaving(true);
    try {
      const result = await saveClarityIntegration(projectId, {
        projectId: clarityProjectId.trim(),
        apiToken: apiToken.trim() || undefined,
      });
      setStatus(result.data.status);
      setApiToken("");
      toast.success(
        apiToken.trim()
          ? "Clarity tracking and Data Export saved"
          : "Clarity tracking saved",
      );
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Clarity");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading Clarity status...
      </div>
    );
  }

  const legacyWarning = (
    <ClarityLegacyWarning
      blockers={status?.blockingLegacySnippets ?? []}
      blockingProjectSnippets={blockingProjectSnippets}
      hasTemplateBlocker={hasTemplateBlocker}
      isSaving={saving}
      onDisableLegacy={handleDisableLegacy}
    />
  );
  const settingsCard = (
    <ClaritySettingsCard
      clarityProjectId={clarityProjectId}
      connectedProjectId={connectedProjectId}
      hasDataExportToken={hasDataExportToken}
      isBlocked={isBlocked}
      isSaving={saving}
      apiToken={apiToken}
      onApiTokenChange={setApiToken}
      onProjectIdChange={setClarityProjectId}
      onSave={handleSave}
    />
  );

  if (!activeIntegration) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {legacyWarning}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm"
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Eye className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Connect Microsoft Clarity
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-gray-500">
              Add the Clarity Project ID to let Alloro inject the tracking
              script. Add an API token only when this website should also pull
              recent Data Export metrics.
            </p>
            <div className="mt-5 text-left">{settingsCard}</div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      {legacyWarning}
      <IntegrationPanel
        integration={activeIntegration}
        projectId={projectId}
        onRefresh={onRefresh}
        allowHarvestActions={hasDataExportToken}
        harvestUnavailableMessage="Add a Clarity API token to enable Data Export"
      >
        {settingsCard}
      </IntegrationPanel>
    </div>
  );
}
