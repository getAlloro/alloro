import { useState, useEffect } from "react";
import {
  Save,
  Loader2,
  Trash2,
  BookOpen,
  Crown,
  Key,
  Copy,
  Check,
  Send,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useConfirm } from "../../ui/ConfirmModal";
import { ActionButton } from "../../ui/DesignSystem";
import { getErrorMessage } from "../../../lib/errorMessage";
import { SourcesSection } from "./MindSettingsTab/SourcesSection";
import { WorkPipelineSection } from "./MindSettingsTab/WorkPipelineSection";
import { CredentialsSection } from "./MindSettingsTab/CredentialsSection";
import {
  updateMind,
  updateBrain,
  listSources,
  createSource,
  deleteSource,
  toggleSource,
  listVersions,
  publishVersion,
  deleteMind,
  generateMindPortalKey,
  testMindPortal,
  listCredentials,
  createCredential,
  deleteCredential as apiDeleteCredential,
  revokeCredential,
  type MindWithVersion,
  type MindSource,
  type MindVersion,
  type PlatformCredential,
} from "../../../api/minds";

interface MindSettingsTabProps {
  mind: MindWithVersion;
  onMindUpdated: () => void;
  onMindDeleted?: () => void;
}

export function MindSettingsTab({ mind, onMindUpdated, onMindDeleted }: MindSettingsTabProps) {
  const confirm = useConfirm();

  // Personality
  const [personality, setPersonality] = useState(mind.personality_prompt);
  const [savingPersonality, setSavingPersonality] = useState(false);

  // Brain
  const [brainMarkdown, setBrainMarkdown] = useState(
    mind.published_version?.brain_markdown || ""
  );
  const [savingBrain, setSavingBrain] = useState(false);

  // Sources
  const [sources, setSources] = useState<MindSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceName, setNewSourceName] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);

  // Versions
  const [versions, setVersions] = useState<MindVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  // Work pipeline config
  const [workTypes, setWorkTypes] = useState<string[]>(mind.available_work_types || ["text", "markdown"]);
  const [publishTargets, setPublishTargets] = useState<string[]>(mind.available_publish_targets || ["internal_only"]);
  const [rejectionCats, setRejectionCats] = useState<string[]>(mind.rejection_categories || []);
  const [newRejectionCat, setNewRejectionCat] = useState("");
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [portalKey, setPortalKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Test portal
  const [testQuery, setTestQuery] = useState("");
  const [testingPortal, setTestingPortal] = useState(false);
  const [testResponse, setTestResponse] = useState<{ response: string; tokens_used: number } | null>(null);

  // Platform credentials
  const [credentials, setCredentials] = useState<PlatformCredential[]>([]);
  const [loadingCreds, setLoadingCreds] = useState(true);
  const [showAddCred, setShowAddCred] = useState(false);
  const [newCredPlatform, setNewCredPlatform] = useState("");
  const [newCredLabel, setNewCredLabel] = useState("");
  const [newCredKey, setNewCredKey] = useState("");
  const [addingCred, setAddingCred] = useState(false);

  // Delete mind
  const [deletingMind, setDeletingMind] = useState(false);

  useEffect(() => {
    setPersonality(mind.personality_prompt);
    setBrainMarkdown(mind.published_version?.brain_markdown || "");
  }, [mind]);

  useEffect(() => {
    fetchSources();
    fetchVersions();
    fetchCredentials();
  }, [mind.id]);

  const fetchSources = async () => {
    setLoadingSources(true);
    const data = await listSources(mind.id);
    setSources(data);
    setLoadingSources(false);
  };

  const fetchVersions = async () => {
    setLoadingVersions(true);
    const data = await listVersions(mind.id);
    setVersions(data);
    setLoadingVersions(false);
  };

  const fetchCredentials = async () => {
    setLoadingCreds(true);
    const data = await listCredentials(mind.id);
    setCredentials(data);
    setLoadingCreds(false);
  };

  const handleTestPortal = async () => {
    if (!testQuery.trim()) return;
    setTestingPortal(true);
    setTestResponse(null);
    const result = await testMindPortal(mind.id, testQuery.trim());
    if (result) {
      setTestResponse(result);
    } else {
      toast.error("Test portal query failed");
    }
    setTestingPortal(false);
  };

  const handleAddCredential = async () => {
    if (!newCredPlatform.trim() || !newCredKey.trim()) return;
    setAddingCred(true);
    const result = await createCredential(
      mind.id,
      newCredPlatform.trim(),
      newCredKey.trim(),
      newCredLabel.trim() || undefined,
    );
    if (result) {
      toast.success("Credential saved");
      setNewCredPlatform("");
      setNewCredLabel("");
      setNewCredKey("");
      setShowAddCred(false);
      fetchCredentials();
    } else {
      toast.error("Failed to save credential");
    }
    setAddingCred(false);
  };

  const handleDeleteCredential = async (credId: string) => {
    const ok = await confirm({ title: "Delete this credential?", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;
    const deleted = await apiDeleteCredential(mind.id, credId);
    if (deleted) {
      toast.success("Credential deleted");
      fetchCredentials();
    } else {
      toast.error("Failed to delete credential");
    }
  };

  const handleRevokeCredential = async (credId: string) => {
    const ok = await confirm({ title: "Revoke this credential?", message: "The credential will be marked as revoked and can no longer be used.", confirmLabel: "Revoke", variant: "danger" });
    if (!ok) return;
    const revoked = await revokeCredential(mind.id, credId);
    if (revoked) {
      toast.success("Credential revoked");
      fetchCredentials();
    } else {
      toast.error("Failed to revoke credential");
    }
  };

  const handleSavePersonality = async () => {
    setSavingPersonality(true);
    const result = await updateMind(mind.id, { personality_prompt: personality });
    if (result) {
      toast.success("Personality saved");
      onMindUpdated();
    } else {
      toast.error("Failed to save personality");
    }
    setSavingPersonality(false);
  };

  const handleSaveBrain = async () => {
    setSavingBrain(true);
    const result = await updateBrain(mind.id, brainMarkdown);
    if (result) {
      toast.success("Brain saved as new version");
      if (result.warning) {
        toast(result.warning, { icon: "⚠️" });
      }
      onMindUpdated();
      fetchVersions();
    } else {
      toast.error("Failed to save brain");
    }
    setSavingBrain(false);
  };

  const handleAddSource = async () => {
    if (!newSourceUrl.trim()) return;
    setAddingSource(true);
    const result = await createSource(
      mind.id,
      newSourceUrl.trim(),
      newSourceName.trim() || undefined
    );
    if (result) {
      toast.success("Source added");
      setNewSourceUrl("");
      setNewSourceName("");
      setShowAddSource(false);
      fetchSources();
    } else {
      toast.error("Failed to add source");
    }
    setAddingSource(false);
  };

  const handleDeleteSource = async (sourceId: string) => {
    const ok = await confirm({ title: "Delete this source?", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;
    const deleted = await deleteSource(mind.id, sourceId);
    if (deleted) {
      toast.success("Source deleted");
      fetchSources();
    } else {
      toast.error("Failed to delete source");
    }
  };

  const handleToggleSource = async (sourceId: string, currentlyActive: boolean) => {
    const ok = await toggleSource(mind.id, sourceId, !currentlyActive);
    if (ok) {
      setSources((prev) =>
        prev.map((s) =>
          s.id === sourceId ? { ...s, is_active: !currentlyActive } : s
        )
      );
    } else {
      toast.error("Failed to toggle source");
    }
  };

  const handlePublish = async (versionId: string) => {
    setPublishingId(versionId);
    const ok = await publishVersion(mind.id, versionId);
    if (ok) {
      toast.success("Version published");
      onMindUpdated();
      fetchVersions();
    } else {
      toast.error("Failed to publish version");
    }
    setPublishingId(null);
  };

  const handleDeleteMind = async () => {
    const ok = await confirm({
      title: `Permanently delete ${mind.name}?`,
      message: "All data (brain, conversations, sessions, sources) will be lost. This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setDeletingMind(true);
    try {
      const deleted = await deleteMind(mind.id);
      if (deleted) {
        toast.success(`${mind.name} deleted`);
        onMindDeleted?.();
      } else {
        toast.error("Failed to delete mind");
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to delete mind");
    } finally {
      setDeletingMind(false);
    }
  };

  const handleSavePipelineConfig = async () => {
    setSavingPipeline(true);
    const result = await updateMind(mind.id, {
      available_work_types: workTypes,
      available_publish_targets: publishTargets,
      rejection_categories: rejectionCats,
    });
    if (result) {
      toast.success("Pipeline config saved");
      onMindUpdated();
    } else {
      toast.error("Failed to save pipeline config");
    }
    setSavingPipeline(false);
  };

  const handleGeneratePortalKey = async () => {
    setGeneratingKey(true);
    const key = await generateMindPortalKey(mind.id);
    if (key) {
      setPortalKey(key);
      toast.success("Portal key generated — copy it now, it won't be shown again");
    } else {
      toast.error("Failed to generate portal key");
    }
    setGeneratingKey(false);
  };

  const handleCopyPortalKey = () => {
    if (!portalKey) return;
    navigator.clipboard.writeText(portalKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 1500);
  };

  const toggleWorkType = (type: string) => {
    setWorkTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const togglePublishTarget = (target: string) => {
    setPublishTargets((prev) =>
      prev.includes(target)
        ? prev.filter((t) => t !== target)
        : [...prev, target]
    );
  };

  const addRejectionCategory = () => {
    const slug = newRejectionCat.trim().toLowerCase().replace(/\s+/g, "_");
    if (!slug || rejectionCats.includes(slug)) return;
    setRejectionCats((prev) => [...prev, slug]);
    setNewRejectionCat("");
  };

  const removeRejectionCategory = (cat: string) => {
    setRejectionCats((prev) => prev.filter((c) => c !== cat));
  };

  return (
    <div className="space-y-6">
      {/* Personality Section */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Personality Prompt
        </h3>
        <textarea
          value={personality}
          onChange={(e) => setPersonality(e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange resize-none"
        />
        <div className="mt-3 flex justify-end">
          <ActionButton
            label="Save Personality"
            icon={<Save className="h-4 w-4" />}
            onClick={handleSavePersonality}
            variant="primary"
            size="sm"
            loading={savingPersonality}
            disabled={personality === mind.personality_prompt}
          />
        </div>
      </section>

      {/* Brain Editor Section */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Brain (Markdown Knowledge Base)
          </h3>
          <div className="flex items-center gap-2">
            {mind.published_version && (
              <span className="text-xs text-gray-400">
                v{mind.published_version.version_number}
              </span>
            )}
            <span className="text-xs text-gray-400">
              {brainMarkdown.length.toLocaleString()} chars
            </span>
          </div>
        </div>
        <textarea
          value={brainMarkdown}
          onChange={(e) => setBrainMarkdown(e.target.value)}
          rows={20}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono leading-relaxed focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange resize-y"
          placeholder="# Mind Knowledge Base&#10;&#10;Write markdown content here..."
        />
        <div className="mt-3 flex justify-end">
          <ActionButton
            label="Save Brain (New Version)"
            icon={<BookOpen className="h-4 w-4" />}
            onClick={handleSaveBrain}
            variant="primary"
            size="sm"
            loading={savingBrain}
          />
        </div>
      </section>

      {/* Sources Section */}
      <SourcesSection
        sources={sources}
        loadingSources={loadingSources}
        showAddSource={showAddSource}
        setShowAddSource={setShowAddSource}
        newSourceUrl={newSourceUrl}
        setNewSourceUrl={setNewSourceUrl}
        newSourceName={newSourceName}
        setNewSourceName={setNewSourceName}
        addingSource={addingSource}
        handleAddSource={handleAddSource}
        handleToggleSource={handleToggleSource}
        handleDeleteSource={handleDeleteSource}
      />

      {/* Versions Section */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Versions</h3>

        {loadingVersions ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            No versions yet. Save the brain to create the first version.
          </p>
        ) : (
          <div className="space-y-2">
            {versions.map((version) => {
              const isPublished = version.id === mind.published_version_id;
              return (
                <div
                  key={version.id}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    isPublished
                      ? "border-alloro-orange/20 bg-alloro-orange/5"
                      : "border-gray-100 bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-800">
                      v{version.version_number}
                    </span>
                    {isPublished && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-alloro-orange">
                        <Crown className="h-3 w-3" />
                        Published
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {version.brain_markdown.length.toLocaleString()} chars
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(version.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {!isPublished && (
                    <ActionButton
                      label="Publish"
                      onClick={() => handlePublish(version.id)}
                      variant="secondary"
                      size="sm"
                      loading={publishingId === version.id}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Work Pipeline Configuration */}
      <WorkPipelineSection
        workTypes={workTypes}
        publishTargets={publishTargets}
        rejectionCats={rejectionCats}
        newRejectionCat={newRejectionCat}
        setNewRejectionCat={setNewRejectionCat}
        savingPipeline={savingPipeline}
        toggleWorkType={toggleWorkType}
        togglePublishTarget={togglePublishTarget}
        addRejectionCategory={addRejectionCategory}
        removeRejectionCategory={removeRejectionCategory}
        handleSavePipelineConfig={handleSavePipelineConfig}
      />

      {/* Portal Key */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <Key className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Mind Portal Key
          </h3>
        </div>
        <p className="text-xs text-gray-400 mb-4 leading-relaxed">
          Generate an API key for external agents (n8n) to query this mind's
          brain via the Portal endpoint. The key is shown once — copy it
          immediately.
        </p>

        {mind.portal_key_hash && !portalKey && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-xs text-green-700">
            <Check className="h-3.5 w-3.5" />
            Portal key is configured. Generate a new one to rotate.
          </div>
        )}

        {portalKey && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <code className="text-xs text-gray-700 font-mono flex-1 truncate">
              {portalKey}
            </code>
            <button
              onClick={handleCopyPortalKey}
              className="shrink-0 text-gray-500 hover:text-alloro-orange"
            >
              {copiedKey ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}

        <ActionButton
          label={mind.portal_key_hash ? "Rotate Key" : "Generate Key"}
          icon={<Key className="h-4 w-4" />}
          onClick={handleGeneratePortalKey}
          variant="secondary"
          size="sm"
          loading={generatingKey}
        />
      </section>

      {/* Test Mind Portal */}
      {mind.portal_key_hash && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Send className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              Test Mind Portal
            </h3>
          </div>
          <p className="text-xs text-gray-400 mb-4 leading-relaxed">
            Test the Mind Portal response without needing an external tool. Uses JWT auth instead of portal key.
          </p>
          <textarea
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            rows={3}
            placeholder="Ask this mind a question..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange resize-none mb-3"
          />
          <div className="flex justify-end mb-3">
            <ActionButton
              label="Test"
              icon={<Send className="h-4 w-4" />}
              onClick={handleTestPortal}
              variant="primary"
              size="sm"
              loading={testingPortal}
              disabled={!testQuery.trim()}
            />
          </div>
          {testResponse && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Response</span>
                <span className="text-[10px] text-gray-400">{testResponse.tokens_used} tokens</span>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                {testResponse.response}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Platform Credentials */}
      <CredentialsSection
        credentials={credentials}
        loadingCreds={loadingCreds}
        showAddCred={showAddCred}
        setShowAddCred={setShowAddCred}
        newCredPlatform={newCredPlatform}
        setNewCredPlatform={setNewCredPlatform}
        newCredLabel={newCredLabel}
        setNewCredLabel={setNewCredLabel}
        newCredKey={newCredKey}
        setNewCredKey={setNewCredKey}
        addingCred={addingCred}
        handleAddCredential={handleAddCredential}
        handleRevokeCredential={handleRevokeCredential}
        handleDeleteCredential={handleDeleteCredential}
      />

      {/* Danger Zone */}
      <section className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
        <h3 className="text-sm font-semibold text-red-400 mb-2">Danger Zone</h3>
        <p className="text-xs text-[#6a6a75] mb-4">
          Permanently delete {mind.name} and all associated data. This action cannot be undone.
        </p>
        <ActionButton
          label={`Delete ${mind.name}`}
          icon={<Trash2 className="h-4 w-4" />}
          onClick={handleDeleteMind}
          variant="danger"
          size="sm"
          loading={deletingMind}
        />
      </section>
    </div>
  );
}
