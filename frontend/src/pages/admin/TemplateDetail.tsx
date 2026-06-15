import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import SectionsEditor from "../../components/Admin/page-pipeline/SectionsEditor";
import {
  Loader2,
  FileCode,
  Settings,
  FileText,
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
import CodeManagerTab from "../../components/Admin/website-tabs/CodeManagerTab";
import PostBlocksTab from "../../components/Admin/website-tabs/PostBlocksTab";
import MenuTemplatesTab from "../../components/Admin/website-tabs/MenuTemplatesTab";
import ReviewBlocksTab from "../../components/Admin/website-tabs/ReviewBlocksTab";
import { renderPage, normalizeSections } from "../../utils/templateRenderer";
import { useIframeSelector } from "../../hooks/useIframeSelector";
import {
  AdminPageHeader,
  TabBar,
} from "../../components/ui/DesignSystem";
import { useConfirm } from "../../components/ui/ConfirmModal";
import { logger } from "../../lib/logger";
import {
  extractTitle,
  extractMetaDescription,
  extractUrl,
  extractFavicon,
} from "./templateDetail.utils";
import { LoadingSkeleton } from "./TemplateDetail/LoadingSkeleton";
import { ErrorState } from "./TemplateDetail/ErrorState";
import { HeaderActions } from "./TemplateDetail/HeaderActions";
import { LayoutsTab } from "./TemplateDetail/LayoutsTab";
import { PageEditorHeader } from "./TemplateDetail/PageEditorHeader";
import { PreviewPanel } from "./TemplateDetail/PreviewPanel";
import { PagesListView } from "./TemplateDetail/PagesListView";
import { SettingsTab } from "./TemplateDetail/SettingsTab";

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

  if (loading) {
    // Show skeleton loading state
    return <LoadingSkeleton />;
  }

  if (error || !template) {
    return <ErrorState error={error} navigate={navigate} />;
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
          <HeaderActions
            template={template}
            activeTab={activeTab}
            layoutsSaveMessage={layoutsSaveMessage}
            savingLayouts={savingLayouts}
            layoutsUnsaved={layoutsUnsaved}
            handleSaveLayouts={handleSaveLayouts}
            selectedPageId={selectedPageId}
            saveMessage={saveMessage}
            saving={saving}
            hasUnsavedChanges={hasUnsavedChanges}
            handleSavePage={handleSavePage}
            handlePreview={handlePreview}
          />
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
          <LayoutsTab
            activeLayoutField={activeLayoutField}
            setActiveLayoutField={setActiveLayoutField}
            wrapperContent={wrapperContent}
            headerContent={headerContent}
            footerContent={footerContent}
            handleLayoutFieldChange={handleLayoutFieldChange}
          />
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
              <PageEditorHeader
                selectedPage={selectedPage}
                selectedPageId={selectedPageId}
                handleBackToList={handleBackToList}
                editingPageName={editingPageName}
                setEditingPageName={setEditingPageName}
                pageNameValue={pageNameValue}
                setPageNameValue={setPageNameValue}
                handleSavePageName={handleSavePageName}
                savingPageName={savingPageName}
                handleDeletePage={handleDeletePage}
                deletingPageId={deletingPageId}
              />

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
                <PreviewPanel
                  previewMode={previewMode}
                  setPreviewMode={setPreviewMode}
                  handlePreview={handlePreview}
                  previewIframeRef={previewIframeRef}
                  previewContent={previewContent}
                  handlePreviewIframeLoad={handlePreviewIframeLoad}
                  pageFavicon={pageFavicon}
                  pageTitle={pageTitle}
                  pageUrl={pageUrl}
                  pageDescription={pageDescription}
                />
              </div>
            </div>
          ) : (
            /* === Pages List View === */
            <PagesListView
              newPageName={newPageName}
              setNewPageName={setNewPageName}
              handleCreatePage={handleCreatePage}
              creatingPage={creatingPage}
              templatePages={templatePages}
              handleSelectPage={handleSelectPage}
              handleDeletePage={handleDeletePage}
              deletingPageId={deletingPageId}
            />
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
          <SettingsTab
            template={template}
            templatePages={templatePages}
            editingName={editingName}
            setEditingName={setEditingName}
            nameValue={nameValue}
            setNameValue={setNameValue}
            handleSaveName={handleSaveName}
            savingName={savingName}
            handlePublishToggle={handlePublishToggle}
            publishing={publishing}
            handleActivate={handleActivate}
            activating={activating}
            deleteConfirmName={deleteConfirmName}
            setDeleteConfirmName={setDeleteConfirmName}
            handleDelete={handleDelete}
            deleting={deleting}
          />
        </motion.div>
      )}
    </div>
  );
}
