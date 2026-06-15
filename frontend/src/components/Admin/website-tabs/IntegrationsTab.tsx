import { useState, useEffect, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plug, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  fetchIntegrations,
  fetchDetectedForms,
  fetchMappings,
  type Integration,
  type DetectedForm,
  type IntegrationFormMapping,
} from "../../../api/integrations";
import { ActionButton } from "../../ui/DesignSystem";
import IntegrationProviderList from "../integrations/IntegrationProviderList";
import HubSpotConnectModal from "../integrations/HubSpotConnectModal";
import HubSpotConnectionPanel from "../integrations/HubSpotConnectionPanel";
import DetectedFormsPanel from "../integrations/DetectedFormsPanel";
import FieldMappingDropdown from "../integrations/FieldMappingDropdown";
import RecentActivityPanel from "../integrations/RecentActivityPanel";
import RybbitTab from "../integrations/RybbitTab";
import ClarityTab from "../integrations/ClarityTab";
import GscTab from "../integrations/GscTab";

interface Props {
  projectId: string;
}

const DEFAULT_PLATFORM = "hubspot";

/**
 * Integrations tab — per-website provider management.
 *
 * Layout: 30/70 sidebar+main (matches PostsTab convention).
 * Sidebar: provider list with connection status badge.
 * Main: state-driven content based on the selected provider.
 *
 * Provider detail state stays local; focused provider flows can use query hooks.
 */
export default function IntegrationsTab({ projectId }: Props) {
  // --- top-level data ---
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- provider selection ---
  const [selectedPlatform, setSelectedPlatform] = useState<string>(
    DEFAULT_PLATFORM,
  );

  // --- modal state ---
  const [showConnectModal, setShowConnectModal] = useState(false);
  /** When true, the modal opens in update mode (rotate token / rename label). */
  const [updateMode, setUpdateMode] = useState(false);

  // --- per-integration secondary data ---
  const [detectedForms, setDetectedForms] = useState<DetectedForm[]>([]);
  const [detectedFormsLoading, setDetectedFormsLoading] = useState(false);
  const [mappings, setMappings] = useState<IntegrationFormMapping[]>([]);
  const [selectedFormName, setSelectedFormName] = useState<string | null>(null);

  /** Bumped whenever the recent-activity panel should refresh. */
  const [activityNonce, setActivityNonce] = useState(0);

  // ----- top-level integration fetch -----
  const loadIntegrations = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetchIntegrations(projectId);
      setIntegrations(res.data || []);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load integrations";
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  // ----- selected integration -----
  const selectedIntegration = useMemo(
    () => integrations.find((i) => i.platform === selectedPlatform) || null,
    [integrations, selectedPlatform],
  );

  // ----- detected-forms + mappings refetch on integration change -----
  const loadDetectedForms = useCallback(async () => {
    setDetectedFormsLoading(true);
    try {
      const res = await fetchDetectedForms(projectId);
      setDetectedForms(res.data || []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load detected forms",
      );
    } finally {
      setDetectedFormsLoading(false);
    }
  }, [projectId]);

  const loadMappings = useCallback(
    async (integrationId: string) => {
      try {
        const res = await fetchMappings(projectId, integrationId);
        setMappings(res.data || []);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to load mappings",
        );
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!selectedIntegration || selectedIntegration.status === "revoked") {
      setDetectedForms([]);
      setMappings([]);
      setSelectedFormName(null);
      return;
    }
    loadDetectedForms();
    loadMappings(selectedIntegration.id);
  }, [selectedIntegration, loadDetectedForms, loadMappings]);

  // Reset selected form when integration changes
  useEffect(() => {
    setSelectedFormName(null);
  }, [selectedIntegration?.id]);

  // ----- handlers -----
  const handleOpenConnect = () => {
    setUpdateMode(false);
    setShowConnectModal(true);
  };

  const handleOpenReconnect = () => {
    setUpdateMode(true);
    setShowConnectModal(true);
  };

  const handleConnectSaved = () => {
    // Refetch the integrations list so status badges and metadata update.
    loadIntegrations();
  };

  const handleDisconnected = () => {
    // Disconnected → drop secondary state and refetch.
    setSelectedFormName(null);
    setMappings([]);
    setDetectedForms([]);
    loadIntegrations();
  };

  const handleValidated = () => {
    // Validation may have flipped a mapping to broken/active.
    if (selectedIntegration) {
      loadMappings(selectedIntegration.id);
    }
    loadIntegrations();
    setActivityNonce((n) => n + 1);
  };

  const handleMappingSaved = (mapping: IntegrationFormMapping | null) => {
    if (!selectedIntegration) return;
    // Refetch mappings so the detected-forms badges update.
    loadMappings(selectedIntegration.id);
    if (mapping === null) {
      // Mapping was deleted — clear selection.
      setSelectedFormName(null);
    }
    setActivityNonce((n) => n + 1);
  };

  const existingMappingForSelectedForm = useMemo(
    () =>
      selectedFormName
        ? mappings.find((m) => m.website_form_name === selectedFormName) || null
        : null,
    [mappings, selectedFormName],
  );

  // ----- render: main content -----
  const renderMain = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="p-6">
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Failed to load integrations</p>
              <p className="mt-0.5">{loadError}</p>
            </div>
          </div>
        </div>
      );
    }

    if (selectedPlatform === "rybbit") {
      return (
        <RybbitTab
          projectId={projectId}
          integration={selectedIntegration}
          onRefresh={loadIntegrations}
        />
      );
    }

    if (selectedPlatform === "clarity") {
      return (
        <ClarityTab
          projectId={projectId}
          integration={selectedIntegration}
          onRefresh={loadIntegrations}
        />
      );
    }

    if (selectedPlatform === "gsc") {
      return (
        <GscTab
          projectId={projectId}
          integration={selectedIntegration}
          onRefresh={loadIntegrations}
        />
      );
    }

    if (selectedPlatform !== "hubspot") {
      return (
        <div className="p-12 text-center text-gray-400 text-sm">
          This provider is not yet available.
        </div>
      );
    }

    // ---- Not connected → connect CTA ----
    if (!selectedIntegration) {
      return (
        <div className="p-12 flex flex-col items-center text-center max-w-md mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center text-alloro-orange mb-4">
            <Plug className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            Connect HubSpot
          </h3>
          <p className="text-sm text-gray-500 mt-1 mb-5 leading-relaxed">
            Push every non-spam form submission into HubSpot so contacts land
            in the right form workflow and existing automations fire as
            expected.
          </p>
          <ActionButton
            label="Connect HubSpot"
            icon={<Plug className="w-4 h-4" />}
            variant="primary"
            onClick={handleOpenConnect}
          />
        </div>
      );
    }

    // ---- Revoked → reconnect CTA ----
    if (selectedIntegration.status === "revoked") {
      return (
        <div className="p-6 space-y-4">
          <HubSpotConnectionPanel
            projectId={projectId}
            integration={selectedIntegration}
            onReconnect={handleOpenReconnect}
            onDeleted={handleDisconnected}
            onValidated={handleValidated}
          />
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">HubSpot token revoked</p>
              <p className="text-xs mt-1 leading-relaxed">
                We can no longer authenticate to HubSpot — submissions are not
                being pushed. Generate a new Private App access token in HubSpot
                and click Reconnect to restore the connection. Your existing
                mappings are preserved.
              </p>
              <button
                type="button"
                onClick={handleOpenReconnect}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition"
              >
                Reconnect HubSpot
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ---- Connected (active or broken) → full panel stack ----
    return (
      <div className="p-6 space-y-4">
        <HubSpotConnectionPanel
          projectId={projectId}
          integration={selectedIntegration}
          onReconnect={handleOpenReconnect}
          onDeleted={handleDisconnected}
          onValidated={handleValidated}
        />

        <DetectedFormsPanel
          detectedForms={detectedForms}
          mappings={mappings}
          selectedFormName={selectedFormName}
          loading={detectedFormsLoading}
          onSelect={(name) =>
            setSelectedFormName((current) =>
              current === name ? null : name,
            )
          }
        />

        <AnimatePresence mode="wait">
          {selectedFormName && (
            <motion.div
              key={`mapper-${selectedFormName}-${existingMappingForSelectedForm?.id || "new"}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <FieldMappingDropdown
                projectId={projectId}
                integrationId={selectedIntegration.id}
                websiteFormName={selectedFormName}
                existingMapping={existingMappingForSelectedForm}
                onSaved={handleMappingSaved}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <RecentActivityPanel
          key={`activity-${selectedIntegration.id}-${activityNonce}`}
          projectId={projectId}
          integrationId={selectedIntegration.id}
        />
      </div>
    );
  };

  return (
    <div
      className="flex bg-white overflow-hidden rounded-xl border border-gray-200 shadow-sm"
      style={{ minHeight: 480 }}
    >
      {/* Sidebar — 30% */}
      <div className="w-[30%] min-w-[220px] max-w-[320px] flex-shrink-0 bg-gray-50/50">
        <IntegrationProviderList
          integrations={integrations}
          selectedPlatform={selectedPlatform}
          onSelectPlatform={setSelectedPlatform}
        />
      </div>

      {/* Main — 70% */}
      <div className="flex-1 min-w-0 overflow-y-auto">{renderMain()}</div>

      {/* Connect / update modal */}
      <AnimatePresence>
        {showConnectModal && (
          <HubSpotConnectModal
            projectId={projectId}
            existingIntegration={updateMode ? selectedIntegration : null}
            onClose={() => setShowConnectModal(false)}
            onSaved={handleConnectSaved}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
