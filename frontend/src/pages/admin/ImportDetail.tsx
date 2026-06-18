import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Editor from "@monaco-editor/react";
import {
  AlertCircle,
  Loader2,
  Save,
  Copy,
  Check,
  Upload,
  Clock,
  FileCode,
  File,
  Eye,
} from "lucide-react";
import {
  fetchImport,
  createNewVersion,
  updateImportStatus,
  deleteImport,
  getImportUrl,
} from "../../api/imports";
import type { ImportVersion } from "../../api/imports";
import {
  AdminPageHeader,
  ActionButton,
  TabBar,
} from "../../components/ui/DesignSystem";
import { ConfirmModal } from "../../components/settings/ConfirmModal";
import { AlertModal } from "../../components/ui/AlertModal";
import { logger } from "../../lib/logger";
import {
  TYPE_COLORS,
  formatFileSize,
  editorLanguage,
} from "./importDetail.utils";
import { VersionCard } from "./ImportDetail/VersionCard";

export default function ImportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [importData, setImportData] = useState<ImportVersion | null>(null);
  const [versions, setVersions] = useState<ImportVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState("editor");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  // Editor state (for text types)
  const [editorContent, setEditorContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // File upload state (for binary types)
  const [selectedFile, setSelectedFile] = useState<globalThis.File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Status action states
  const [publishing, setPublishing] = useState(false);
  const [activating, setActivating] = useState(false);
  const [deprecating, setDeprecating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Copy URL state
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: "danger" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: "error" | "success" | "info";
  }>({ isOpen: false, title: "", message: "" });

  const loadImport = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const response = await fetchImport(id);
      setImportData(response.data);
      setVersions(response.data.versions);
      // Select the current version
      setSelectedVersionId(response.data.id);
      if (response.data.text_content) {
        setEditorContent(response.data.text_content);
      }
      // Set default tab based on type
      const isText = response.data.type === "css" || response.data.type === "javascript";
      setActiveTab(isText ? "editor" : "preview");
      setHasChanges(false);
    } catch (err) {
      logger.error("Failed to fetch import:", err);
      setError(err instanceof Error ? err.message : "Failed to load import");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadImport();
  }, [loadImport]);

  // The version currently being viewed
  const selectedVersion = versions.find((v) => v.id === selectedVersionId) || importData;
  const isTextType = selectedVersion?.type === "css" || selectedVersion?.type === "javascript";

  // When switching versions, update the editor
  useEffect(() => {
    if (selectedVersion?.text_content) {
      setEditorContent(selectedVersion.text_content);
      setHasChanges(false);
    }
  }, [selectedVersionId]);

  const handleEditorChange = (value: string | undefined) => {
    setEditorContent(value || "");
    setHasChanges(true);
  };

  // Save = create new version with updated text content
  const handleSaveAsNewVersion = async () => {
    if (!importData || saving || !hasChanges) return;

    try {
      setSaving(true);
      setSaveMessage(null);
      const formData = new FormData();
      formData.append("text_content", editorContent);
      const response = await createNewVersion(importData.id, formData);
      setSaveMessage("New version created");
      setTimeout(() => setSaveMessage(null), 3000);
      // Reload to get updated version list
      await loadImport();
      // Select the new version
      setSelectedVersionId(response.data.id);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Failed to save");
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadNewVersion = async () => {
    if (!importData || !selectedFile || uploading) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await createNewVersion(importData.id, formData);
      setSelectedFile(null);
      await loadImport();
      setSelectedVersionId(response.data.id);
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: "Upload Failed",
        message: err instanceof Error ? err.message : "Failed to upload new version",
        type: "error",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleStatusChange = (
    versionId: string,
    newStatus: "published" | "active" | "deprecated"
  ) => {
    const version = versions.find((v) => v.id === versionId);
    if (!version) return;

    const doStatusChange = async () => {
      const setter =
        newStatus === "published"
          ? setPublishing
          : newStatus === "active"
          ? setActivating
          : setDeprecating;

      try {
        setter(true);
        await updateImportStatus(versionId, newStatus);
        await loadImport();
      } catch (err) {
        setAlertModal({
          isOpen: true,
          title: "Status Change Failed",
          message: err instanceof Error ? err.message : `Failed to set status to ${newStatus}`,
          type: "error",
        });
      } finally {
        setter(false);
      }
    };

    // Confirmation for publishing when another version is already published
    if (newStatus === "published") {
      const currentPublished = versions.find((v) => v.status === "published");
      if (currentPublished && currentPublished.id !== versionId) {
        setConfirmModal({
          isOpen: true,
          title: "Publish Version",
          message: `Version ${currentPublished.version} is currently published. Publishing version ${version.version} will set version ${currentPublished.version} to "active". Continue?`,
          type: "warning",
          onConfirm: () => {
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
            doStatusChange();
          },
        });
        return;
      }
    }

    doStatusChange();
  };

  const handleDeleteVersion = (versionId: string) => {
    const version = versions.find((v) => v.id === versionId);
    if (!version) return;

    setConfirmModal({
      isOpen: true,
      title: "Delete Version",
      message: `Delete version ${version.version}? This cannot be undone.`,
      type: "danger",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          setDeleting(true);
          await deleteImport(versionId);

          // If we deleted the last version, go back to list
          if (versions.length <= 1) {
            navigate("/admin/templates?tab=imports");
            return;
          }

          await loadImport();
        } catch (err) {
          setAlertModal({
            isOpen: true,
            title: "Delete Failed",
            message: err instanceof Error ? err.message : "Failed to delete version",
            type: "error",
          });
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  const handleCopyUrl = (url: string) => {
    const fullUrl = `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  // Cmd/Ctrl+S shortcut for saving
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasChanges && !saving) {
          handleSaveAsNewVersion();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasChanges, saving, editorContent]);

  if (loading) {
    return (
      <motion.div
        className="flex items-center justify-center py-24"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading import...
        </div>
      </motion.div>
    );
  }

  if (error || !importData) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center py-24 gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-lg font-medium text-gray-700">
          {error || "Import not found"}
        </p>
        <ActionButton
          label="Back to Imports"
          onClick={() => navigate("/admin/templates?tab=imports")}
          variant="secondary"
        />
      </motion.div>
    );
  }

  const publicUrl = getImportUrl(importData.filename);
  const typeColor = TYPE_COLORS[importData.type] || TYPE_COLORS.file;

  const tabs = [
    ...(isTextType
      ? [{ id: "editor", label: "Editor", icon: <FileCode className="w-4 h-4" /> }]
      : [{ id: "preview", label: "Preview", icon: <Eye className="w-4 h-4" /> }]),
    { id: "versions", label: "Versions", icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        icon={<FileCode className="w-6 h-6" />}
        title={importData.display_name}
        description={importData.filename}
        backButton={{
          label: "Back to Imports",
          onClick: () => navigate("/admin/templates?tab=imports"),
        }}
        actionButtons={
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${typeColor}`}>
              {importData.type.toUpperCase()}
            </span>

            {/* Copy public URL */}
            <motion.button
              onClick={() => handleCopyUrl(publicUrl)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {copiedUrl === publicUrl ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy URL
                </>
              )}
            </motion.button>

            {isTextType && activeTab === "editor" && (
              <>
                <AnimatePresence>
                  {saveMessage && (
                    <motion.span
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className={`text-sm font-medium ${
                        saveMessage.includes("created")
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {saveMessage}
                    </motion.span>
                  )}
                </AnimatePresence>
                <ActionButton
                  label={saving ? "Saving..." : "Save as New Version"}
                  icon={
                    saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <div className="relative">
                        <Save className="w-4 h-4" />
                        {hasChanges && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-alloro-orange rounded-full" />
                        )}
                      </div>
                    )
                  }
                  onClick={handleSaveAsNewVersion}
                  variant="primary"
                  disabled={saving || !hasChanges}
                />
              </>
            )}
          </div>
        }
      />

      {/* Tab Bar */}
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Editor Tab (text types) */}
      {activeTab === "editor" && isTextType && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-1 gap-4"
          style={{ height: "calc(100vh - 320px)" }}
        >
          <div
            className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col"
            style={{ minHeight: 550 }}
          >
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {importData.type === "css" ? "CSS" : "JavaScript"} Editor
                {selectedVersion && ` — v${selectedVersion.version}`}
              </span>
              <span className="text-xs text-gray-400">
                {hasChanges
                  ? "Unsaved changes (saves as new version)"
                  : "No changes"}
              </span>
            </div>
            <div className="flex-1">
              <Editor
                height="100%"
                defaultLanguage={editorLanguage(importData.type)}
                value={editorContent}
                onChange={handleEditorChange}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  wordWrap: "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  padding: { top: 12 },
                }}
              />
            </div>
          </div>
        </motion.div>
      )}

      {/* Preview Tab (binary types) */}
      {activeTab === "preview" && !isTextType && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* File Preview */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">
              Preview
            </h3>
            {importData.type === "image" && selectedVersion ? (
              <div className="flex justify-center bg-gray-50 rounded-lg p-4">
                <img
                  src={`${getImportUrl(importData.filename, selectedVersion.version)}`}
                  alt={importData.display_name}
                  className="max-w-full max-h-96 object-contain rounded"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-gray-400">
                <File className="w-16 h-16" />
                <p className="text-sm">
                  Preview not available for {importData.type} files
                </p>
                <p className="text-xs text-gray-300">
                  {selectedVersion
                    ? `${formatFileSize(selectedVersion.file_size)} — ${selectedVersion.mime_type}`
                    : ""}
                </p>
              </div>
            )}
          </div>

          {/* Upload New Version */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
              Upload New Version
            </h3>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                isDragging
                  ? "border-alloro-orange bg-orange-50/50"
                  : "border-gray-200 hover:border-alloro-orange/50 hover:bg-orange-50/30"
              }`}
            >
              {selectedFile ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-900">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(selectedFile.size)} &middot;{" "}
                    {selectedFile.type || "unknown type"}
                  </p>
                </div>
              ) : isDragging ? (
                <div className="space-y-1">
                  <Upload className="w-8 h-8 text-alloro-orange mx-auto" />
                  <p className="text-sm font-medium text-alloro-orange">
                    Drop file here
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="w-8 h-8 text-gray-300 mx-auto" />
                  <p className="text-sm text-gray-500">
                    Drag & drop or click to select a new version file
                  </p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            {selectedFile && (
              <div className="flex items-center gap-2">
                <ActionButton
                  label={uploading ? "Uploading..." : "Upload as New Version"}
                  icon={
                    uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )
                  }
                  onClick={handleUploadNewVersion}
                  variant="primary"
                  disabled={uploading}
                />
                <ActionButton
                  label="Cancel"
                  onClick={() => setSelectedFile(null)}
                  variant="secondary"
                />
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Versions Tab */}
      {activeTab === "versions" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {/* URL Reference */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
              Public URLs
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-50 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 border border-gray-100">
                  {publicUrl}
                </code>
                <motion.button
                  onClick={() => handleCopyUrl(publicUrl)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition"
                  whileTap={{ scale: 0.95 }}
                >
                  {copiedUrl === publicUrl ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </motion.button>
                <span className="text-[10px] text-gray-400 font-medium">
                  Published
                </span>
              </div>
            </div>
          </div>

          {/* Version List */}
          <div className="space-y-3">
            {versions.map((version, index) => {
              const versionUrl = getImportUrl(
                importData.filename,
                version.version
              );
              const isSelected = selectedVersionId === version.id;

              return (
                <VersionCard
                  key={version.id}
                  version={version}
                  index={index}
                  versionUrl={versionUrl}
                  isSelected={isSelected}
                  isTextType={isTextType}
                  copiedUrl={copiedUrl}
                  publishing={publishing}
                  activating={activating}
                  deprecating={deprecating}
                  deleting={deleting}
                  onCopyUrl={handleCopyUrl}
                  onSelectVersion={setSelectedVersionId}
                  onActivateEditorTab={() => setActiveTab("editor")}
                  onStatusChange={handleStatusChange}
                  onDeleteVersion={handleDeleteVersion}
                />
              );
            })}
          </div>

          {/* Upload New Version (for all types) */}
          {!isTextType && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                Upload New Version
              </h3>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                  isDragging
                    ? "border-alloro-orange bg-orange-50/50"
                    : "border-gray-200 hover:border-alloro-orange/50 hover:bg-orange-50/30"
                }`}
              >
                {selectedFile ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-900">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                ) : isDragging ? (
                  <div className="space-y-1">
                    <Upload className="w-8 h-8 text-alloro-orange mx-auto" />
                    <p className="text-sm font-medium text-alloro-orange">
                      Drop file here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="w-8 h-8 text-gray-300 mx-auto" />
                    <p className="text-sm text-gray-500">
                      Drag & drop or click to select a file
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) =>
                  setSelectedFile(e.target.files?.[0] || null)
                }
              />
              {selectedFile && (
                <div className="flex items-center gap-2">
                  <ActionButton
                    label={uploading ? "Uploading..." : "Upload"}
                    icon={
                      uploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )
                    }
                    onClick={handleUploadNewVersion}
                    variant="primary"
                    disabled={uploading}
                  />
                  <ActionButton
                    label="Cancel"
                    onClick={() => setSelectedFile(null)}
                    variant="secondary"
                  />
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Modals */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((prev) => ({ ...prev, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
}
