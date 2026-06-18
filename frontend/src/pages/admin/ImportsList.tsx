import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  AlertCircle,
  Loader2,
  Trash2,
  Plus,
  Clock,
  Copy,
  Check,
  Upload,
  FileCode,
  Image,
  FileText,
  Type,
  File,
  X,
} from "lucide-react";
import {
  fetchImports,
  createImport,
  deleteImport,
  getImportUrl,
} from "../../api/imports";
import type { ImportSummary } from "../../api/imports";
import {
  FilterBar,
  EmptyState,
  Badge,
  ActionButton,
} from "../../components/ui/DesignSystem";
import { ConfirmModal } from "../../components/settings/ConfirmModal";
import { AlertModal } from "../../components/ui/AlertModal";
import { logger } from "../../lib/logger";
import { formatFileSize, formatRelativeTime } from "./importsList.utils";

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "css", label: "CSS" },
  { value: "javascript", label: "JavaScript" },
  { value: "image", label: "Image" },
  { value: "font", label: "Font" },
  { value: "file", label: "File" },
];

const TYPE_ICONS: Record<string, typeof FileCode> = {
  css: FileCode,
  javascript: FileCode,
  image: Image,
  font: Type,
  file: File,
};

const TYPE_COLORS: Record<string, string> = {
  css: "bg-blue-100 text-blue-700",
  javascript: "bg-yellow-100 text-yellow-700",
  image: "bg-purple-100 text-purple-700",
  font: "bg-pink-100 text-pink-700",
  file: "bg-gray-100 text-gray-700",
};

export default function ImportsList() {
  const navigate = useNavigate();
  const [imports, setImports] = useState<ImportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Action states
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedFilename, setCopiedFilename] = useState<string | null>(null);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMode, setCreateMode] = useState<"file" | "text">("file");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newFilename, setNewFilename] = useState("");
  const [newMimeType, setNewMimeType] = useState("text/css");
  const [newTextContent, setNewTextContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<globalThis.File | null>(null);
  const [creating, setCreating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const loadImports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchImports({
        type: typeFilter !== "all" ? typeFilter : undefined,
        search: searchQuery || undefined,
      });
      setImports(response.data);
    } catch (err) {
      logger.error("Failed to fetch imports:", err);
      setError(err instanceof Error ? err.message : "Failed to load imports");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, searchQuery]);

  useEffect(() => {
    loadImports();
  }, [loadImports]);

  const handleCopyUrl = (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}${getImportUrl(filename)}`;
    navigator.clipboard.writeText(url);
    setCopiedFilename(filename);
    setTimeout(() => setCopiedFilename(null), 2000);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingId) return;

    setConfirmModal({
      isOpen: true,
      title: "Delete Import",
      message: "Are you sure you want to DELETE this import? This will remove all versions.",
      type: "danger",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          setDeletingId(id);
          await deleteImport(id);
          await loadImports();
        } catch (err) {
          setAlertModal({
            isOpen: true,
            title: "Delete Failed",
            message: err instanceof Error ? err.message : "Failed to delete import",
            type: "error",
          });
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const handleCreate = async () => {
    if (creating) return;

    const filename = newFilename.trim();
    const displayName = newDisplayName.trim() || filename;

    if (!filename) {
      setAlertModal({ isOpen: true, title: "Validation Error", message: "Filename is required", type: "error" });
      return;
    }

    if (createMode === "file" && !selectedFile) {
      setAlertModal({ isOpen: true, title: "Validation Error", message: "Please select a file", type: "error" });
      return;
    }

    if (createMode === "text" && !newTextContent.trim()) {
      setAlertModal({ isOpen: true, title: "Validation Error", message: "Please enter content", type: "error" });
      return;
    }

    try {
      setCreating(true);
      const formData = new FormData();
      formData.append("display_name", displayName);
      formData.append("filename", filename);

      if (createMode === "file" && selectedFile) {
        formData.append("file", selectedFile);
      } else {
        formData.append("text_content", newTextContent);
        formData.append("mime_type", newMimeType);
      }

      const response = await createImport(formData);
      setShowCreateModal(false);
      resetCreateForm();
      navigate(`/admin/templates/imports/${response.data.id}`);
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: "Create Failed",
        message: err instanceof Error ? err.message : "Failed to create import",
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setCreateMode("file");
    setNewDisplayName("");
    setNewFilename("");
    setNewMimeType("text/css");
    setNewTextContent("");
    setSelectedFile(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!newFilename) {
        setNewFilename(file.name);
      }
      if (!newDisplayName) {
        setNewDisplayName(file.name);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!newFilename) {
        setNewFilename(file.name);
      }
      if (!newDisplayName) {
        setNewDisplayName(file.name);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge label={`${imports.length} total`} color="blue" />
        </div>
        <div className="flex items-center gap-2">
          <ActionButton
            label="New Import"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setShowCreateModal(true)}
            variant="primary"
          />
          <ActionButton
            label={loading ? "Loading" : "Refresh"}
            icon={
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
            }
            onClick={() => loadImports()}
            variant="secondary"
            disabled={loading}
            loading={loading}
          />
        </div>
      </div>

      {/* Filters */}
      <FilterBar>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Type
            </span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by filename..."
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-all hover:border-gray-300 focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
            />
          </div>
          <ActionButton
            label="Reset"
            onClick={() => {
              setTypeFilter("all");
              setSearchQuery("");
            }}
            variant="secondary"
          />
        </div>
      </FilterBar>

      {/* Error State */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">
                Error loading imports
              </p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <ActionButton
              label="Retry"
              onClick={() => loadImports()}
              variant="danger"
              size="sm"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading / Empty / List */}
      {loading && imports.length === 0 ? (
        <motion.div
          className="flex items-center justify-center py-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading imports...
          </div>
        </motion.div>
      ) : imports.length === 0 ? (
        <EmptyState
          icon={<Upload className="w-12 h-12" />}
          title="No imports found"
          description="Upload your first CSS, JS, or image file to self-host it for your templates."
          action={{
            label: "New Import",
            onClick: () => setShowCreateModal(true),
          }}
        />
      ) : (
        <div className="space-y-3">
          {imports.map((imp, index) => {
            const Icon = TYPE_ICONS[imp.type] || FileText;
            const colorClass = TYPE_COLORS[imp.type] || TYPE_COLORS.file;

            return (
              <motion.div
                key={imp.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                onClick={() =>
                  navigate(`/admin/templates/imports/${imp.id}`)
                }
                className="rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md cursor-pointer"
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Type Icon */}
                    <div
                      className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-base font-semibold text-gray-900">
                            {imp.display_name}
                          </span>
                          <p className="text-xs text-gray-400 font-mono truncate mt-0.5">
                            {imp.filename}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Type badge */}
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${colorClass}`}
                          >
                            {imp.type.toUpperCase()}
                          </span>
                          {/* Status */}
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                              imp.status === "published"
                                ? "border-green-200 bg-green-100 text-green-700"
                                : imp.status === "active"
                                ? "border-blue-200 bg-blue-100 text-blue-700"
                                : "border-red-200 bg-red-100 text-red-700"
                            }`}
                          >
                            {imp.status === "published"
                              ? "Published"
                              : imp.status === "active"
                              ? "Active"
                              : "Deprecated"}
                          </span>
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="text-gray-500">
                          v{imp.published_version || imp.latest_version}
                        </span>
                        <span className="text-gray-300">|</span>
                        <span className="text-gray-500">
                          {imp.version_count} version
                          {imp.version_count !== 1 ? "s" : ""}
                        </span>
                        <span className="text-gray-300">|</span>
                        <div className="flex items-center gap-1.5 text-gray-500">
                          <Clock className="h-3.5 w-3.5 text-gray-400" />
                          <span>
                            Updated {formatRelativeTime(imp.updated_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      className="flex items-center gap-2 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Copy URL */}
                      <motion.button
                        onClick={(e) => handleCopyUrl(imp.filename, e)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {copiedFilename === imp.filename ? (
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

                      {/* Delete */}
                      {deletingId === imp.id ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Deleting...
                        </span>
                      ) : (
                        <motion.button
                          onClick={(e) => handleDelete(imp.id, e)}
                          disabled={deletingId !== null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Summary Stats */}
      {!loading && !error && imports.length > 0 && (
        <motion.div
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-sm text-gray-600">
            Showing {imports.length} import
            {imports.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-6 text-sm">
            {["css", "javascript", "image", "font", "file"].map((type) => {
              const count = imports.filter((i) => i.type === type).length;
              if (count === 0) return null;
              return (
                <div key={type} className="flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      type === "css"
                        ? "bg-blue-500"
                        : type === "javascript"
                        ? "bg-yellow-500"
                        : type === "image"
                        ? "bg-purple-500"
                        : type === "font"
                        ? "bg-pink-500"
                        : "bg-gray-400"
                    }`}
                  />
                  <span className="text-gray-600">
                    <strong className="text-gray-900">{count}</strong>{" "}
                    {type}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setShowCreateModal(false);
              resetCreateForm();
            }}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-900">
                  New Import
                </h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-5 space-y-5">
                {/* Mode Toggle */}
                <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                  <button
                    onClick={() => setCreateMode("file")}
                    className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                      createMode === "file"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    <Upload className="w-4 h-4 inline mr-2" />
                    Upload File
                  </button>
                  <button
                    onClick={() => setCreateMode("text")}
                    className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                      createMode === "text"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    <FileCode className="w-4 h-4 inline mr-2" />
                    Write Code
                  </button>
                </div>

                {/* Display Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="e.g. Custom Tailwind CSS"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
                  />
                </div>

                {/* Filename (URL slug) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Filename (used in URL)
                  </label>
                  <input
                    type="text"
                    value={newFilename}
                    onChange={(e) => setNewFilename(e.target.value)}
                    placeholder="e.g. tailwind.min.css"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
                  />
                  {newFilename && (
                    <p className="text-xs text-gray-400">
                      URL: /api/imports/{newFilename}
                    </p>
                  )}
                </div>

                {/* File Upload Mode */}
                {createMode === "file" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      File
                    </label>
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
                            Drag & drop or click to select a file
                          </p>
                          <p className="text-xs text-gray-400">
                            CSS, JS, images, fonts, etc. (max 25 MB)
                          </p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                )}

                {/* Text Content Mode */}
                {createMode === "text" && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Content Type
                      </label>
                      <select
                        value={newMimeType}
                        onChange={(e) => setNewMimeType(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
                      >
                        <option value="text/css">CSS</option>
                        <option value="application/javascript">
                          JavaScript
                        </option>
                        <option value="text/plain">Plain Text</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Content
                      </label>
                      <textarea
                        value={newTextContent}
                        onChange={(e) => setNewTextContent(e.target.value)}
                        placeholder="Paste your CSS or JavaScript here..."
                        rows={8}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 resize-none"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                <ActionButton
                  label="Cancel"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  variant="secondary"
                />
                <ActionButton
                  label={creating ? "Creating..." : "Create Import"}
                  icon={
                    creating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )
                  }
                  onClick={handleCreate}
                  variant="primary"
                  disabled={creating || !newFilename.trim()}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        confirmText="Delete"
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
