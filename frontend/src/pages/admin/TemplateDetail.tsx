import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Editor from "@monaco-editor/react";
import SectionsEditor from "../../components/Admin/SectionsEditor";
import {
  AlertCircle,
  Loader2,
  FileCode,
  Save,
  Eye,
  Zap,
  Trash2,
  Clock,
  Settings,
  Monitor,
  Smartphone,
  Search,
  Globe,
  Plus,
  ArrowLeft,
  FileText,
  Pencil,
  Layers,
  Menu,
  Star,
} from "lucide-react";
import {
  fetchTemplate,
  updateTemplate,
  deleteTemplate,
  activateTemplate,
  createTemplatePage,
  updateTemplatePage,
  deleteTemplatePage,
} from "../../api/templates";
import type { Template, TemplatePage, Section } from "../../api/templates";
import { fetchTemplateCodeSnippets } from "../../api/codeSnippets";
import type { CodeSnippet } from "../../api/codeSnippets";
import CodeManagerTab from "../../components/Admin/CodeManagerTab";
import PostBlocksTab from "../../components/Admin/PostBlocksTab";
import MenuTemplatesTab from "../../components/Admin/MenuTemplatesTab";
import ReviewBlocksTab from "../../components/Admin/ReviewBlocksTab";
import { renderPage, normalizeSections } from "../../utils/templateRenderer";
import {
  useIframeSelector,
  prepareHtmlForPreview,
} from "../../hooks/useIframeSelector";
import {
  AdminPageHeader,
  ActionButton,
  Badge,
  TabBar,
} from "../../components/ui/DesignSystem";
import { useConfirm } from "../../components/ui/ConfirmModal";
import { logger } from "../../lib/logger";

/**
 * Template Detail Page
 * Pages + Settings tabs for managing a single template
 */
export default function TemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("layouts");

  // Layouts tab state (wrapper/header/footer)
  const [wrapperContent, setWrapperContent] = useState("");
  const [headerContent, setHeaderContent] = useState("");
  const [footerContent, setFooterContent] = useState("");
  const [layoutsUnsaved, setLayoutsUnsaved] = useState(false);
  const [savingLayouts, setSavingLayouts] = useState(false);
  const [layoutsSaveMessage, setLayoutsSaveMessage] = useState<string | null>(null);
  const [activeLayoutField, setActiveLayoutField] = useState<"wrapper" | "header" | "footer">("wrapper");

  // Template pages state
  const [templatePages, setTemplatePages] = useState<TemplatePage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [creatingPage, setCreatingPage] = useState(false);
  const [newPageName, setNewPageName] = useState("");
  const [deletingPageId, setDeletingPageId] = useState<string | null>(null);

  // Page editor state
  const [editorSections, setEditorSections] = useState<Section[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Page name editing
  const [editingPageName, setEditingPageName] = useState(false);
  const [pageNameValue, setPageNameValue] = useState("");
  const [savingPageName, setSavingPageName] = useState(false);

  // Preview state
  const [previewContent, setPreviewContent] = useState("");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile" | "seo">("desktop");

  // Iframe selector for hover/click labels on alloro-tpl components
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const { setupListeners: setupPreviewListeners } = useIframeSelector(previewIframeRef);
  const handlePreviewIframeLoad = useCallback(() => {
    setupPreviewListeners();
  }, [setupPreviewListeners]);

  // Settings state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [activating, setActivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  // Code snippets state
  const [codeSnippets, setCodeSnippets] = useState<CodeSnippet[]>([]);
  const [loadingSnippets, setLoadingSnippets] = useState(false);

  const selectedPage = templatePages.find((p) => p.id === selectedPageId) || null;

  const loadTemplate = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const response = await fetchTemplate(id);
      setTemplate(response.data);
      setTemplatePages(response.data.template_pages || []);
      setNameValue(response.data.name);
      setWrapperContent(response.data.wrapper || "");
      setHeaderContent(response.data.header || "");
      setFooterContent(response.data.footer || "");
    } catch (err) {
      logger.error("Failed to fetch template:", err);
      setError(err instanceof Error ? err.message : "Failed to load template");
    } finally {
      setLoading(false);
      // Manually complete loading indicator
      window.dispatchEvent(new Event('navigation-complete'));
    }
  }, [id]);

  const loadCodeSnippets = useCallback(async () => {
    if (!id) return;

    try {
      setLoadingSnippets(true);
      const response = await fetchTemplateCodeSnippets(id);
      setCodeSnippets(response.data);
    } catch (err) {
      logger.error("Failed to fetch code snippets:", err);
    } finally {
      setLoadingSnippets(false);
    }
  }, [id]);

  useEffect(() => {
    // Trigger loading indicator
    window.dispatchEvent(new Event('navigation-start'));
    loadTemplate();
    loadCodeSnippets();
  }, [loadTemplate, loadCodeSnippets]);

  // Cmd/Ctrl+S keyboard shortcut for saving
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (activeTab === "layouts" && layoutsUnsaved && !savingLayouts) {
          handleSaveLayouts();
        } else if (activeTab === "pages" && selectedPageId && hasUnsavedChanges && !saving) {
          handleSavePage();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, selectedPageId, hasUnsavedChanges, saving, editorSections, layoutsUnsaved, savingLayouts]);

  // Rebuild preview from sections + template layouts
  const rebuildPreview = useCallback(
    (secs: Section[]) => {
      const assembled = renderPage(
        wrapperContent || "{{slot}}",
        headerContent,
        footerContent,
        secs
      );
      setPreviewContent(assembled);
    },
    [wrapperContent, headerContent, footerContent]
  );

  const handleEditorSectionsChange = useCallback(
    (updated: Section[]) => {
      setEditorSections(updated);
      setHasUnsavedChanges(true);
      rebuildPreview(updated);
    },
    [rebuildPreview]
  );

  // Layouts editor change handler
  const handleLayoutFieldChange = (field: "wrapper" | "header" | "footer", value: string | undefined) => {
    const v = value || "";
    if (field === "wrapper") setWrapperContent(v);
    else if (field === "header") setHeaderContent(v);
    else setFooterContent(v);
    setLayoutsUnsaved(true);
  };

  // Save layouts handler
  const handleSaveLayouts = async () => {
    if (!id || savingLayouts) return;

    try {
      setSavingLayouts(true);
      setLayoutsSaveMessage(null);
      const response = await updateTemplate(id, {
        wrapper: wrapperContent,
        header: headerContent,
        footer: footerContent,
      });
      setTemplate(response.data);
      setLayoutsUnsaved(false);
      setLayoutsSaveMessage("Saved");
      setTimeout(() => setLayoutsSaveMessage(null), 2000);
    } catch (err) {
      setLayoutsSaveMessage(err instanceof Error ? err.message : "Failed to save");
      setTimeout(() => setLayoutsSaveMessage(null), 3000);
    } finally {
      setSavingLayouts(false);
    }
  };

  const previewWithScrollbar = (html: string) => {
    const scrollbarStyle = `<style>::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-track{background:#f3f4f6;border-radius:4px}::-webkit-scrollbar-thumb{background:#d66853;border-radius:4px}::-webkit-scrollbar-thumb:hover{background:#c05a47}</style>`;
    if (html.includes("</head>")) {
      return html.replace("</head>", `${scrollbarStyle}</head>`);
    }
    return scrollbarStyle + html;
  };

  const extractTitle = (html: string): string => {
    const match = html.match(/<title[^>]*>(.*?)<\/title>/is);
    return match ? match[1].trim() : "";
  };

  const extractMetaDescription = (html: string): string => {
    const match = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["'][^>]*>/is)
      || html.match(/<meta\s+content=["'](.*?)["']\s+name=["']description["'][^>]*>/is);
    return match ? match[1].trim() : "";
  };

  const extractUrl = (html: string): string => {
    const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["'](.*?)["'][^>]*>/is);
    if (canonical) return canonical[1].trim();
    const ogUrl = html.match(/<meta\s+property=["']og:url["']\s+content=["'](.*?)["'][^>]*>/is);
    if (ogUrl) return ogUrl[1].trim();
    return "https://example.com";
  };

  const extractFavicon = (html: string): string => {
    const match = html.match(/<link\s+[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["'](.*?)["'][^>]*>/is)
      || html.match(/<link\s+[^>]*href=["'](.*?)["'][^>]*rel=["'](?:shortcut )?icon["'][^>]*>/is);
    return match ? match[1].trim() : "";
  };

  const pageTitle = extractTitle(previewContent);
  const pageDescription = extractMetaDescription(previewContent);
  const pageUrl = extractUrl(previewContent);
  const pageFavicon = extractFavicon(previewContent);

  // === Template Page Handlers ===

  const handleSelectPage = (page: TemplatePage) => {
    setSelectedPageId(page.id);
    const secs = normalizeSections(page.sections);
    setEditorSections(secs);
    rebuildPreview(secs);
    setHasUnsavedChanges(false);
    setSaveMessage(null);
    setPageNameValue(page.name);
    setEditingPageName(false);
  };

  const handleBackToList = async () => {
    if (hasUnsavedChanges) {
      const ok = await confirm({ title: "You have unsaved changes. Discard them?", confirmLabel: "Discard", variant: "default" });
      if (!ok) return;
    }
    setSelectedPageId(null);
    setHasUnsavedChanges(false);
    setSaveMessage(null);
    setEditingPageName(false);
  };

  const handleCreatePage = async () => {
    if (!id || !newPageName.trim()) return;

    try {
      setCreatingPage(true);
      const response = await createTemplatePage(id, { name: newPageName.trim() });
      setTemplatePages((prev) => [...prev, response.data]);
      setNewPageName("");
      handleSelectPage(response.data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create page");
    } finally {
      setCreatingPage(false);
    }
  };

  const handleSavePage = async () => {
    if (!id || !selectedPageId || saving) return;

    try {
      setSaving(true);
      setSaveMessage(null);
      const response = await updateTemplatePage(id, selectedPageId, {
        sections: editorSections,
      });
      setTemplatePages((prev) =>
        prev.map((p) => (p.id === selectedPageId ? response.data : p))
      );
      setHasUnsavedChanges(false);
      setSaveMessage("Saved");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Failed to save");
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePageName = async () => {
    if (!id || !selectedPageId || savingPageName || !pageNameValue.trim()) return;

    try {
      setSavingPageName(true);
      const response = await updateTemplatePage(id, selectedPageId, {
        name: pageNameValue.trim(),
      });
      setTemplatePages((prev) =>
        prev.map((p) => (p.id === selectedPageId ? response.data : p))
      );
      setEditingPageName(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to rename page");
    } finally {
      setSavingPageName(false);
    }
  };

  const handleDeletePage = async (pageId: string) => {
    if (!id) return;
    const ok = await confirm({ title: "Delete this template page?", message: "This cannot be undone.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;

    try {
      setDeletingPageId(pageId);
      await deleteTemplatePage(id, pageId);
      setTemplatePages((prev) => prev.filter((p) => p.id !== pageId));
      if (selectedPageId === pageId) {
        setSelectedPageId(null);
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete page");
    } finally {
      setDeletingPageId(null);
    }
  };

  const handlePreview = () => {
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(previewContent);
      win.document.close();
    }
  };

  // === Template Settings Handlers ===

  const handlePublishToggle = async () => {
    if (!id || !template || publishing) return;

    const newStatus = template.status === "published" ? "draft" : "published";
    try {
      setPublishing(true);
      const response = await updateTemplate(id, { status: newStatus });
      setTemplate(response.data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update template status");
    } finally {
      setPublishing(false);
    }
  };

  const handleActivate = async () => {
    if (!id || activating) return;

    try {
      setActivating(true);
      const response = await activateTemplate(id);
      setTemplate(response.data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to activate template");
    } finally {
      setActivating(false);
    }
  };

  const handleSaveName = async () => {
    if (!id || savingName || !nameValue.trim()) return;

    try {
      setSavingName(true);
      const response = await updateTemplate(id, { name: nameValue.trim() });
      setTemplate(response.data);
      setEditingName(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to rename template");
    } finally {
      setSavingName(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !template || deleting) return;
    if (deleteConfirmName !== template.name) return;

    try {
      setDeleting(true);
      await deleteTemplate(id);
      navigate("/admin/templates");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete template");
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    // Show skeleton loading state
    return (
      <div className="space-y-6">
        {/* Back button skeleton */}
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>

        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-64 bg-gray-200 rounded animate-pulse"></div>
          <div className="flex gap-3">
            <div className="h-10 w-24 bg-gray-200 rounded-lg animate-pulse"></div>
            <div className="h-10 w-28 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>
        </div>

        {/* Tab bar skeleton */}
        <div className="flex gap-2 border-b border-gray-200 pb-2">
          <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
        </div>

        {/* Main content card skeleton */}
        <div className="grid grid-cols-2 gap-6">
          {/* Left panel */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-64 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>
          {/* Right panel */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-64 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !template) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center py-24 gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-lg font-medium text-gray-700">
          {error || "Template not found"}
        </p>
        <ActionButton
          label="Back to Templates"
          onClick={() => navigate("/admin/templates")}
          variant="secondary"
        />
      </motion.div>
    );
  }

  const tabs = [
    { id: "layouts", label: "Layouts", icon: <FileCode className="w-4 h-4" /> },
    { id: "pages", label: "Pages", icon: <FileText className="w-4 h-4" /> },
    { id: "code-manager", label: "Code Manager", icon: <FileCode className="w-4 h-4" /> },
    { id: "post-blocks", label: "Post Blocks", icon: <Layers className="w-4 h-4" /> },
    { id: "menu-templates", label: "Menu Templates", icon: <Menu className="w-4 h-4" /> },
    { id: "review-blocks", label: "Review Blocks", icon: <Star className="w-4 h-4" /> },
    {
      id: "settings",
      label: "Settings",
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        icon={<FileCode className="w-6 h-6" />}
        title={template.name}
        description="Manage template pages and settings"
        backButton={{
          label: "Back to Templates",
          onClick: () => navigate("/admin/templates"),
        }}
        actionButtons={
          <div className="flex items-center gap-2">
            {template.is_active && (
              <Badge label="Active" color="orange" />
            )}
            <Badge
              label={template.status === "published" ? "Published" : "Draft"}
              color={template.status === "published" ? "green" : "gray"}
            />

            {activeTab === "layouts" && (
              <>
                <AnimatePresence>
                  {layoutsSaveMessage && (
                    <motion.span
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className={`text-sm font-medium ${
                        layoutsSaveMessage === "Saved" ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {layoutsSaveMessage}
                    </motion.span>
                  )}
                </AnimatePresence>
                <ActionButton
                  label={savingLayouts ? "Saving..." : "Save Layouts"}
                  icon={
                    savingLayouts ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <div className="relative">
                        <Save className="w-4 h-4" />
                        {layoutsUnsaved && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-alloro-orange rounded-full" />
                        )}
                      </div>
                    )
                  }
                  onClick={handleSaveLayouts}
                  variant="primary"
                  disabled={savingLayouts || !layoutsUnsaved}
                />
              </>
            )}

            {activeTab === "pages" && selectedPageId && (
              <>
                <AnimatePresence>
                  {saveMessage && (
                    <motion.span
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className={`text-sm font-medium ${
                        saveMessage === "Saved"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {saveMessage}
                    </motion.span>
                  )}
                </AnimatePresence>

                <ActionButton
                  label={saving ? "Saving..." : "Save"}
                  icon={
                    saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <div className="relative">
                        <Save className="w-4 h-4" />
                        {hasUnsavedChanges && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-alloro-orange rounded-full" />
                        )}
                      </div>
                    )
                  }
                  onClick={handleSavePage}
                  variant="primary"
                  disabled={saving || !hasUnsavedChanges}
                />
                <ActionButton
                  label="Preview"
                  icon={<Eye className="w-4 h-4" />}
                  onClick={handlePreview}
                  variant="secondary"
                />
              </>
            )}
          </div>
        }
      />

      {/* Tab Bar */}
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Layouts Tab */}
      {activeTab === "layouts" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="space-y-4">
            {/* Layout field selector */}
            <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5 w-fit">
              {(["wrapper", "header", "footer"] as const).map((field) => (
                <button
                  key={field}
                  onClick={() => setActiveLayoutField(field)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition capitalize ${
                    activeLayoutField === field
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {field}
                </button>
              ))}
            </div>

            {/* Monaco editor for the active layout field */}
            <div
              className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col"
              style={{ height: "calc(100vh - 360px)", minHeight: 500 }}
            >
              <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {activeLayoutField} — HTML Editor
                </span>
                <span className="text-xs text-gray-400">
                  {activeLayoutField === "wrapper" && "Use {{slot}} as the placeholder for page content"}
                  {activeLayoutField === "header" && "Shared header rendered above page sections"}
                  {activeLayoutField === "footer" && "Shared footer rendered below page sections"}
                </span>
              </div>
              <div className="flex-1">
                <Editor
                  height="100%"
                  defaultLanguage="html"
                  value={
                    activeLayoutField === "wrapper"
                      ? wrapperContent
                      : activeLayoutField === "header"
                      ? headerContent
                      : footerContent
                  }
                  onChange={(v) => handleLayoutFieldChange(activeLayoutField, v)}
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
          </div>
        </motion.div>
      )}

      {/* Pages Tab */}
      {activeTab === "pages" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {selectedPageId && selectedPage ? (
            /* === Page Editor View === */
            <div className="space-y-4">
              {/* Page editor header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleBackToList}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    All Pages
                  </button>
                  <span className="text-gray-300">|</span>
                  {editingPageName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={pageNameValue}
                        onChange={(e) => setPageNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSavePageName();
                          if (e.key === "Escape") {
                            setEditingPageName(false);
                            setPageNameValue(selectedPage.name);
                          }
                        }}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
                        autoFocus
                      />
                      <ActionButton
                        label={savingPageName ? "..." : "Save"}
                        onClick={handleSavePageName}
                        variant="primary"
                        size="sm"
                        disabled={savingPageName || !pageNameValue.trim()}
                      />
                      <ActionButton
                        label="Cancel"
                        onClick={() => {
                          setEditingPageName(false);
                          setPageNameValue(selectedPage.name);
                        }}
                        variant="secondary"
                        size="sm"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {selectedPage.name}
                      </span>
                      <button
                        onClick={() => setEditingPageName(true)}
                        className="text-gray-400 hover:text-alloro-orange transition"
                        title="Rename page"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDeletePage(selectedPageId)}
                  disabled={deletingPageId === selectedPageId}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition disabled:opacity-50"
                >
                  {deletingPageId === selectedPageId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  Delete Page
                </button>
              </div>

              {/* Editor + Preview */}
              <div
                className="grid grid-cols-2 gap-4"
                style={{ height: "calc(100vh - 360px)" }}
              >
                {/* Monaco Editor */}
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col" style={{ minHeight: 650 }}>
                  <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Sections Editor
                    </span>
                    <span className="text-xs text-gray-400">
                      {hasUnsavedChanges ? "Unsaved changes" : "All changes saved"}
                    </span>
                  </div>
                  <div className="flex-1">
                    <SectionsEditor
                      sections={editorSections}
                      onChange={handleEditorSectionsChange}
                      onSave={handleSavePage}
                    />
                  </div>
                </div>

                {/* Live Preview */}
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col" style={{ minHeight: 650 }}>
                  <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                      </span>
                      Live Preview
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
                        <button
                          onClick={() => setPreviewMode("desktop")}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                            previewMode === "desktop"
                              ? "bg-gray-100 text-gray-900"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                          title="Desktop view"
                        >
                          <Monitor className="h-3 w-3" />
                          <span>Desktop</span>
                        </button>
                        <button
                          onClick={() => setPreviewMode("mobile")}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                            previewMode === "mobile"
                              ? "bg-gray-100 text-gray-900"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                          title="Mobile view"
                        >
                          <Smartphone className="h-3 w-3" />
                          <span>Mobile</span>
                        </button>
                        <button
                          onClick={() => setPreviewMode("seo")}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                            previewMode === "seo"
                              ? "bg-gray-100 text-gray-900"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                          title="SEO preview"
                        >
                          <Search className="h-3 w-3" />
                          <span>SEO</span>
                        </button>
                      </div>
                      <button
                        onClick={handlePreview}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:border-gray-300"
                      >
                        <Eye className="h-3 w-3" />
                        Full Preview
                      </button>
                    </div>
                  </div>
                  <div
                    className={`flex-1 overflow-hidden relative ${
                      previewMode !== "desktop" ? "flex justify-center bg-gray-100" : ""
                    }`}
                    style={previewMode === "seo" ? { overflowY: "auto" } : undefined}
                  >
                    {previewMode === "desktop" ? (
                      <div className="absolute inset-0 flex items-start justify-center p-4 overflow-hidden">
                        <div className="w-full h-full flex flex-col">
                          <div className="bg-gray-700 rounded-t-xl px-3 py-1.5 flex items-center gap-2 flex-shrink-0">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                            </div>
                            <div className="flex items-center gap-1.5 bg-gray-600 rounded-md px-2.5 py-1 max-w-[200px]">
                              {pageFavicon && (
                                <img src={pageFavicon} alt="" className="w-3 h-3 flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              )}
                              <span className="text-[10px] text-gray-200 truncate">
                                {pageTitle || "Untitled"}
                              </span>
                            </div>
                          </div>
                          <div className="bg-gray-600 px-3 py-1 flex items-center gap-2 flex-shrink-0">
                            <div className="flex-1 bg-gray-500 rounded-md px-2 py-0.5 flex items-center gap-1.5">
                              <Globe className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" />
                              <span className="text-[10px] text-gray-300 truncate">
                                {pageUrl}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 relative overflow-hidden bg-white border-x-2 border-gray-700">
                            <iframe
                              ref={previewIframeRef}
                              srcDoc={previewWithScrollbar(prepareHtmlForPreview(previewContent))}
                              className="border-0 absolute top-0 left-0"
                              style={{
                                width: `${100 / 0.45}%`,
                                height: `${100 / 0.45}%`,
                                transform: "scale(0.45)",
                                transformOrigin: "top left",
                              }}
                              sandbox="allow-scripts allow-same-origin"
                              onLoad={handlePreviewIframeLoad}
                              title="Template Preview"
                            />
                          </div>
                          <div className="bg-gray-700 rounded-b-xl h-2 flex-shrink-0" />
                        </div>
                      </div>
                    ) : previewMode === "mobile" ? (
                      <div className="flex items-start justify-center py-4">
                        <div className="flex flex-col" style={{ width: 380 }}>
                          <div className="bg-gray-800 rounded-t-[2rem] pt-2 px-6 flex-shrink-0">
                            <div className="flex items-center justify-between text-[9px] text-gray-400 px-1 pb-1">
                              <span>9:41</span>
                              <div className="w-20 h-5 bg-gray-900 rounded-full mx-auto" />
                              <div className="flex items-center gap-1">
                                <span>5G</span>
                                <div className="w-4 h-2 border border-gray-400 rounded-sm">
                                  <div className="w-2.5 h-full bg-gray-400 rounded-sm" />
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="bg-gray-800 px-3 py-1.5 flex items-center gap-2 flex-shrink-0">
                            <div className="flex-1 bg-gray-700 rounded-full px-3 py-1 flex items-center gap-1.5">
                              <Globe className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" />
                              <span className="text-[10px] text-gray-300 truncate">
                                {pageTitle || pageUrl}
                              </span>
                            </div>
                          </div>
                          <div className="bg-white border-x-4 border-gray-800 h-full overflow-hidden" style={{ height: 560 }}>
                            <iframe
                              ref={previewIframeRef}
                              srcDoc={previewWithScrollbar(prepareHtmlForPreview(previewContent))}
                              className="w-full h-full border-0"
                              sandbox="allow-scripts allow-same-origin"
                              onLoad={handlePreviewIframeLoad}
                              title="Template Preview (Mobile)"
                            />
                          </div>
                          <div className="bg-gray-800 rounded-b-[2rem] px-6 py-2 flex items-center justify-center flex-shrink-0">
                            <div className="w-28 h-1 bg-gray-600 rounded-full" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* SEO Preview */
                      <div className="flex flex-col items-center py-6 px-4 w-full">
                        <div className="w-full max-w-2xl space-y-6">
                          <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
                            <Search className="w-5 h-5 text-gray-400" />
                            <span className="text-sm font-medium text-gray-500">
                              Google Search Preview
                            </span>
                          </div>

                          <div className="space-y-2">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                              Desktop Result
                            </p>
                            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1.5">
                              <div className="flex items-center gap-2">
                                {pageFavicon ? (
                                  <img src={pageFavicon} alt="" className="w-7 h-7 rounded-full border border-gray-100 p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                                    <Globe className="w-3.5 h-3.5 text-gray-400" />
                                  </div>
                                )}
                                <div className="flex flex-col">
                                  <span className="text-sm text-gray-800">
                                    {(() => {
                                      try { return new URL(pageUrl).hostname; } catch { return "example.com"; }
                                    })()}
                                  </span>
                                  <span className="text-xs text-gray-500 truncate max-w-md">
                                    {pageUrl}
                                  </span>
                                </div>
                              </div>
                              <h3 className="text-xl text-[#1a0dab] hover:underline cursor-pointer leading-snug">
                                {pageTitle || (
                                  <span className="text-gray-300 italic">No &lt;title&gt; tag found</span>
                                )}
                              </h3>
                              <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">
                                {pageDescription || (
                                  <span className="text-gray-300 italic">
                                    No meta description found. Add a &lt;meta name="description" content="..."&gt; tag.
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="flex gap-4 px-1">
                              <span className={`text-[10px] font-medium ${
                                pageTitle.length === 0 ? "text-red-400" :
                                pageTitle.length > 60 ? "text-amber-500" : "text-green-500"
                              }`}>
                                Title: {pageTitle.length}/60 chars
                                {pageTitle.length === 0 && " — Missing!"}
                                {pageTitle.length > 60 && " — May be truncated"}
                              </span>
                              <span className={`text-[10px] font-medium ${
                                pageDescription.length === 0 ? "text-red-400" :
                                pageDescription.length > 160 ? "text-amber-500" : "text-green-500"
                              }`}>
                                Description: {pageDescription.length}/160 chars
                                {pageDescription.length === 0 && " — Missing!"}
                                {pageDescription.length > 160 && " — May be truncated"}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                              Mobile Result
                            </p>
                            <div className="bg-white rounded-xl border border-gray-200 p-4 max-w-sm space-y-1.5">
                              <div className="flex items-center gap-2">
                                {pageFavicon ? (
                                  <img src={pageFavicon} alt="" className="w-6 h-6 rounded-full border border-gray-100 p-0.5" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                                    <Globe className="w-3 h-3 text-gray-400" />
                                  </div>
                                )}
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs text-gray-800 truncate">
                                    {(() => {
                                      try { return new URL(pageUrl).hostname; } catch { return "example.com"; }
                                    })()}
                                  </span>
                                  <span className="text-[10px] text-gray-500 truncate">
                                    {pageUrl}
                                  </span>
                                </div>
                              </div>
                              <h3 className="text-base text-[#1a0dab] hover:underline cursor-pointer leading-snug line-clamp-2">
                                {pageTitle || (
                                  <span className="text-gray-300 italic text-sm">No title</span>
                                )}
                              </h3>
                              <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                                {pageDescription || (
                                  <span className="text-gray-300 italic">No description</span>
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                              SEO Checklist
                            </p>
                            <div className="space-y-2">
                              {[
                                {
                                  ok: pageTitle.length > 0 && pageTitle.length <= 60,
                                  warn: pageTitle.length > 60,
                                  label: "Page title",
                                  detail: pageTitle.length === 0
                                    ? "Missing — add a <title> tag"
                                    : pageTitle.length > 60
                                    ? `${pageTitle.length} chars — recommended max is 60`
                                    : `${pageTitle.length} chars — good length`,
                                },
                                {
                                  ok: pageDescription.length > 0 && pageDescription.length <= 160,
                                  warn: pageDescription.length > 160,
                                  label: "Meta description",
                                  detail: pageDescription.length === 0
                                    ? 'Missing — add <meta name="description" content="...">'
                                    : pageDescription.length > 160
                                    ? `${pageDescription.length} chars — recommended max is 160`
                                    : `${pageDescription.length} chars — good length`,
                                },
                                {
                                  ok: pageUrl !== "https://example.com",
                                  warn: false,
                                  label: "Canonical URL",
                                  detail: pageUrl === "https://example.com"
                                    ? 'Not set — add <link rel="canonical" href="...">'
                                    : pageUrl,
                                },
                                {
                                  ok: pageFavicon.length > 0,
                                  warn: false,
                                  label: "Favicon",
                                  detail: pageFavicon.length === 0
                                    ? 'Missing — add <link rel="icon" href="...">'
                                    : "Found",
                                },
                              ].map((item) => (
                                <div key={item.label} className="flex items-start gap-2.5">
                                  <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                    item.ok ? "bg-green-100" : item.warn ? "bg-amber-100" : "bg-red-100"
                                  }`}>
                                    <span className={`text-[10px] font-bold ${
                                      item.ok ? "text-green-600" : item.warn ? "text-amber-600" : "text-red-500"
                                    }`}>
                                      {item.ok ? "✓" : item.warn ? "!" : "✕"}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-xs font-semibold text-gray-700">{item.label}</span>
                                    <p className="text-[11px] text-gray-500">{item.detail}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* === Pages List View === */
            <div className="space-y-4">
              {/* Add page form */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={newPageName}
                    onChange={(e) => setNewPageName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newPageName.trim()) handleCreatePage();
                    }}
                    placeholder="New page name (e.g. Homepage, Services, About)"
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
                  />
                  <ActionButton
                    label={creatingPage ? "Creating..." : "Add Page"}
                    icon={creatingPage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    onClick={handleCreatePage}
                    variant="primary"
                    disabled={creatingPage || !newPageName.trim()}
                  />
                </div>
              </div>

              {/* Pages list */}
              {templatePages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-12 text-center">
                  <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-500">
                    No pages yet
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Add a page to start building this template
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {templatePages.map((page) => (
                    <motion.div
                      key={page.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between hover:border-gray-300 transition cursor-pointer group"
                      onClick={() => handleSelectPage(page)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-alloro-orange/10 transition">
                          <FileText className="w-4 h-4 text-gray-400 group-hover:text-alloro-orange transition" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {page.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {normalizeSections(page.sections).length > 0
                              ? `${normalizeSections(page.sections).length} section${normalizeSections(page.sections).length !== 1 ? "s" : ""}`
                              : "No sections"}
                            {" · "}
                            Updated {formatDate(page.updated_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePage(page.id);
                          }}
                          disabled={deletingPageId === page.id}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                          title="Delete page"
                        >
                          {deletingPageId === page.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Code Manager Tab */}
      {activeTab === "code-manager" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {loadingSnippets ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-alloro-orange" />
            </div>
          ) : (
            <CodeManagerTab
              templateId={id!}
              codeSnippets={codeSnippets}
              onSnippetsChange={loadCodeSnippets}
            />
          )}
        </motion.div>
      )}

      {/* Post Blocks Tab */}
      {activeTab === "post-blocks" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <PostBlocksTab
            templateId={id!}
            wrapper={wrapperContent}
            header={headerContent}
            footer={footerContent}
          />
        </motion.div>
      )}

      {/* Menu Templates Tab */}
      {activeTab === "menu-templates" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <MenuTemplatesTab
            templateId={id!}
            wrapper={wrapperContent}
            header={headerContent}
            footer={footerContent}
          />
        </motion.div>
      )}

      {/* Review Blocks Tab */}
      {activeTab === "review-blocks" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ReviewBlocksTab
            templateId={id!}
            wrapper={wrapperContent}
            header={headerContent}
            footer={footerContent}
          />
        </motion.div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6 max-w-2xl"
        >
          {/* Template Information */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
              Template Information
            </h3>

            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Name
              </label>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                      if (e.key === "Escape") {
                        setEditingName(false);
                        setNameValue(template.name);
                      }
                    }}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
                    autoFocus
                  />
                  <ActionButton
                    label={savingName ? "Saving..." : "Save"}
                    onClick={handleSaveName}
                    variant="primary"
                    size="sm"
                    disabled={savingName || !nameValue.trim()}
                  />
                  <ActionButton
                    label="Cancel"
                    onClick={() => {
                      setEditingName(false);
                      setNameValue(template.name);
                    }}
                    variant="secondary"
                    size="sm"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-900 font-medium">
                    {template.name}
                  </span>
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-xs text-alloro-orange hover:text-alloro-orange/80 font-medium"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Status
              </label>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    template.status === "published"
                      ? "border-green-200 bg-green-100 text-green-700"
                      : "border-gray-200 bg-gray-100 text-gray-700"
                  }`}
                >
                  {template.status === "published" ? "Published" : "Draft"}
                </span>
                {template.is_active && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-alloro-orange">
                    <Zap className="h-3 w-3" />
                    Active
                  </span>
                )}
              </div>
            </div>

            {/* Pages count */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Pages
              </label>
              <p className="text-sm text-gray-600">
                {templatePages.length} template page{templatePages.length !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Created
                </label>
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  {formatDate(template.created_at)}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Last Updated
                </label>
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  {formatDate(template.updated_at)}
                </div>
              </div>
            </div>

            {/* Template ID */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Template ID
              </label>
              <p className="text-xs text-gray-400 font-mono">{template.id}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
              Actions
            </h3>

            <div className="flex flex-wrap gap-3">
              <ActionButton
                label={
                  publishing
                    ? "Updating..."
                    : template.status === "published"
                    ? "Unpublish"
                    : "Publish"
                }
                onClick={handlePublishToggle}
                variant={
                  template.status === "published" ? "secondary" : "primary"
                }
                disabled={publishing}
                loading={publishing}
              />

              {!template.is_active && (
                <ActionButton
                  label={activating ? "Activating..." : "Set as Active"}
                  icon={<Zap className="w-4 h-4" />}
                  onClick={handleActivate}
                  variant="secondary"
                  disabled={activating}
                  loading={activating}
                />
              )}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="rounded-xl border border-red-200 bg-red-50/30 p-6 space-y-4">
            <h3 className="text-sm font-bold text-red-700 uppercase tracking-wide">
              Danger Zone
            </h3>
            <p className="text-sm text-red-600">
              Permanently delete this template and all its pages. This action cannot be undone.
            </p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-red-500 uppercase tracking-wide">
                  Type "{template.name}" to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={template.name}
                  className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
                />
              </div>

              <motion.button
                onClick={handleDelete}
                disabled={
                  deleting || deleteConfirmName !== template.name
                }
                className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={{
                  scale:
                    deleteConfirmName === template.name && !deleting
                      ? 1.02
                      : 1,
                }}
                whileTap={{
                  scale:
                    deleteConfirmName === template.name && !deleting
                      ? 0.98
                      : 1,
                }}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete Template
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
