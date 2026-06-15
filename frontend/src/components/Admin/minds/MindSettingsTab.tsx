import { useState, useEffect } from "react";
import {
  Save,
  Loader2,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  BookOpen,
  Crown,
  Globe,
  X,
  Key,
  Copy,
  Check,
  Settings,
  Send,
  Shield,
  Ban,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useConfirm } from "../../ui/ConfirmModal";
import { ActionButton } from "../../ui/DesignSystem";
import { getErrorMessage } from "../../../lib/errorMessage";
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
  const ALL_WORK_TYPES = ["text", "markdown", "image", "video", "pdf", "docx", "audio"];
  const ALL_PUBLISH_TARGETS = [
    "internal_only",
    "post_to_x",
    "post_to_instagram",
    "post_to_facebook",
    "post_to_youtube",
    "post_to_gbp",
  ];
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
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Sources</h3>
          <ActionButton
            label="Add Source"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowAddSource(true)}
            variant="secondary"
            size="sm"
          />
        </div>

        {showAddSource && (
          <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-600">New Source</span>
              <button
                onClick={() => setShowAddSource(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                value={newSourceUrl}
                onChange={(e) => setNewSourceUrl(e.target.value)}
                placeholder="https://example.com/blog"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange"
              />
              <input
                type="text"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                placeholder="Name (optional)"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange"
              />
              <div className="flex justify-end">
                <ActionButton
                  label="Add"
                  onClick={handleAddSource}
                  variant="primary"
                  size="sm"
                  disabled={!newSourceUrl.trim()}
                  loading={addingSource}
                />
              </div>
            </div>
          </div>
        )}

        {loadingSources ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : sources.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            No sources added yet.
          </p>
        ) : (
          <div className="space-y-2">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="text-sm text-gray-800 truncate">
                      {source.name || source.url}
                    </span>
                    {!source.is_active && (
                      <span className="text-[10px] font-medium text-gray-400 uppercase">
                        inactive
                      </span>
                    )}
                  </div>
                  {source.name && (
                    <p className="text-xs text-gray-400 truncate mt-0.5 ml-5.5">
                      {source.url}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <button
                    onClick={() => handleToggleSource(source.id, source.is_active)}
                    className="text-gray-400 hover:text-gray-600"
                    title={source.is_active ? "Deactivate" : "Activate"}
                  >
                    {source.is_active ? (
                      <ToggleRight className="h-5 w-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteSource(source.id)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Work Pipeline Configuration
          </h3>
        </div>

        {/* Available Work Types */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-600 mb-2">
            Available Work Creation Types
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_WORK_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => toggleWorkType(type)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  workTypes.includes(type)
                    ? "bg-alloro-orange/10 text-alloro-orange border border-alloro-orange/20"
                    : "bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Available Publish Targets */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-600 mb-2">
            Available Publish Targets
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_PUBLISH_TARGETS.map((target) => (
              <button
                key={target}
                onClick={() => togglePublishTarget(target)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  publishTargets.includes(target)
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200"
                }`}
              >
                {target.replace(/^post_to_/, "").replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Rejection Categories */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-600 mb-2">
            Rejection Categories
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {rejectionCats.map((cat) => (
              <span
                key={cat}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-100"
              >
                {cat.replace(/_/g, " ")}
                <button
                  onClick={() => removeRejectionCategory(cat)}
                  className="hover:text-red-800"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newRejectionCat}
              onChange={(e) => setNewRejectionCat(e.target.value)}
              placeholder="Add category..."
              className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange"
              onKeyDown={(e) => {
                if (e.key === "Enter") addRejectionCategory();
              }}
            />
            <ActionButton
              label="Add"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={addRejectionCategory}
              variant="secondary"
              size="sm"
              disabled={!newRejectionCat.trim()}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <ActionButton
            label="Save Pipeline Config"
            icon={<Save className="h-4 w-4" />}
            onClick={handleSavePipelineConfig}
            variant="primary"
            size="sm"
            loading={savingPipeline}
          />
        </div>
      </section>

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
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              Platform Credentials
            </h3>
          </div>
          <ActionButton
            label="Add Credential"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowAddCred(true)}
            variant="secondary"
            size="sm"
          />
        </div>
        <p className="text-xs text-gray-400 mb-4 leading-relaxed">
          Store API keys for publish targets (X, Instagram, etc.). Credentials
          are encrypted and never shown after creation.
        </p>

        {showAddCred && (
          <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-600">New Credential</span>
              <button onClick={() => setShowAddCred(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-2">
              <select
                value={newCredPlatform}
                onChange={(e) => setNewCredPlatform(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange bg-white"
              >
                <option value="">Select platform...</option>
                <option value="x">X (Twitter)</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="youtube">YouTube</option>
                <option value="google_business">Google Business Profile</option>
                <option value="other">Other</option>
              </select>
              <input
                type="text"
                value={newCredLabel}
                onChange={(e) => setNewCredLabel(e.target.value)}
                placeholder="Label (optional)"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange"
              />
              <textarea
                value={newCredKey}
                onChange={(e) => setNewCredKey(e.target.value)}
                placeholder="Paste API key or credentials..."
                rows={3}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange resize-none"
              />
              <div className="flex justify-end">
                <ActionButton
                  label="Save Credential"
                  onClick={handleAddCredential}
                  variant="primary"
                  size="sm"
                  disabled={!newCredPlatform || !newCredKey.trim()}
                  loading={addingCred}
                />
              </div>
            </div>
          </div>
        )}

        {loadingCreds ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : credentials.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            No credentials stored yet.
          </p>
        ) : (
          <div className="space-y-2">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">
                      {cred.platform}
                    </span>
                    {cred.label && (
                      <span className="text-xs text-gray-400">
                        {cred.label}
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-full ${
                        cred.status === "active"
                          ? "bg-green-50 text-green-600"
                          : cred.status === "revoked"
                            ? "bg-red-50 text-red-500"
                            : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {cred.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Added {new Date(cred.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {cred.status === "active" && (
                    <button
                      onClick={() => handleRevokeCredential(cred.id)}
                      className="text-gray-400 hover:text-amber-500"
                      title="Revoke"
                    >
                      <Ban className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteCredential(cred.id)}
                    className="text-gray-400 hover:text-red-500"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
