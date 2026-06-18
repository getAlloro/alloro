import { useState, useRef, useCallback, useEffect, useMemo, type CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchPage,
  fetchWebsiteDetail,
  createDraftFromPage,
  fetchEditorSystemPrompt,
} from "../../api/websites";
import type { PageVersion } from "../../components/PageEditor/VersionHistoryTab";
import { useLocalDraftBackup } from "../../hooks/useLocalDraftBackup";
import { type PublishLintWarning } from "../../utils/publishLint";
import { createAdminWebsiteMediaApi } from "../../api/websiteMedia";
import type {
  WebsitePage,
  WebsiteProjectWithPages,
  EditDebugInfo,
} from "../../api/websites";
import type { Section } from "../../api/templates";
import { renderPage, normalizeSections } from "../../utils/templateRenderer";
import { useIframeSelector } from "../../hooks/useIframeSelector";
import type { QuickActionPayload, QuickActionType } from "../../hooks/useIframeSelector";
import {
  type DirectEditorOperation,
} from "../../utils/editorDirectOperations";
import { useSidebar } from "../../components/Admin/shell/SidebarContext";
import type { ChatMessage } from "../../components/PageEditor/ChatPanel";
import { showSuccessToast } from "../../lib/toast";
import { logger } from "../../lib/logger";
import {
  objectToChatMap,
  DESKTOP_PREVIEW_WIDTH,
} from "./pageEditor.utils";

// View state: visual (iframe), code (monaco), or seo (seo panel)
export type EditorView = "visual" | "code" | "seo";

export function usePageEditor() {
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
  const [device, setDevice] = useState<"desktop" | "mobile">(
    "desktop"
  );

  // Measure the preview pane so the desktop preview can render a fixed
  // true-desktop viewport scaled to fit (see DESKTOP_PREVIEW_WIDTH).
  const [previewAreaWidth, setPreviewAreaWidth] = useState(0);
  const previewAreaObserverRef = useRef<ResizeObserver | null>(null);
  const observePreviewArea = useCallback((el: HTMLDivElement | null) => {
    previewAreaObserverRef.current?.disconnect();
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setPreviewAreaWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    previewAreaObserverRef.current = ro;
  }, []);
  const desktopScale =
    previewAreaWidth > 0
      ? Math.min(1, previewAreaWidth / DESKTOP_PREVIEW_WIDTH)
      : 1;
  const deviceFrameStyle: CSSProperties =
    device === "desktop"
      ? { width: `${DESKTOP_PREVIEW_WIDTH * desktopScale}px`, maxWidth: "100%" }
      : { width: "375px", maxWidth: "100%" };
  const deviceIframeStyle: CSSProperties =
    device === "desktop"
      ? {
          width: `${DESKTOP_PREVIEW_WIDTH}px`,
          height: `${100 / desktopScale}%`,
          transform: `scale(${desktopScale})`,
          transformOrigin: "top left",
        }
      : { width: "100%", height: "100%" };
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // View state: visual (iframe), code (monaco), or seo (seo panel)
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
    flushCanvasTextEdit,
    isCanvasTextEditing,
  } =
    useIframeSelector(iframeRef, handleIframeQuickAction, {
      sectionsOnly: true,
      onDirty: () => setIsDirty(true),
    });

  // The device toggle changes the iframe width WITHOUT reloading it (so the
  // hook's on-load font-size refresh never fires) — re-read the selected
  // element's rendered size so the size label tracks the new breakpoint.
  const selectedAlloroClass = selectedInfo?.alloroClass;
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !selectedAlloroClass) return;
    const el = doc.querySelector(`.${CSS.escape(selectedAlloroClass)}`);
    const win = el?.ownerDocument.defaultView;
    if (!el || !win) return;
    const px = parseFloat(win.getComputedStyle(el).fontSize);
    const next = Number.isFinite(px) ? px : undefined;
    setSelectedInfo((prev) =>
      prev && prev.alloroClass === selectedAlloroClass && prev.fontSizePx !== next
        ? { ...prev, fontSizePx: next }
        : prev,
    );
  }, [device, selectedAlloroClass, setSelectedInfo]);

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
        logger.error("Failed to load page:", err);
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
                  // Wrapper-marked so extraction persists the CHILDREN —
                  // without this the swap div itself gets baked into the
                  // stored section on the next edit+save.
                  newWrap.setAttribute("data-alloro-section-wrapper", "true");
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
        logger.error("Live preview poll error:", err);
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
      .catch((err) => logger.error("Failed to load system prompt:", err));
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

  // True when in-place iframe mutations have outrun htmlContent — any srcDoc
  // swap (exit version preview, regen) must rebuild from sections first or
  // the iframe visually reverts the edits.
  const htmlStaleRef = useRef(false);
  // Coalesce consecutive sidebar text applies on the same element into one
  // undo entry.
  const textUndoCoalesceRef = useRef<{ cls: string; at: number } | null>(null);

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

  return {
    projectId,
    pageId,
    navigate,
    iframeRef,
    mediaApi,
    page,
    setPage,
    project,
    setProject,
    draftPageId,
    setDraftPageId,
    loading,
    error,
    sections,
    setSections,
    htmlContent,
    setHtmlContent,
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
    isDirty,
    setIsDirty,
    previewVersion,
    setPreviewVersion,
    previewVersionHtml,
    setPreviewVersionHtml,
    previewVersionSections,
    setPreviewVersionSections,
    showLeaveModal,
    setShowLeaveModal,
    showConflictModal,
    setShowConflictModal,
    pendingSaveNoteRef,
    recoveryPrompt,
    setRecoveryPrompt,
    publishLintWarnings,
    setPublishLintWarnings,
    showFindReplace,
    setShowFindReplace,
    device,
    setDevice,
    observePreviewArea,
    deviceFrameStyle,
    deviceIframeStyle,
    isEditing,
    setIsEditing,
    isSaving,
    setIsSaving,
    isPublishing,
    setIsPublishing,
    showPublishModal,
    setShowPublishModal,
    showSuccessAlert,
    setShowSuccessAlert,
    successMessage,
    setSuccessMessage,
    editError,
    setEditError,
    activeView,
    setActiveView,
    lastDebugInfo,
    setLastDebugInfo,
    systemPrompt,
    chatMap,
    setChatMap,
    pendingSidebarAction,
    setPendingSidebarAction,
    deferredEditRef,
    deferredTargetRef,
    selectedInfo,
    setSelectedInfo,
    clearSelection,
    setupListeners,
    beginCanvasTextEditing,
    flushCanvasTextEdit,
    isCanvasTextEditing,
    regenerateModalOpen,
    setRegenerateModalOpen,
    regeneratingSectionNames,
    setRegeneratingSectionNames,
    regenerateSnapshotsRef,
    isLivePreview,
    chatMapRef,
    sectionsRef,
    liveTextRef,
    htmlStaleRef,
    textUndoCoalesceRef,
    clearBackup,
    pushUndoSnapshot,
    undoRef,
    redoRef,
    saveRef,
    handleEditorKeyDown,
    handleIframeLoad,
  };
}
