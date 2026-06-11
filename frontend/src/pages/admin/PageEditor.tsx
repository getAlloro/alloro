import { useState, useRef, useCallback, useEffect, useMemo, type DragEvent, type ChangeEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchPage,
  fetchWebsiteDetail,
  createDraftFromPage,
  updatePageSections,
  publishPage,
  editPageComponent,
  fetchEditorSystemPrompt,
  replaceArtifactBuild,
  fetchPageVersions,
  fetchPageVersionContent,
  restorePageVersionIntoDraft,
} from "../../api/websites";
import type { PageVersion } from "../../components/PageEditor/VersionHistoryTab";
import { useLocalDraftBackup } from "../../hooks/useLocalDraftBackup";
import {
  diffSections,
  injectDiffOutlines,
} from "../../utils/sectionDiff";
import { runPublishLint, type PublishLintWarning } from "../../utils/publishLint";
import PublishConfirmModal from "../../components/PageEditor/PublishConfirmModal";
import FindReplaceModal from "../../components/Admin/FindReplaceModal";
import { createAdminWebsiteMediaApi, type MediaItem } from "../../api/websiteMedia";
import type {
  WebsitePage,
  WebsiteProjectWithPages,
  EditChatHistory,
  EditDebugInfo,
  ApiError,
} from "../../api/websites";
import type { Section } from "../../api/templates";
import { renderPage, normalizeSections } from "../../utils/templateRenderer";
import {
  useIframeSelector,
  prepareHtmlForPreview,
} from "../../hooks/useIframeSelector";
import type { QuickActionPayload, QuickActionType } from "../../hooks/useIframeSelector";
import { replaceComponentInDom, validateHtml, extractSectionsFromDom } from "../../utils/htmlReplacer";
import {
  applyDirectEditorOperation,
  type DirectEditorOperation,
} from "../../utils/editorDirectOperations";
import { AdminTopBar } from "../../components/Admin/AdminTopBar";
import { AdminSidebar } from "../../components/Admin/AdminSidebar";
import { LoadingIndicator } from "../../components/Admin/LoadingIndicator";
import { SidebarProvider, useSidebar } from "../../components/Admin/SidebarContext";
import EditorToolbar from "../../components/PageEditor/EditorToolbar";
import EditorSidebar from "../../components/PageEditor/EditorSidebar";
import InlineEditorPopover from "../../components/PageEditor/InlineEditorPopover";
import SeoPanel from "../../components/PageEditor/SeoPanel";
import type { SeoData } from "../../api/websites";
import type { ChatMessage } from "../../components/PageEditor/ChatPanel";
import { ConfirmModal } from "../../components/settings/ConfirmModal";
import { AlertModal } from "../../components/ui/AlertModal";
import SectionsEditor from "../../components/Admin/SectionsEditor";
import ProgressivePagePreview from "../../components/Admin/ProgressivePagePreview";
import RegenerateComponentModal from "../../components/Admin/RegenerateComponentModal";
import { showSuccessToast } from "../../lib/toast";

/**
 * Inject "Rebuilding section…" overlay + pulse/gray styling into the assembled
 * page HTML for every section whose name is in `regeneratingNames`. We mutate
 * the HTML string (not the iframe DOM) so the effect survives the srcDoc
 * re-render cycle triggered by live-preview polling.
 *
 * Sections are pre-tagged by `renderPage` with `data-alloro-section="{name}"`
 * on their root element (see utils/templateRenderer.ts). We locate each match
 * via a permissive regex, append the pulse classes to the existing class
 * attribute, wrap the body in a relatively-positioned container via CSS, and
 * prepend an absolutely-positioned overlay pill.
 *
 * Kept deliberately lightweight — no DOMParser, no cheerio, no iframe-side
 * mutation. Idempotent: passing the same name twice will add classes twice
 * but the pill is keyed by a marker attribute so only one is injected.
 */
function injectRegenerateOverlays(html: string, regeneratingNames: Set<string>): string {
  if (regeneratingNames.size === 0) return html;

  let out = html;
  for (const name of regeneratingNames) {
    // Escape the name for use inside the double-quoted attribute and regex.
    const escapedAttr = name.replace(/"/g, '\\"');
    const escapedRegex = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Match the opening tag carrying data-alloro-section="{name}".
    // Captures: (1) tag prefix up to class attr or end-of-tag, (2) existing
    // class value if any. We only need to handle the common case of a class
    // attribute already being present — renderPage-tagged sections universally
    // carry Tailwind classes.
    const openTagRe = new RegExp(
      `(<\\w+\\b[^>]*\\bdata-alloro-section="${escapedRegex}"[^>]*)>`,
      "i",
    );
    const match = out.match(openTagRe);
    if (!match) continue;

    const fullOpenTag = match[0];
    const openTagWithoutClose = match[1];

    // Inject the pulse classes into the existing class attribute, or add one.
    const pulseClasses = "alloro-regenerating opacity-50 animate-pulse pointer-events-none relative";
    let newOpenTag: string;
    if (/\bclass="([^"]*)"/i.test(openTagWithoutClose)) {
      newOpenTag = openTagWithoutClose.replace(
        /\bclass="([^"]*)"/i,
        (_full, existing) => `class="${existing} ${pulseClasses}"`,
      );
    } else if (/\bclass='([^']*)'/i.test(openTagWithoutClose)) {
      newOpenTag = openTagWithoutClose.replace(
        /\bclass='([^']*)'/i,
        (_full, existing) => `class='${existing} ${pulseClasses}'`,
      );
    } else {
      newOpenTag = `${openTagWithoutClose} class="${pulseClasses}"`;
    }

    // Build the overlay pill — inline-styled so it doesn't rely on Tailwind
    // classes that may or may not be bundled in the preview iframe.
    const overlayHtml = `<div data-alloro-regen-overlay="${escapedAttr}" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:50;pointer-events:none;"><div style="display:inline-flex;align-items:center;gap:8px;background:#212D40;color:#fff;padding:10px 16px;border-radius:9999px;box-shadow:0 10px 25px rgba(0,0,0,0.25);font-size:14px;font-weight:600;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:alloro-regen-spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Rebuilding section…</div></div>`;

    const replacement = `${newOpenTag}>${overlayHtml}`;
    out = out.replace(fullOpenTag, replacement);
  }

  // Inject the keyframes for the spinner exactly once. The preview iframe
  // already carries Tailwind for animate-pulse, so we only need the spin.
  if (out.includes("data-alloro-regen-overlay") && !out.includes("data-alloro-regen-keyframes")) {
    const styleTag = `<style data-alloro-regen-keyframes>@keyframes alloro-regen-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>`;
    if (/<\/head>/i.test(out)) {
      out = out.replace(/<\/head>/i, `${styleTag}</head>`);
    } else {
      out = styleTag + out;
    }
  }

  return out;
}

const MAX_CHAT_MESSAGES_PER_COMPONENT = 50;

/**
 * Code-view (Monaco) edits fire onChange per keystroke; snapshots within this
 * window coalesce into a single undo entry so the stack stays usable.
 */
const CODE_EDIT_UNDO_COALESCE_MS = 2500;

function chatMapToObject(map: Map<string, ChatMessage[]>): EditChatHistory {
  const obj: EditChatHistory = {};
  for (const [key, messages] of map) {
    obj[key] = messages.slice(-MAX_CHAT_MESSAGES_PER_COMPONENT);
  }
  return obj;
}

function objectToChatMap(obj: EditChatHistory | null): Map<string, ChatMessage[]> {
  const map = new Map<string, ChatMessage[]>();
  if (!obj) return map;
  for (const [key, messages] of Object.entries(obj)) {
    if (Array.isArray(messages)) {
      map.set(key, messages);
    }
  }
  return map;
}

function ArtifactEditorView({
  projectId,
  page,
  onReplaced,
}: {
  projectId: string;
  page: WebsitePage;
  onReplaced: (page: WebsitePage) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".zip") || f.type === "application/zip")) {
      setFile(f);
      setError(null);
      setSuccess(false);
    } else {
      setError("Please upload a .zip file");
    }
  }, []);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setError(null);
      setSuccess(false);
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    try {
      setUploading(true);
      setError(null);
      const result = await replaceArtifactBuild(projectId, page.id, file);
      onReplaced(result.data);
      setSuccess(true);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-xl mx-auto py-12 px-6 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Artifact Page</h2>
          <p className="text-sm text-gray-500 mt-1">
            This page serves an uploaded React app build. Replace the build by uploading a new zip.
          </p>
        </div>

        {/* Page info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Path</span>
            <span className="text-sm font-mono text-gray-800">{page.path}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</span>
            <span className="text-sm text-green-700 font-medium">{page.status}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</span>
            <span className="text-sm text-gray-600">{formatDate(page.updated_at)}</span>
          </div>
          {page.display_name && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Display Name</span>
              <span className="text-sm text-gray-800">{page.display_name}</span>
            </div>
          )}
        </div>

        {/* Upload zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition ${
            isDragging
              ? "border-alloro-orange bg-orange-50"
              : file
                ? "border-green-300 bg-green-50"
                : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            className="hidden"
          />
          {file ? (
            <>
              <svg className="w-8 h-8 text-green-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <p className="text-sm font-medium text-gray-800">{file.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatFileSize(file.size)}</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                className="mt-2 text-xs text-red-500 hover:underline"
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-medium text-gray-600">
                Drop a new build zip here or click to browse
              </p>
              <p className="text-xs text-gray-400 mt-1">.zip files only</p>
            </>
          )}
        </div>

        {/* Build requirement note */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-xs text-amber-800">
            <strong>Reminder:</strong> Build with base path matching this page's slug:{" "}
            <code className="bg-amber-100 px-1 py-0.5 rounded text-[11px]">
              vite build --base={page.path}/
            </code>
          </p>
        </div>

        {/* Upload button */}
        {file && (
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full py-3 rounded-xl font-medium text-sm text-white bg-alloro-orange hover:bg-alloro-orange/90 disabled:bg-alloro-orange/50 transition flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Uploading...
              </>
            ) : (
              "Replace Build"
            )}
          </button>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
            <p className="text-sm text-green-700">Build replaced successfully. The page is now serving the new version.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PageEditorInner() {
  const { id: projectId, pageId } = useParams<{
    id: string;
    pageId: string;
  }>();
  const navigate = useNavigate();
  const { setCollapsed } = useSidebar();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mediaApi = useMemo(
    () => (projectId ? createAdminWebsiteMediaApi(projectId) : undefined),
    [projectId],
  );

  // Force collapse sidebar when editor loads (needs more space)
  useEffect(() => {
    setCollapsed(true);
  }, [setCollapsed]);

  // Hide the global support FAB while the editor is open so it never
  // overlaps the sidebar (see index.css [data-editor-fullscreen]).
  useEffect(() => {
    document.body.setAttribute("data-editor-fullscreen", "true");
    return () => document.body.removeAttribute("data-editor-fullscreen");
  }, []);

  // Page + project state
  const [page, setPage] = useState<WebsitePage | null>(null);
  const [project, setProject] = useState<WebsiteProjectWithPages | null>(null);
  const [draftPageId, setDraftPageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sections + assembled HTML state
  const [sections, setSections] = useState<Section[]>([]);
  const [htmlContent, setHtmlContent] = useState("");
  const [undoStack, setUndoStack] = useState<Section[][]>([]);
  const [redoStack, setRedoStack] = useState<Section[][]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Version-history preview state (read-only view of a prior version)
  const [previewVersion, setPreviewVersion] = useState<PageVersion | null>(null);
  const [previewVersionHtml, setPreviewVersionHtml] = useState("");
  const [previewVersionSections, setPreviewVersionSections] = useState<
    Section[] | null
  >(null);

  // Unsaved-changes guard for the toolbar Back button
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  // Optimistic-concurrency conflict (409 STALE_WRITE) on save
  const [showConflictModal, setShowConflictModal] = useState(false);
  const pendingSaveNoteRef = useRef<string | null>(null);

  // Crash-recovery prompt (localStorage backup newer than the server row)
  const [recoveryPrompt, setRecoveryPrompt] = useState<Section[] | null>(null);
  const recoveryCheckedRef = useRef(false);

  // Pre-publish lint warnings (advisory chips in the publish modal)
  const [publishLintWarnings, setPublishLintWarnings] = useState<
    PublishLintWarning[]
  >([]);

  // Site-wide find & replace modal
  const [showFindReplace, setShowFindReplace] = useState(false);

  // UI state
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">(
    "desktop"
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // View state: visual (iframe), code (monaco), or seo (seo panel)
  type EditorView = "visual" | "code" | "seo";
  const [activeView, setActiveView] = useState<EditorView>("visual");

  // Debug info from last LLM edit
  const [lastDebugInfo, setLastDebugInfo] = useState<EditDebugInfo | null>(null);

  // Pre-loaded system prompt (shown in debug tab before first edit)
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);

  // Per-component chat history: Map<alloroClass, ChatMessage[]>
  const [chatMap, setChatMap] = useState<Map<string, ChatMessage[]>>(new Map());

  // Quick action triggered from iframe label icons
  const [pendingSidebarAction, setPendingSidebarAction] = useState<QuickActionType | null>(null);
  const deferredEditRef = useRef<DirectEditorOperation | null>(null);
  // The element a deferred commit is pinned to (from the canvas session that
  // emitted it) so it applies there even if the selection has moved on.
  const deferredTargetRef = useRef<string | undefined>(undefined);
  const handleIframeQuickAction = useCallback((payload: QuickActionPayload) => {
    deferredTargetRef.current = payload.targetAlloroClass;
    if (payload.action === "rich-text" && payload.value) {
      deferredEditRef.current = {
        type: "replace-inline-html",
        html: payload.value,
      };
      setPendingSidebarAction("__deferred__" as QuickActionType);
    } else if ((payload.action === "text" || payload.action === "link") && payload.value) {
      deferredEditRef.current = payload.action === "text"
        ? { type: "replace-text", value: payload.value }
        : { type: "update-link", href: payload.value };
      setPendingSidebarAction("__deferred__" as QuickActionType);
    } else if (payload.action === "text-up" || payload.action === "text-down") {
      deferredEditRef.current = {
        type: "step-font-size",
        direction: payload.action === "text-up" ? "up" : "down",
      };
      setPendingSidebarAction("__deferred__" as QuickActionType);
    } else if (payload.action === "hide") {
      deferredEditRef.current = { type: "toggle-hidden" };
      setPendingSidebarAction("__deferred__" as QuickActionType);
    } else {
      setPendingSidebarAction(payload.action);
    }
  }, []);

  // Selector hook
  const {
    selectedInfo,
    setSelectedInfo,
    clearSelection,
    setupListeners,
    beginCanvasTextEditing,
    isCanvasTextEditing,
  } =
    useIframeSelector(iframeRef, handleIframeQuickAction, { sectionsOnly: true });

  // Regenerate component modal (Plan B T14)
  const [regenerateModalOpen, setRegenerateModalOpen] = useState(false);

  // Per-section regenerate UX (spec T10). Names of sections currently being
  // rebuilt by the regenerate-component job. While a name is in this set the
  // preview HTML is augmented with a pulse/gray + "Rebuilding section…" pill.
  // Snapshots hold the section's pre-regen content so the poll loop can tell
  // when the new content has landed.
  const [regeneratingSectionNames, setRegeneratingSectionNames] = useState<Set<string>>(new Set());
  const regenerateSnapshotsRef = useRef<Map<string, string>>(new Map());

  // Live preview mode — active when page is being generated
  const [isLivePreview, setIsLivePreview] = useState(false);
  const [, setLivePreviewProgress] = useState<{
    total: number;
    completed: number;
    current_component: string;
  } | null>(null);
  const livePreviewPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSectionCountRef = useRef(0);

  const chatMapRef = useRef(chatMap);
  chatMapRef.current = chatMap;

  // --- Load page data ---
  useEffect(() => {
    if (!projectId || !pageId) return;

    // Trigger loading indicator
    window.dispatchEvent(new Event('navigation-start'));

    const loadPage = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch project (for wrapper/header/footer) and page in parallel
        const [projectResponse, pageResponse] = await Promise.all([
          fetchWebsiteDetail(projectId),
          fetchPage(projectId, pageId),
        ]);

        const proj = projectResponse.data;
        setProject(proj);

        // Verify wrapper contains {{slot}} placeholder
        const wrapper = proj.wrapper || "{{slot}}";
        if (!wrapper.includes("{{slot}}")) {
          setError(
            "The project wrapper is missing the {{slot}} placeholder. " +
            "Open the Layout Editor → Wrapper and add {{slot}} where page content should be injected."
          );
          setLoading(false);
          return;
        }

        let pageData = pageResponse.data;

        // If the page is inactive (e.g. superseded by AI analysis auto-publish),
        // find the current published page at the same path and load that instead.
        if (pageData.status === "inactive" && pageData.page_type !== "artifact") {
          const activePage = proj.pages.find(
            (p: WebsitePage) => p.path === pageData.path && (p.status === "published" || p.status === "draft")
          );
          if (activePage) {
            const freshResponse = await fetchPage(projectId, activePage.id);
            pageData = freshResponse.data;
          }
        }

        let workingPage = pageData;
        let workingPageId = pageData.id;

        // If the page is published, create/get a draft for editing
        // Skip draft creation for artifact pages — they're edited by replacing the build
        if (pageData.status === "published" && pageData.page_type !== "artifact") {
          const draftResponse = await createDraftFromPage(projectId, pageId);
          workingPage = draftResponse.data;
          workingPageId = draftResponse.data.id;
        }

        setPage(workingPage);
        setDraftPageId(workingPageId);

        // Update URL to reflect the draft page ID so refresh loads the correct page.
        // Use replaceState to avoid re-triggering the useEffect that depends on pageId.
        if (workingPageId !== pageId) {
          window.history.replaceState(null, "", `/admin/websites/${projectId}/pages/${workingPageId}/edit`);
        }

        // Load sections from the page (handles both [...] and {sections: [...]} formats)
        const pageSections: Section[] = normalizeSections(workingPage.sections);
        setSections(pageSections);

        // Assemble full HTML for preview using project wrapper/header/footer
        const assembled = renderPage(
          proj.wrapper || "{{slot}}",
          proj.header || "",
          proj.footer || "",
          pageSections,
          undefined,
          undefined,
          undefined,
          projectId
        );
        setHtmlContent(assembled);

        // Hydrate chat history from persisted data
        const chatHistory = workingPage.edit_chat_history;
        if (chatHistory && typeof chatHistory === "object") {
          setChatMap(objectToChatMap(chatHistory));
        }
      } catch (err) {
        console.error("Failed to load page:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load page"
        );
      } finally {
        setLoading(false);
        // Manually complete loading indicator
        window.dispatchEvent(new Event('navigation-complete'));
      }
    };

    loadPage();
  }, [projectId, pageId]);

  // --- Live preview mode: detect generating status and poll for updates ---
  useEffect(() => {
    if (!page || !projectId || !pageId || !project) return;

    const isGenerating =
      page.generation_status === "generating" || page.generation_status === "queued";

    if (!isGenerating) {
      setIsLivePreview(false);
      setLivePreviewProgress(null);
      return;
    }

    setIsLivePreview(true);
    if (page.generation_progress) {
      setLivePreviewProgress(page.generation_progress);
    }
    prevSectionCountRef.current = normalizeSections(page.sections).length;

    const pollLivePreview = async () => {
      try {
        const response = await fetchPage(projectId, pageId);
        const updatedPage = response.data;
        const updatedSections = normalizeSections(updatedPage.sections);

        // Update sections state always; the iframe re-render is conditional.
        setSections(updatedSections);

        // For SINGLE-SECTION regen (regenerateSnapshotsRef populated), do NOT
        // rebuild the full iframe srcDoc on every tick — that reloads the
        // iframe and resets the user's scroll position to the top. The
        // completion block below swaps just the rebuilt section in place
        // via replaceComponentInDom, preserving scroll.
        const isSingleSectionRegen =
          regenerateSnapshotsRef.current.size > 0;
        if (!isSingleSectionRegen) {
          const assembled = renderPage(
            project.wrapper || "{{slot}}",
            project.header || "",
            project.footer || "",
            updatedSections,
            undefined,
            undefined,
            undefined,
            projectId,
          );
          setHtmlContent(assembled);
        }
        setPage(updatedPage);

        if (updatedPage.generation_progress) {
          setLivePreviewProgress(updatedPage.generation_progress);
        }

        prevSectionCountRef.current = updatedSections.length;

        // Per-section regenerate completion detection (spec T10).
        // Compare each regenerating section's fresh content against the
        // snapshot we took when the user kicked regeneration off. If it
        // differs, the rebuild landed — drop the overlay, toast, and scroll
        // the section into view inside the iframe.
        const snapshots = regenerateSnapshotsRef.current;
        if (snapshots.size > 0) {
          const finished: string[] = [];
          for (const [name, prevContent] of snapshots) {
            const fresh = updatedSections.find((s) => s.name === name);
            if (fresh && fresh.content && fresh.content !== prevContent) {
              finished.push(name);
            }
          }
          if (finished.length > 0) {
            setRegeneratingSectionNames((prev) => {
              const next = new Set(prev);
              for (const name of finished) next.delete(name);
              return next;
            });
            // Swap each finished section into the iframe's live DOM in
            // place. This preserves scroll — unlike rebuilding srcDoc
            // which reloads the iframe and resets the scrollbar.
            const iframe = iframeRef.current;
            const doc = iframe?.contentDocument;
            for (const name of finished) {
              snapshots.delete(name);
              const fresh = updatedSections.find((s) => s.name === name);
              if (doc && fresh?.content) {
                // Best-effort: find the section root by data-alloro-section
                // (renderPage tags each section with this during assembly).
                const target = doc.querySelector(
                  `[data-alloro-section="${CSS.escape(name)}"]`,
                ) as HTMLElement | null;
                if (target) {
                  const range = doc.createRange();
                  range.selectNodeContents(target);
                  const frag = range.createContextualFragment(fresh.content);
                  // Replace the outer element so we keep the data-alloro-section
                  // wrapper from the assembled HTML — the content is a full
                  // <section> so we swap the section element itself.
                  const newWrap = doc.createElement("div");
                  newWrap.setAttribute("data-alloro-section", name);
                  newWrap.appendChild(frag);
                  target.replaceWith(newWrap);
                }
              }
              showSuccessToast("Section rebuilt", "Review changes");
            }
          }
        }

        // Check if generation is done
        if (
          updatedPage.generation_status === "ready" ||
          updatedPage.generation_status === "failed" ||
          updatedPage.generation_status === "cancelled"
        ) {
          setIsLivePreview(false);
          setLivePreviewProgress(null);
          // Reload full page data for edit mode
          const [freshProject, freshPage] = await Promise.all([
            fetchWebsiteDetail(projectId),
            fetchPage(projectId, pageId),
          ]);
          setProject(freshProject.data);
          const finalSections = normalizeSections(freshPage.data.sections);
          setSections(finalSections);
          setPage(freshPage.data);
          // Skip the full-iframe rebuild if we were in single-section regen
          // mode — the DOM was already swapped in place above, and
          // re-setting htmlContent would reload the iframe and jump scroll
          // back to the top.
          if (!isSingleSectionRegen) {
            const finalHtml = renderPage(
              freshProject.data.wrapper || "{{slot}}",
              freshProject.data.header || "",
              freshProject.data.footer || "",
              finalSections,
              undefined,
              undefined,
              undefined,
              projectId,
            );
            setHtmlContent(finalHtml);
          }

          // Failsafe: clear any lingering regenerate overlays once the job
          // has finished. If content comparison didn't fire (e.g. retry that
          // produced identical output), we still want to release the UI.
          if (regenerateSnapshotsRef.current.size > 0) {
            const stillPending = Array.from(regenerateSnapshotsRef.current.keys());
            regenerateSnapshotsRef.current.clear();
            setRegeneratingSectionNames(new Set());
            // Only toast once — an aggregate message is fine here.
            if (stillPending.length > 0 && updatedPage.generation_status === "ready") {
              showSuccessToast("Section rebuilt", "Review changes");
            }
          }
        } else {
          livePreviewPollRef.current = setTimeout(pollLivePreview, 2000);
        }
      } catch (err) {
        console.error("Live preview poll error:", err);
        livePreviewPollRef.current = setTimeout(pollLivePreview, 2000);
      }
    };

    livePreviewPollRef.current = setTimeout(pollLivePreview, 2000);

    return () => {
      if (livePreviewPollRef.current) clearTimeout(livePreviewPollRef.current);
    };
  }, [page?.generation_status, projectId, pageId]);

  // --- Fetch system prompt for debug tab preview ---
  useEffect(() => {
    fetchEditorSystemPrompt()
      .then(setSystemPrompt)
      .catch((err) => console.error("Failed to load system prompt:", err));
  }, []);

  // --- Warn before closing/reloading with unsaved changes ---
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  // The element currently being live-previewed from the sidebar textarea —
  // stored WITH its class so revert always targets the previewed element,
  // even after the selection has moved on (visual only; restored on abandon).
  const liveTextRef = useRef<{ alloroClass: string; html: string } | null>(null);

  // --- Crash-recovery backup (localStorage mirror of dirty sections) ---
  const { clearBackup, readBackup } = useLocalDraftBackup({
    pageId: draftPageId,
    sections,
    isDirty,
  });

  // Offer recovery once per editor load when a backup is newer than the
  // server row and differs from what the server returned.
  useEffect(() => {
    if (!page || !draftPageId || loading || recoveryCheckedRef.current) return;
    recoveryCheckedRef.current = true;

    const backup = readBackup(draftPageId);
    if (!backup) return;

    const serverTime = new Date(page.updated_at).getTime();
    const matchesServer =
      JSON.stringify(backup.sections) ===
      JSON.stringify(normalizeSections(page.sections));

    if (backup.savedAt > serverTime && !matchesServer) {
      setRecoveryPrompt(backup.sections);
    }
  }, [page, draftPageId, loading, readBackup]);

  // --- Undo/redo stacks ---
  // Every content edit pushes the pre-edit sections onto the undo stack and
  // clears redo. Saving is explicit (Save button) — edits only mark dirty.
  const pushUndoSnapshot = useCallback((previousSections: Section[]) => {
    setUndoStack((prev) => [...prev, previousSections]);
    setRedoStack([]);
  }, []);

  // --- Keyboard shortcuts: Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z redo ---
  // Bound on both the parent window and the iframe document (re-bound on
  // every iframe load since srcDoc swaps replace the document). Refs keep the
  // listener identity stable across renders.
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});
  const saveRef = useRef<() => void>(() => {});

  const handleEditorKeyDown = useCallback((e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();

    // Cmd/Ctrl+S saves even while typing in a field — never the browser dialog.
    if (key === "s") {
      e.preventDefault();
      saveRef.current();
      return;
    }

    if (key !== "z") return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    e.preventDefault();
    if (e.shiftKey) {
      redoRef.current();
    } else {
      undoRef.current();
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleEditorKeyDown);
    return () => window.removeEventListener("keydown", handleEditorKeyDown);
  }, [handleEditorKeyDown]);

  // --- Handle iframe load: set up selector listeners + keyboard shortcuts ---
  const handleIframeLoad = useCallback(() => {
    setupListeners();
    iframeRef.current?.contentDocument?.addEventListener(
      "keydown",
      handleEditorKeyDown
    );
  }, [setupListeners, handleEditorKeyDown]);

  // --- Handle edit send ---
  const handleSendEdit = useCallback(
    async (instruction: string, attachedMedia?: MediaItem[]) => {
      // Block editing header/footer elements (they live on the project, not the page).
      // Check structurally: if the element is inside a data-alloro-section marker, it's page content.
      if (selectedInfo) {
        const doc = iframeRef.current?.contentDocument;
        const el = doc?.querySelector(`.${CSS.escape(selectedInfo.alloroClass)}`);
        if (el && !el.closest("[data-alloro-section]")) {
          setEditError("Header/footer components can't be edited here. Use the Layout Editor from the project page.");
          return;
        }
      }

      if (!projectId || !draftPageId || !selectedInfo) return;

      setIsEditing(true);
      setEditError(null);

      const alloroClass = selectedInfo.alloroClass;

      // Build enriched instruction with attached media context
      let enrichedInstruction = instruction;
      if (attachedMedia && attachedMedia.length > 0) {
        enrichedInstruction += "\n\n## Use the images below:\n";
        attachedMedia.forEach((media, index) => {
          const altText = media.alt_text ? ` (${media.alt_text})` : "";
          enrichedInstruction += `Image ${index + 1}${altText}: ${media.s3_url}\n`;
        });
      }

      const userMessage: ChatMessage = {
        role: "user",
        content: instruction, // Show user's original text only
        timestamp: Date.now(),
      };

      setChatMap((prev) => {
        const next = new Map(prev);
        const messages = next.get(alloroClass) || [];
        next.set(alloroClass, [...messages, userMessage]);
        return next;
      });

      try {
        const existingMessages = chatMap.get(alloroClass) || [];
        const chatHistory = existingMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const result = await editPageComponent(projectId, draftPageId, {
          alloroClass,
          currentHtml: selectedInfo.outerHtml,
          instruction: enrichedInstruction, // Send enriched instruction to API
          chatHistory,
        });

        // Capture debug info from LLM response
        setLastDebugInfo(result.debug ?? null);

        // Handle rejection — LLM flagged the instruction as not allowed
        if (result.rejected) {
          const rejectionMessage: ChatMessage = {
            role: "assistant",
            content: result.message || "This edit is not allowed.",
            timestamp: Date.now(),
            isError: true,
          };

          setChatMap((prev) => {
            const next = new Map(prev);
            const messages = next.get(alloroClass) || [];
            next.set(alloroClass, [...messages, rejectionMessage]);
            return next;
          });
          return;
        }

        const validation = validateHtml(result.editedHtml!);
        if (!validation.valid) {
          throw new Error(
            `Invalid HTML from edit: ${validation.error}`
          );
        }

        pushUndoSnapshot(structuredClone(sectionsRef.current));

        const iframe = iframeRef.current;
        if (iframe?.contentDocument) {
          // Capture scroll position before mutation
          const scrollY = iframe.contentWindow?.scrollY || 0;
          const scrollX = iframe.contentWindow?.scrollX || 0;

          replaceComponentInDom(
            iframe.contentDocument,
            alloroClass,
            result.editedHtml!
          );
          // Don't setHtmlContent here - it causes iframe srcDoc to reload and flicker
          // The DOM is already mutated in place, which is what the user sees

          // Extract updated sections from the mutated DOM
          // Use sectionsRef.current (not closure `sections`) to avoid stale data
          const updatedSections = extractSectionsFromDom(iframe.contentDocument, sectionsRef.current);
          setSections(updatedSections);

          setIsDirty(true);
          setupListeners();

          // Restore scroll position
          iframe.contentWindow?.scrollTo(scrollX, scrollY);

          // Refresh selectedInfo with the fresh outerHTML from the mutated DOM
          const freshEl = iframe.contentDocument.querySelector(`.${CSS.escape(alloroClass)}`);
          if (freshEl && selectedInfo) {
            setSelectedInfo({
              ...selectedInfo,
              outerHtml: freshEl.outerHTML,
              isHidden: freshEl.getAttribute("data-alloro-hidden") === "true",
            });
          }
        }

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: result.message || "Edit applied.",
          timestamp: Date.now(),
        };

        setChatMap((prev) => {
          const next = new Map(prev);
          const messages = next.get(alloroClass) || [];
          next.set(alloroClass, [...messages, assistantMessage]);
          return next;
        });
      } catch (err) {
        console.error("Edit failed:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Edit failed";
        setEditError(errorMessage);

        const errorChatMessage: ChatMessage = {
          role: "assistant",
          content: `Error: ${errorMessage}`,
          timestamp: Date.now(),
          isError: true,
        };

        setChatMap((prev) => {
          const next = new Map(prev);
          const messages = next.get(alloroClass) || [];
          next.set(alloroClass, [...messages, errorChatMessage]);
          return next;
        });
      } finally {
        setIsEditing(false);
      }
    },
    [
      projectId,
      draftPageId,
      selectedInfo,
      setSelectedInfo,
      chatMap,
      pushUndoSnapshot,
      setupListeners,
    ]
  );

  const handleApplyDirectEdit = useCallback(
    (operation: DirectEditorOperation, overrideAlloroClass?: string) => {
      // When a commit is pinned to a specific element (committing element A
      // while B is now selected), operate on A and DON'T write the selection
      // back — otherwise we'd clobber B's caret/selection.
      const isOverride =
        !!overrideAlloroClass && overrideAlloroClass !== selectedInfo?.alloroClass;
      if (!selectedInfo) return;
      const opInfo = isOverride
        ? { ...selectedInfo, alloroClass: overrideAlloroClass! }
        : selectedInfo;

      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!doc) return;

      const targetElement = doc.querySelector(
        `.${CSS.escape(opInfo.alloroClass)}`,
      );
      if (targetElement && !targetElement.closest("[data-alloro-section]")) {
        setEditError("Header/footer components can't be edited here. Use the Layout Editor from the project page.");
        return;
      }

      try {
        setEditError(null);
        const scrollY = iframe.contentWindow?.scrollY || 0;
        const scrollX = iframe.contentWindow?.scrollX || 0;
        const previousSections = structuredClone(sectionsRef.current);

        const result = applyDirectEditorOperation(doc, opInfo, operation);
        if (!result.changed) {
          if (!isOverride) setSelectedInfo(result.selectedInfo);
          return;
        }
        const updatedSections = extractSectionsFromDom(doc, sectionsRef.current);

        pushUndoSnapshot(previousSections);
        setSections(updatedSections);
        liveTextRef.current = null;
        setIsDirty(true);
        setupListeners();
        iframe.contentWindow?.scrollTo(scrollX, scrollY);
        if (!isOverride) setSelectedInfo(result.selectedInfo);
      } catch (err) {
        setEditError(err instanceof Error ? err.message : "Direct edit failed");
      }
    },
    [selectedInfo, pushUndoSnapshot, setupListeners, setSelectedInfo],
  );

  // Process deferred quick-action edits from iframe input panel
  useEffect(() => {
    if (deferredEditRef.current && pendingSidebarAction === ("__deferred__" as QuickActionType)) {
      const operation = deferredEditRef.current;
      const targetCls = deferredTargetRef.current;
      deferredEditRef.current = null;
      deferredTargetRef.current = undefined;
      setPendingSidebarAction(null);
      handleApplyDirectEdit(operation, targetCls);
    }
  }, [pendingSidebarAction, handleApplyDirectEdit]);

  // --- Undo / Redo ---
  const rebuildPreviewHtml = useCallback(
    (nextSections: Section[]) => {
      const assembled = renderPage(
        project?.wrapper || "{{slot}}",
        project?.header || "",
        project?.footer || "",
        nextSections,
        undefined,
        undefined,
        undefined,
        projectId
      );
      setHtmlContent(assembled);
    },
    [project, projectId]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;

    const previousSections = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, structuredClone(sectionsRef.current)]);
    setSections(previousSections);
    rebuildPreviewHtml(previousSections);
    setIsDirty(true);
    clearSelection();
  }, [undoStack, rebuildPreviewHtml, clearSelection]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;

    const nextSections = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, structuredClone(sectionsRef.current)]);
    setSections(nextSections);
    rebuildPreviewHtml(nextSections);
    setIsDirty(true);
    clearSelection();
  }, [redoStack, rebuildPreviewHtml, clearSelection]);

  undoRef.current = handleUndo;
  redoRef.current = handleRedo;

  // --- Toggle hidden ---
  const handleToggleHidden = useCallback(() => {
    handleApplyDirectEdit({ type: "toggle-hidden" });
  }, [handleApplyDirectEdit]);

  // --- Live text preview: mirror sidebar typing into the iframe element ---
  // Visual only — sections update on Apply; an abandoned preview reverts.
  const handleLiveTextRevert = useCallback(() => {
    const ref = liveTextRef.current;
    if (!ref) return;
    const doc = iframeRef.current?.contentDocument;
    const el = doc?.querySelector(
      `.${CSS.escape(ref.alloroClass)}`
    ) as HTMLElement | null;
    if (el) el.innerHTML = ref.html;
    liveTextRef.current = null;
  }, []);

  const handleLiveTextPreview = useCallback(
    (value: string) => {
      if (!selectedInfo) return;
      const doc = iframeRef.current?.contentDocument;
      const el = doc?.querySelector(
        `.${CSS.escape(selectedInfo.alloroClass)}`
      ) as HTMLElement | null;
      if (!el) return;
      // Holding a preview for a different element — revert it before starting.
      if (liveTextRef.current && liveTextRef.current.alloroClass !== selectedInfo.alloroClass) {
        handleLiveTextRevert();
      }
      if (!liveTextRef.current) {
        liveTextRef.current = { alloroClass: selectedInfo.alloroClass, html: el.innerHTML };
      }
      el.textContent = value;
    },
    [selectedInfo, handleLiveTextRevert]
  );

  // --- Manual save (explicit only — snapshots a restorable version) ---
  const performSave = useCallback(
    async (note?: string | null, force = false) => {
      if (!projectId || !draftPageId || isSaving) return;

      try {
        setIsSaving(true);
        const res = await updatePageSections(
          projectId,
          draftPageId,
          sectionsRef.current,
          chatMapToObject(chatMapRef.current),
          {
            revisionNote: note ?? null,
            expectedUpdatedAt: page?.updated_at ?? null,
            force,
          }
        );
        setPage((prev) =>
          prev ? { ...prev, updated_at: res.data.updated_at } : prev
        );
        setIsDirty(false);
        clearBackup();
        setEditError(null);
        showSuccessToast("Changes saved", "A restorable version was recorded");
      } catch (err) {
        if ((err as ApiError).code === "STALE_WRITE") {
          pendingSaveNoteRef.current = note ?? null;
          setShowConflictModal(true);
          return;
        }
        console.error("Save failed:", err);
        setEditError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, draftPageId, isSaving, page?.updated_at, clearBackup]
  );

  const handleSave = useCallback(() => performSave(), [performSave]);
  const handleSaveWithNote = useCallback(
    (note: string) => performSave(note || null),
    [performSave]
  );
  const handleForceSave = useCallback(() => {
    setShowConflictModal(false);
    performSave(pendingSaveNoteRef.current, true);
  }, [performSave]);

  saveRef.current = handleSave;

  // --- Publish ---
  const handlePublish = useCallback(() => {
    if (!projectId || !draftPageId || isPublishing) return;
    // Advisory pre-publish lint — never blocks, chips render in the modal.
    const knownPaths = (project?.pages || []).map((p: WebsitePage) => p.path);
    setPublishLintWarnings([]);
    runPublishLint(htmlContent, knownPaths)
      .then(setPublishLintWarnings)
      .catch(() => setPublishLintWarnings([]));
    setShowPublishModal(true);
  }, [projectId, draftPageId, isPublishing, project, htmlContent]);

  const handlePublishConfirmed = useCallback(async () => {
    if (!projectId || !draftPageId) return;

    try {
      setIsPublishing(true);

      if (isDirty) {
        await updatePageSections(
          projectId,
          draftPageId,
          sections,
          chatMapToObject(chatMap)
        );
      }

      await publishPage(projectId, draftPageId);

      // Stay in editor by creating a new draft from the published page
      const publishedPage = await fetchPage(projectId, draftPageId);
      const newDraft = await createDraftFromPage(projectId, publishedPage.data.id);

      // Update state to work with new draft
      setDraftPageId(newDraft.data.id);
      setPage(newDraft.data);
      setIsDirty(false);

      // Update URL to reflect the new draft page ID so refresh loads the correct page
      window.history.replaceState(null, "", `/admin/websites/${projectId}/pages/${newDraft.data.id}/edit`);

      // Reload sections and iframe from the new draft
      const draftSections: Section[] = normalizeSections(newDraft.data.sections);
      setSections(draftSections);
      if (project) {
        const assembled = renderPage(
          project.wrapper || "{{slot}}",
          project.header || "",
          project.footer || "",
          draftSections,
          undefined,
          undefined,
          undefined,
          projectId
        );
        setHtmlContent(assembled);
      }

      // Clear chat history, edit history, and the local backup for the fresh draft
      setChatMap(new Map());
      setUndoStack([]);
      setRedoStack([]);
      clearBackup();

      // Close modal and show success alert
      setShowPublishModal(false);
      setEditError(null);

      // Show success alert with version info
      setSuccessMessage(`Page published successfully! You are now working on version ${newDraft.data.version}.`);
      setShowSuccessAlert(true);
    } catch (err) {
      console.error("Publish failed:", err);
      setEditError(
        err instanceof Error ? err.message : "Failed to publish"
      );
      setShowPublishModal(false);
    } finally {
      setIsPublishing(false);
    }
  }, [projectId, draftPageId, sections, chatMap, isDirty]);

  // --- View switching ---
  const handleViewChange = useCallback(
    (view: EditorView) => {
      // Clear selection when entering code or seo view
      if (view === "code" || view === "seo") {
        clearSelection();
      }

      setActiveView(view);
    },
    [clearSelection]
  );

  // --- Handle sections change from SectionsEditor (code view) ---
  const lastCodeEditPushRef = useRef(0);
  const handleCodeSectionsChange = useCallback(
    (updated: Section[]) => {
      // Code edits fire per keystroke — coalesce undo snapshots per burst so
      // a typing session undoes as one step instead of fifty.
      const now = Date.now();
      if (now - lastCodeEditPushRef.current > CODE_EDIT_UNDO_COALESCE_MS) {
        pushUndoSnapshot(structuredClone(sectionsRef.current));
      }
      lastCodeEditPushRef.current = now;

      setSections(updated);
      setIsDirty(true);
      rebuildPreviewHtml(updated);
    },
    [pushUndoSnapshot, rebuildPreviewHtml]
  );

  // --- Version history: preview / restore / exit ---
  const fetchAdminVersions = useCallback(
    async (pid: string) => {
      if (!projectId) return [];
      const res = await fetchPageVersions(projectId, pid);
      return res.data.versions;
    },
    [projectId]
  );

  const handlePreviewVersion = useCallback(
    async (version: PageVersion) => {
      if (!projectId || !draftPageId || !project) return;
      try {
        const res = await fetchPageVersionContent(
          projectId,
          draftPageId,
          version.id
        );
        const versionSections = normalizeSections(res.data.sections);
        const changedNames = diffSections(sectionsRef.current, versionSections)
          .filter((entry) => entry.status !== "removed")
          .map((entry) => entry.name);
        const assembled = renderPage(
          project.wrapper || "{{slot}}",
          project.header || "",
          project.footer || "",
          versionSections,
          undefined,
          undefined,
          undefined,
          projectId
        );
        setPreviewVersionHtml(injectDiffOutlines(assembled, changedNames));
        setPreviewVersionSections(versionSections);
        setPreviewVersion(version);
        clearSelection();
      } catch (err) {
        setEditError(
          err instanceof Error ? err.message : "Failed to load version preview"
        );
      }
    },
    [projectId, draftPageId, project, clearSelection]
  );

  const handleExitPreview = useCallback(() => {
    setPreviewVersion(null);
    setPreviewVersionHtml("");
    setPreviewVersionSections(null);
  }, []);

  // Per-section diff between the previewed version and the current draft
  const previewDiff = useMemo(
    () =>
      previewVersionSections
        ? diffSections(sections, previewVersionSections)
        : null,
    [sections, previewVersionSections]
  );

  // Restore a single section from the previewed version into the draft
  const handleRestoreSection = useCallback(
    (name: string) => {
      if (!previewVersionSections) return;
      const versionSection = previewVersionSections.find(
        (s) => s.name === name
      );
      if (!versionSection) return;

      pushUndoSnapshot(structuredClone(sectionsRef.current));
      const current = sectionsRef.current;
      const exists = current.some((s) => s.name === name);
      const updated = exists
        ? current.map((s) =>
            s.name === name ? { ...s, content: versionSection.content } : s
          )
        : [...current, structuredClone(versionSection)];
      setSections(updated);
      rebuildPreviewHtml(updated);
      setIsDirty(true);
      showSuccessToast("Section restored", `"${name}" updated in the draft`);
    },
    [previewVersionSections, pushUndoSnapshot, rebuildPreviewHtml]
  );

  const handleRestoreVersion = useCallback(
    async (versionId: string) => {
      if (!projectId || !draftPageId) return;
      const res = await restorePageVersionIntoDraft(
        projectId,
        draftPageId,
        versionId
      );
      const restoredDraft = res.data;

      // The restore replaced the draft server-side (its prior state was
      // snapshotted there) — reset local editing state to the restored draft.
      setPage(restoredDraft);
      setDraftPageId(restoredDraft.id);
      const restoredSections = normalizeSections(restoredDraft.sections);
      setSections(restoredSections);
      rebuildPreviewHtml(restoredSections);
      setUndoStack([]);
      setRedoStack([]);
      setIsDirty(false);
      setPreviewVersion(null);
      setPreviewVersionHtml("");
      setPreviewVersionSections(null);
      clearBackup();
      clearSelection();
      showSuccessToast("Version restored", "Now editing the restored draft");
    },
    [projectId, draftPageId, rebuildPreviewHtml, clearBackup, clearSelection]
  );

  // --- Site-wide find & replace ---
  // It writes to drafts server-side, so unsaved local edits must land first.
  const handleOpenFindReplace = useCallback(() => {
    if (isDirty) {
      setEditError(
        "Save your changes before running Find & Replace — it updates drafts on the server."
      );
      return;
    }
    setShowFindReplace(true);
  }, [isDirty]);

  const handleFindReplaceApplied = useCallback(
    async (summary: { pagesChanged: number; replacements: number; pageIds: string[] }) => {
      // If the open draft was among the changed pages, reload it.
      if (!projectId || !draftPageId || !summary.pageIds.includes(draftPageId))
        return;
      try {
        const freshPage = await fetchPage(projectId, draftPageId);
        setPage(freshPage.data);
        const freshSections = normalizeSections(freshPage.data.sections);
        setSections(freshSections);
        rebuildPreviewHtml(freshSections);
        setUndoStack([]);
        setRedoStack([]);
        setIsDirty(false);
        clearSelection();
      } catch (err) {
        console.error("Failed to reload page after find & replace:", err);
      }
    },
    [projectId, draftPageId, rebuildPreviewHtml, clearSelection]
  );

  // --- Back navigation with unsaved-changes guard ---
  const handleBackClick = useCallback(() => {
    if (isDirty) {
      setShowLeaveModal(true);
      return;
    }
    navigate(`/admin/websites/${projectId}`);
  }, [isDirty, navigate, projectId]);

  // --- Current chat messages for selected element ---
  const currentChatMessages = selectedInfo
    ? chatMap.get(selectedInfo.alloroClass) || []
    : [];

  // --- Preview HTML with per-section regenerate overlays applied ---
  // Derived so either a change to htmlContent (new generation arrived) or a
  // change to regeneratingSectionNames (user kicked off / we cleared a
  // rebuild) re-runs the overlay injection.
  const previewHtml = useMemo(
    () => injectRegenerateOverlays(htmlContent, regeneratingSectionNames),
    [htmlContent, regeneratingSectionNames],
  );

  // --- Loading state ---
  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
        {/* Topbar loading indicator */}
        <LoadingIndicator />
        <AdminTopBar />
        <AdminSidebar />

        {/* Loading skeleton that matches editor layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar skeleton */}
          <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="flex-1 p-4 space-y-3">
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
            </div>
          </div>

          {/* Center preview skeleton */}
          <div className="flex-1 bg-gray-100 p-4 flex items-center justify-center">
            <div className="w-full h-full max-w-6xl bg-white rounded-xl shadow-lg border border-gray-200 animate-pulse"></div>
          </div>

          {/* Right sidebar skeleton */}
          <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="flex-1 p-4 space-y-3">
              <div className="h-20 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error || !page) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminTopBar />
        <div className="flex items-center justify-center" style={{ height: "calc(100vh - 4rem)" }}>
          <div className="text-center">
            <p className="text-sm text-red-500 mb-4">{error || "Page not found"}</p>
            <button
              onClick={() => navigate(`/admin/websites/${projectId}`)}
              className="text-xs text-alloro-orange hover:text-alloro-orange/80 transition-colors"
            >
              Back to project
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Topbar loading indicator */}
      <LoadingIndicator />

      {/* Admin header */}
      <AdminTopBar />

      {/* Editor toolbar */}
      <EditorToolbar
        pagePath={page.path}
        pageVersion={page.version}
        pageStatus={page.status}
        device={device}
        onDeviceChange={setDevice}
        activeView={activeView}
        onViewChange={handleViewChange}
        onBack={handleBackClick}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={handleSave}
        onSaveWithNote={handleSaveWithNote}
        onPublish={handlePublish}
        onRegenerate={
          !isLivePreview && !loading && sections.length > 0 && activeView === "visual"
            ? () => setRegenerateModalOpen(true)
            : undefined
        }
        onFindReplace={
          page.page_type !== "artifact" && !isLivePreview
            ? handleOpenFindReplace
            : undefined
        }
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        isSaving={isSaving}
        isPublishing={isPublishing}
        isDirty={isDirty}
      />

      {/* Version preview banner */}
      {previewVersion && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-amber-700 font-medium">
            Previewing v{previewVersion.version} — editing is disabled
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRestoreVersion(previewVersion.id)}
              className="text-xs px-2.5 py-1 rounded-md bg-alloro-orange text-white hover:bg-alloro-orange/90 transition-colors"
            >
              Restore this version
            </button>
            <button
              onClick={handleExitPreview}
              className="text-xs px-2.5 py-1 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              Exit preview
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {editError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-red-600">{editError}</span>
          <button
            onClick={() => setEditError(null)}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main content: iframe + editor sidebar */}
      <div className="flex-1 flex overflow-hidden relative ml-[72px]">
        {/* Admin sidebar — fixed position, collapsed by default.
            Offset below both AdminTopBar (4rem) and EditorToolbar (~41px).
            ml-[72px] on parent reserves space for the collapsed sidebar. */}
        <AdminSidebar topOffset="calc(4rem + 41px)" />

        {/* Artifact page: show upload UI instead of editor */}
        {page.page_type === "artifact" ? (
          <ArtifactEditorView
            projectId={projectId!}
            page={page}
            onReplaced={(updated) => setPage(updated)}
          />
        ) : activeView === "seo" ? (
          <div className="flex-1 overflow-hidden">
            <SeoPanel
              projectId={projectId!}
              entityId={draftPageId!}
              entityType="page"
              seoData={page.seo_data}
              pagePath={page.path}
              pageContent={sections.map((s) => s.content || "").join("\n")}
              homepageContent=""
              headerHtml={project?.header || ""}
              footerHtml={project?.footer || ""}
              wrapperHtml={project?.wrapper || ""}
              onSeoDataChange={(data: SeoData) => {
                setPage((prev) => prev ? { ...prev, seo_data: data } : prev);
              }}
              organizationId={project?.organization?.id}
            />
          </div>
        ) : activeView === "code" ? (
          <>
            <div className="flex-1 overflow-hidden">
              <SectionsEditor
                sections={sections}
                onChange={handleCodeSectionsChange}
                onSave={handleSave}
              />
            </div>
            <div className="flex-1 bg-gray-100 p-4 overflow-hidden flex items-start justify-center">
              <div
                className="relative h-full rounded-xl overflow-hidden shadow-lg border border-gray-200 transition-all duration-300 mx-auto bg-white"
                style={{
                  width:
                    device === "desktop"
                      ? "100%"
                      : device === "tablet"
                        ? "768px"
                        : "375px",
                  maxWidth: "100%",
                }}
              >
                <iframe
                  srcDoc={prepareHtmlForPreview(previewHtml)}
                  sandbox="allow-same-origin allow-scripts"
                  className="w-full h-full border-0 bg-white"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 bg-gray-100 p-4 overflow-hidden flex items-start justify-center">
              <div
                className="h-full rounded-xl overflow-hidden shadow-lg border border-gray-200 transition-all duration-300 mx-auto bg-white"
                style={{
                  width:
                    device === "desktop"
                      ? "100%"
                      : device === "tablet"
                        ? "768px"
                        : "375px",
                  maxWidth: "100%",
                }}
              >
                {isLivePreview && regeneratingSectionNames.size === 0 ? (
                  <ProgressivePagePreview
                    projectId={projectId || ""}
                    pageId={pageId || ""}
                  />
                ) : (
                  <iframe
                    ref={iframeRef}
                    srcDoc={prepareHtmlForPreview(
                      previewVersion ? previewVersionHtml : previewHtml
                    )}
                    sandbox="allow-same-origin allow-scripts"
                    onLoad={previewVersion ? undefined : handleIframeLoad}
                    className="w-full h-full border-0 bg-white"
                  />
                )}
                {!isLivePreview && !previewVersion && (
                  <div className="absolute inset-0 pointer-events-none">
                    <InlineEditorPopover
                      selectedInfo={selectedInfo}
                      mediaApi={mediaApi}
                      isEditing={isEditing}
                      isCanvasTextEditing={isCanvasTextEditing}
                      onStartCanvasTextEdit={beginCanvasTextEditing}
                      onApplyDirectEdit={handleApplyDirectEdit}
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Editor sidebar — shown only in visual view, hidden during live preview */}
        {activeView === "visual" && !isLivePreview && (
          <EditorSidebar
            selectedInfo={selectedInfo}
            chatMessages={currentChatMessages}
            onSendEdit={handleSendEdit}
            onApplyDirectEdit={handleApplyDirectEdit}
            onToggleHidden={handleToggleHidden}
            isEditing={isEditing}
            debugInfo={lastDebugInfo}
            systemPrompt={systemPrompt}
            mediaApi={mediaApi}
            externalAction={pendingSidebarAction !== ("__deferred__" as QuickActionType) ? pendingSidebarAction : null}
            onExternalActionHandled={() => setPendingSidebarAction(null)}
            isCanvasTextEditing={isCanvasTextEditing}
            onLiveTextPreview={handleLiveTextPreview}
            onLiveTextRevert={handleLiveTextRevert}
            primaryColor={project?.primary_color}
            accentColor={project?.accent_color}
            showHistory={true}
            historyPageId={draftPageId}
            fetchVersions={fetchAdminVersions}
            allowRestorePublished={true}
            onPreviewVersion={handlePreviewVersion}
            onRestoreVersion={handleRestoreVersion}
            previewDiff={previewDiff}
            onRestoreSection={handleRestoreSection}
            isPreviewingVersion={!!previewVersion}
            previewVersionId={previewVersion?.id || null}
            onExitPreview={handleExitPreview}
          />
        )}
      </div>

      {/* Leave-without-saving Confirmation Modal */}
      <ConfirmModal
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        onConfirm={() => {
          setShowLeaveModal(false);
          navigate(`/admin/websites/${projectId}`);
        }}
        title="Leave Editor?"
        message="You have unsaved changes. If you leave now they will be lost."
        confirmText="Leave"
        cancelText="Keep Editing"
        type="warning"
      />

      {/* Publish Confirmation Modal (with advisory lint chips) */}
      <PublishConfirmModal
        isOpen={showPublishModal}
        warnings={publishLintWarnings}
        isLoading={isPublishing}
        onClose={() => setShowPublishModal(false)}
        onConfirm={handlePublishConfirmed}
      />

      {/* Save Conflict Modal (409 STALE_WRITE) */}
      <ConfirmModal
        isOpen={showConflictModal}
        onClose={() => setShowConflictModal(false)}
        onConfirm={handleForceSave}
        title="Page Changed Elsewhere"
        message="This page was saved by someone else after you loaded it. Saving anyway overwrites their version (it stays in History). Keep editing to review first — your work is also backed up locally."
        confirmText="Save Anyway"
        cancelText="Keep Editing"
        type="warning"
      />

      {/* Crash Recovery Modal */}
      <ConfirmModal
        isOpen={recoveryPrompt !== null}
        onClose={() => setRecoveryPrompt(null)}
        onConfirm={() => {
          if (recoveryPrompt) {
            pushUndoSnapshot(structuredClone(sectionsRef.current));
            setSections(recoveryPrompt);
            rebuildPreviewHtml(recoveryPrompt);
            setIsDirty(true);
          }
          setRecoveryPrompt(null);
        }}
        title="Recover Unsaved Changes?"
        message="We found unsaved edits from a previous session that are newer than the saved page. Recover them into the editor?"
        confirmText="Recover"
        cancelText="Not Now"
        type="info"
      />

      {/* Success Alert Modal */}
      <AlertModal
        isOpen={showSuccessAlert}
        onClose={() => setShowSuccessAlert(false)}
        title="Published Successfully"
        message={successMessage}
        type="success"
        buttonText="Continue Editing"
        autoDismiss={true}
      />

      {/* Site-wide Find & Replace Modal */}
      {projectId && (
        <FindReplaceModal
          projectId={projectId}
          isOpen={showFindReplace}
          onClose={() => setShowFindReplace(false)}
          onApplied={handleFindReplaceApplied}
        />
      )}

      {/* Regenerate Component Modal */}
      {regenerateModalOpen && projectId && draftPageId && (
        <RegenerateComponentModal
          projectId={projectId}
          pageId={draftPageId}
          sectionNames={sections.map((s) => s.name)}
          onWillRegenerate={(sectionName) => {
            // Snapshot + flag BEFORE the API fires so the poll loop can't
            // observe gen=generating with an empty regeneratingSectionNames
            // set (which would briefly mount ProgressivePagePreview and
            // flash "Loading preview…").
            const target = sectionsRef.current.find((s) => s.name === sectionName);
            if (target) {
              regenerateSnapshotsRef.current.set(sectionName, target.content || "");
            }
            setRegeneratingSectionNames((prev) => {
              const next = new Set(prev);
              next.add(sectionName);
              return next;
            });
          }}
          onRegenerated={async (sectionName) => {
            setRegenerateModalOpen(false);
            // Re-fetch page to trigger the live-preview effect
            // (page.generation_status === "generating"). By now the "will"
            // hook above has already set the flags, so the render path
            // stays on the existing iframe + in-place pulse overlay.
            const freshPage = await fetchPage(projectId, draftPageId);
            setPage(freshPage.data);
            // Suppress the next unused-var warning; sectionName is handled
            // by onWillRegenerate but we keep the param for API stability.
            void sectionName;
          }}
          onClose={() => setRegenerateModalOpen(false)}
        />
      )}
    </div>
  );
}

export default function PageEditor() {
  return (
    <SidebarProvider defaultCollapsed>
      <PageEditorInner />
    </SidebarProvider>
  );
}
