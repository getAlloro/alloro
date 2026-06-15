import { useState, useRef, useCallback, useEffect, useMemo, type CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchPage,
  fetchWebsiteDetail,
  createDraftFromPage,
  updatePageSections,
  publishPage,
  editPageComponent,
  fetchEditorSystemPrompt,
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
import { createAdminWebsiteMediaApi, type MediaItem } from "../../api/websiteMedia";
import type {
  WebsitePage,
  WebsiteProjectWithPages,
  EditDebugInfo,
  ApiError,
} from "../../api/websites";
import type { Section } from "../../api/templates";
import { renderPage, normalizeSections } from "../../utils/templateRenderer";
import { useIframeSelector } from "../../hooks/useIframeSelector";
import type { QuickActionPayload, QuickActionType } from "../../hooks/useIframeSelector";
import { replaceComponentInDom, validateHtml, extractSectionsFromDom } from "../../utils/htmlReplacer";
import {
  applyDirectEditorOperation,
  type DirectEditorOperation,
} from "../../utils/editorDirectOperations";
import { AdminTopBar } from "../../components/Admin/shell/AdminTopBar";
import { LoadingIndicator } from "../../components/Admin/shell/LoadingIndicator";
import { SidebarProvider, useSidebar } from "../../components/Admin/shell/SidebarContext";
import EditorToolbar from "../../components/PageEditor/EditorToolbar";
import type { ChatMessage } from "../../components/PageEditor/ChatPanel";
import { showSuccessToast } from "../../lib/toast";
import { logger } from "../../lib/logger";
import {
  injectRegenerateOverlays,
  chatMapToObject,
  objectToChatMap,
  CODE_EDIT_UNDO_COALESCE_MS,
  DESKTOP_PREVIEW_WIDTH,
} from "./pageEditor.utils";
import { EditorLoadingSkeleton } from "./PageEditor/EditorLoadingSkeleton";
import { EditorErrorState } from "./PageEditor/EditorErrorState";
import { PageEditorBody } from "./PageEditor/PageEditorBody";
import { VersionPreviewBanner } from "./PageEditor/VersionPreviewBanner";
import { EditorErrorBanner } from "./PageEditor/EditorErrorBanner";
import { PageEditorModals } from "./PageEditor/PageEditorModals";

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
          htmlStaleRef.current = true;

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
        logger.error("Edit failed:", err);
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

        // Consecutive text applies on the same element coalesce into one
        // undo entry (the debounced sidebar flushes mid-sentence); redo
        // still clears — the content changed either way.
        const now = Date.now();
        const coalesceText =
          operation.type === "replace-text" &&
          textUndoCoalesceRef.current?.cls === opInfo.alloroClass &&
          now - textUndoCoalesceRef.current.at < CODE_EDIT_UNDO_COALESCE_MS;
        textUndoCoalesceRef.current =
          operation.type === "replace-text"
            ? { cls: opInfo.alloroClass, at: now }
            : null;

        if (coalesceText) {
          setRedoStack([]);
        } else {
          pushUndoSnapshot(previousSections);
        }
        setSections(updatedSections);
        // Keep the ref in lockstep so a synchronous flush-then-save reads the
        // just-applied content (Save while an inline edit is mid-flight).
        sectionsRef.current = updatedSections;
        htmlStaleRef.current = true;
        liveTextRef.current = null;
        setIsDirty(true);
        setupListeners();
        iframe.contentWindow?.scrollTo(scrollX, scrollY);
        if (operation.type === "delete-element") clearSelection();
        else if (!isOverride) setSelectedInfo(result.selectedInfo);
      } catch (err) {
        setEditError(err instanceof Error ? err.message : "Direct edit failed");
      }
    },
    [selectedInfo, pushUndoSnapshot, setupListeners, setSelectedInfo, clearSelection],
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
      htmlStaleRef.current = false;
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

      // Flush any in-progress inline edit into sections first, so a Save click
      // mid-typing persists the typed change instead of the pre-edit content.
      const flushed = flushCanvasTextEdit();
      if (flushed) handleApplyDirectEdit(flushed.operation, flushed.targetAlloroClass);

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
          prev
            ? { ...prev, updated_at: res.data.updated_at, version: res.data.version }
            : prev
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
        logger.error("Save failed:", err);
        setEditError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, draftPageId, isSaving, page?.updated_at, clearBackup, flushCanvasTextEdit, handleApplyDirectEdit]
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

    // Flush any in-progress inline edit so Publish ships the typed change even
    // if the user never clicked away from the canvas first.
    const flushed = flushCanvasTextEdit();
    if (flushed) handleApplyDirectEdit(flushed.operation, flushed.targetAlloroClass);

    try {
      setIsPublishing(true);

      // `flushed` forces the pre-publish save when an inline edit was just
      // captured (the closure `isDirty` predates it).
      if (isDirty || flushed) {
        // The pre-publish save must honor the same optimistic-concurrency
        // guard as a normal Save — without it, Publish silently overwrites
        // concurrent edits and ships them live.
        try {
          const saveRes = await updatePageSections(
            projectId,
            draftPageId,
            sectionsRef.current,
            chatMapToObject(chatMapRef.current),
            { expectedUpdatedAt: page?.updated_at ?? null }
          );
          setPage((prev) =>
            prev ? { ...prev, updated_at: saveRes.data.updated_at } : prev
          );
          setIsDirty(false);
          clearBackup();
        } catch (saveErr) {
          if ((saveErr as ApiError).code === "STALE_WRITE") {
            setShowPublishModal(false);
            setShowConflictModal(true);
            return;
          }
          throw saveErr;
        }
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

      // Adopt the fresh draft's sections, but DON'T rebuild htmlContent — the
      // canvas already shows exactly this content (we just published it), so a
      // srcDoc swap here only flashes/reloads the preview for no visual change.
      // htmlContent's freshness is unchanged by publish (same content), so the
      // existing htmlStaleRef value still holds — leave it as-is.
      const draftSections: Section[] = normalizeSections(newDraft.data.sections);
      setSections(draftSections);

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
      logger.error("Publish failed:", err);
      setEditError(
        err instanceof Error ? err.message : "Failed to publish"
      );
      setShowPublishModal(false);
    } finally {
      setIsPublishing(false);
    }
  }, [projectId, draftPageId, isDirty, page?.updated_at, clearBackup, flushCanvasTextEdit, handleApplyDirectEdit]);

  // --- View switching ---
  const handleViewChange = useCallback(
    (view: EditorView) => {
      // Clear selection when entering code or seo view
      if (view === "code" || view === "seo") {
        clearSelection();
      }

      // Leaving the visual view unmounts the iframe; if in-place edits made
      // htmlContent stale, the remount would show (and later persist) the
      // pre-edit markup.
      if (htmlStaleRef.current) rebuildPreviewHtml(sectionsRef.current);

      setActiveView(view);
    },
    [clearSelection, rebuildPreviewHtml]
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
    // The iframe srcDoc swaps back from the version preview — rebuild from
    // sections first when in-place edits made htmlContent stale, or the
    // editor visually reverts those edits (and the next extraction would
    // persist the reversion).
    if (htmlStaleRef.current) rebuildPreviewHtml(sectionsRef.current);
    setPreviewVersion(null);
    setPreviewVersionHtml("");
    setPreviewVersionSections(null);
  }, [rebuildPreviewHtml]);

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
      let restoredDraft;
      try {
        const res = await restorePageVersionIntoDraft(
          projectId,
          draftPageId,
          versionId
        );
        restoredDraft = res.data;
      } catch (err) {
        // ApiError is a type alias (Error & {code,status}), not a class, so it
        // can't be used with instanceof — an ApiError IS an Error instance.
        const message = err instanceof Error ? err.message : null;
        setEditError(
          message
            ? `Restore failed: ${message}`
            : "Restore failed — the draft was left unchanged."
        );
        return;
      }

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
        logger.error("Failed to reload page after find & replace:", err);
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
    return <EditorLoadingSkeleton />;
  }

  // --- Error state ---
  if (error || !page) {
    return (
      <EditorErrorState error={error} projectId={projectId} navigate={navigate} />
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
            ? () => {
                // Regen rebuilds the section from the SAVED draft server-side —
                // unsaved local edits to it would silently vanish in the swap.
                if (isDirty) {
                  setEditError(
                    "Save your changes before regenerating a section — regeneration works from the last saved draft."
                  );
                  return;
                }
                setRegenerateModalOpen(true);
              }
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
        <VersionPreviewBanner
          previewVersion={previewVersion}
          onRestoreVersion={handleRestoreVersion}
          onExitPreview={handleExitPreview}
        />
      )}

      {/* Error banner */}
      {editError && (
        <EditorErrorBanner
          editError={editError}
          onDismiss={() => setEditError(null)}
        />
      )}

      {/* Main content: iframe + editor sidebar */}
      <PageEditorBody
        page={page}
        project={project}
        projectId={projectId}
        pageId={pageId}
        draftPageId={draftPageId}
        sections={sections}
        activeView={activeView}
        device={device}
        isLivePreview={isLivePreview}
        regeneratingSectionNames={regeneratingSectionNames}
        previewVersion={previewVersion}
        previewVersionHtml={previewVersionHtml}
        previewHtml={previewHtml}
        deviceFrameStyle={deviceFrameStyle}
        deviceIframeStyle={deviceIframeStyle}
        observePreviewArea={observePreviewArea}
        iframeRef={iframeRef}
        mediaApi={mediaApi}
        selectedInfo={selectedInfo}
        isEditing={isEditing}
        isCanvasTextEditing={isCanvasTextEditing}
        currentChatMessages={currentChatMessages}
        lastDebugInfo={lastDebugInfo}
        systemPrompt={systemPrompt}
        pendingSidebarAction={pendingSidebarAction}
        previewDiff={previewDiff}
        setPage={setPage}
        handleCodeSectionsChange={handleCodeSectionsChange}
        handleSave={handleSave}
        handleIframeLoad={handleIframeLoad}
        beginCanvasTextEditing={beginCanvasTextEditing}
        handleApplyDirectEdit={handleApplyDirectEdit}
        handleSendEdit={handleSendEdit}
        handleToggleHidden={handleToggleHidden}
        setPendingSidebarAction={setPendingSidebarAction}
        handleLiveTextPreview={handleLiveTextPreview}
        handleLiveTextRevert={handleLiveTextRevert}
        fetchAdminVersions={fetchAdminVersions}
        handlePreviewVersion={handlePreviewVersion}
        handleRestoreVersion={handleRestoreVersion}
        handleRestoreSection={handleRestoreSection}
        handleExitPreview={handleExitPreview}
      />

      <PageEditorModals
        projectId={projectId}
        draftPageId={draftPageId}
        navigate={navigate}
        sectionsRef={sectionsRef}
        regenerateSnapshotsRef={regenerateSnapshotsRef}
        sections={sections}
        showLeaveModal={showLeaveModal}
        setShowLeaveModal={setShowLeaveModal}
        showPublishModal={showPublishModal}
        setShowPublishModal={setShowPublishModal}
        publishLintWarnings={publishLintWarnings}
        isPublishing={isPublishing}
        handlePublishConfirmed={handlePublishConfirmed}
        showConflictModal={showConflictModal}
        setShowConflictModal={setShowConflictModal}
        handleForceSave={handleForceSave}
        recoveryPrompt={recoveryPrompt}
        setRecoveryPrompt={setRecoveryPrompt}
        pushUndoSnapshot={pushUndoSnapshot}
        setSections={setSections}
        rebuildPreviewHtml={rebuildPreviewHtml}
        setIsDirty={setIsDirty}
        showSuccessAlert={showSuccessAlert}
        setShowSuccessAlert={setShowSuccessAlert}
        successMessage={successMessage}
        showFindReplace={showFindReplace}
        setShowFindReplace={setShowFindReplace}
        handleFindReplaceApplied={handleFindReplaceApplied}
        regenerateModalOpen={regenerateModalOpen}
        setRegenerateModalOpen={setRegenerateModalOpen}
        setRegeneratingSectionNames={setRegeneratingSectionNames}
        setPage={setPage}
      />
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
