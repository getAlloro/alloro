import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { apiGet, apiPost, apiPatch } from "../api";
import { userWebsiteMediaApi } from "../api/websiteMedia";
import {
  renderPage as assemblePageHtml,
  normalizeSections,
} from "../utils/templateRenderer";
import { useIframeSelector } from "../hooks/useIframeSelector";
import type {
  QuickActionPayload,
  QuickActionType,
} from "../hooks/useIframeSelector";
import {
  replaceComponentInDom,
  validateHtml,
  extractSectionsFromDom,
} from "../utils/htmlReplacer";
import { type DirectEditorOperation } from "../utils/editorDirectOperations";
import { useLocalDraftBackup } from "../hooks/useLocalDraftBackup";
import type { ChatMessage } from "../components/PageEditor/ChatPanel";
import type { PageVersion } from "../components/PageEditor/VersionHistoryTab";
import type { Section } from "../api/templates";
import { useSidebar } from "../components/Admin/shell/SidebarContext";
import {
  useIsWizardActive,
  useWizardDemoData,
  useOnboardingWizard,
} from "../contexts/OnboardingWizardContext";
import { logger } from "../lib/logger";
import type { Page, Project, SectionHistoryEntry } from "./dfyWebsite.types";
import {
  type WebsiteTab,
  getWebsiteTabFromParams,
  parseWebsiteTab,
} from "./dfyWebsite.utils";
import { useDfyWebsiteEditor } from "./useDfyWebsiteEditor";

export function useDfyWebsite() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<
    "PREPARING" | "READY" | "READ_ONLY" | null
  >(null);
  const [project, setProject] = useState<Project | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const activeView = getWebsiteTabFromParams(searchParams);
  const [viewportMode, setViewportMode] = useState<"desktop" | "mobile">(
    "desktop",
  );

  // Version preview state
  const [previewVersion, setPreviewVersion] = useState<PageVersion | null>(null);
  const [previewHtmlContent, setPreviewHtmlContent] = useState("");

  // Editor state (ported from admin PageEditor)
  const [sections, setSections] = useState<Section[]>([]);
  const [htmlContent, setHtmlContent] = useState("");
  const [resolvedHtmlContent, setResolvedHtmlContent] = useState("");
  const [chatMap, setChatMap] = useState<Map<string, ChatMessage[]>>(new Map());
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<SectionHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<SectionHistoryEntry[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingSidebarAction, setPendingSidebarAction] =
    useState<QuickActionType | null>(null);

  // Optimistic-concurrency conflict (409 STALE_WRITE) on save
  const [showConflictModal, setShowConflictModal] = useState(false);

  // Crash-recovery prompt (localStorage backup newer than the server row)
  const [recoveryPrompt, setRecoveryPrompt] = useState<Section[] | null>(null);
  const recoveryCheckedRef = useRef<string | null>(null);

  const { setCollapsed } = useSidebar();
  const mediaApi = useMemo(() => userWebsiteMediaApi, []);
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();

  const setWebsiteTab = useCallback(
    (tab: WebsiteTab) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("view");
        if (tab === "overview") {
          next.delete("tab");
        } else {
          next.set("tab", tab);
        }
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  // Wizard: drive the active tab so each website tour step spotlights a mounted
  // view. The editor/submissions targets don't exist on the default overview,
  // and the editor lazy-mounts — so force the matching tab while the tour runs.
  const { currentStep: wizardStep } = useOnboardingWizard();
  useEffect(() => {
    if (!isWizardActive || !wizardStep || wizardStep.page !== "website") return;
    if (wizardStep.id === "website-editor") setWebsiteTab("editor");
    else if (wizardStep.id === "website-submissions") setWebsiteTab("submissions");
    else if (wizardStep.id === "website-overview") setWebsiteTab("overview");
  }, [isWizardActive, wizardStep, setWebsiteTab]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  // The element currently being live-previewed from the sidebar textarea —
  // stored WITH its class so revert always targets the previewed element,
  // even after the selection has moved on (visual only; restored on abandon).
  const liveTextRef = useRef<{ alloroClass: string; html: string } | null>(null);

  // Crash-recovery backup (localStorage mirror of dirty sections)
  const { clearBackup, readBackup } = useLocalDraftBackup({
    pageId: selectedPage?.id ?? null,
    sections,
    isDirty,
  });

  // Offer recovery once per page when a backup is newer than the server row.
  useEffect(() => {
    if (!selectedPage || activeView !== "editor") return;
    if (recoveryCheckedRef.current === selectedPage.id) return;
    recoveryCheckedRef.current = selectedPage.id;

    const backup = readBackup(selectedPage.id);
    if (!backup) return;
    if (backup.savedAt > new Date(selectedPage.updated_at).getTime()) {
      setRecoveryPrompt(backup.sections);
    }
  }, [selectedPage, activeView, readBackup]);

  // --- Cmd/Ctrl+S saves (never the browser dialog) ---
  // Ref indirection keeps the listener identity stable; the actual save
  // handler is assigned after it's defined below.
  const saveRef = useRef<() => void>(() => {});

  const handleSaveShortcut = useCallback((e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "s") return;
    e.preventDefault();
    saveRef.current();
  }, []);

  useEffect(() => {
    if (activeView !== "editor") return;
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [activeView, handleSaveShortcut]);
  const deferredEditRef = useRef<DirectEditorOperation | null>(null);
  // The element a deferred commit is pinned to (from the canvas session that
  // emitted it) so it applies there even if the selection has moved on.
  const deferredTargetRef = useRef<string | undefined>(undefined);
  // Tracks the page whose editor HTML is already assembled, so re-entering the
  // editor tab (e.g. from the overview) doesn't rebuild and clobber unsaved edits.
  const assembledPageIdRef = useRef<string | null>(null);
  // True when in-place iframe mutations have outrun htmlContent. Any iframe
  // remount (viewport toggle, editor re-entry) must rebuild from sections
  // first, or the stale srcDoc visually reverts the edits and the NEXT
  // edit's extraction persists that reversion.
  const htmlStaleRef = useRef(false);
  // Coalesce consecutive sidebar text applies on the same element into one
  // undo entry (the field debounces, but a long sentence still flushes
  // several times).
  const textUndoCoalesceRef = useRef<{ cls: string; at: number } | null>(null);

  // Collapse the sidebar only while the page editor is open; expand it for the
  // overview and every other (non-editor) view. Restore on unmount.
  useEffect(() => {
    setCollapsed(activeView === "editor");
    return () => setCollapsed(false);
  }, [activeView, setCollapsed]);

  // Hide the global support FAB while the editor view is open so it never
  // overlaps the sidebar (see index.css [data-editor-fullscreen]).
  useEffect(() => {
    if (activeView !== "editor") return;
    document.body.setAttribute("data-editor-fullscreen", "true");
    return () => document.body.removeAttribute("data-editor-fullscreen");
  }, [activeView]);

  // Normalize legacy links like ?view=submissions to the new ?tab= permalink.
  useEffect(() => {
    if (!searchParams.has("view")) return;

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const legacyTab = parseWebsiteTab(next.get("view"));
      next.delete("view");

      if (legacyTab && legacyTab !== "editor" && !next.has("tab")) {
        next.set("tab", legacyTab);
      }

      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  // Mark all submissions as read when switching to submissions view
  useEffect(() => {
    if (activeView !== "submissions") return;

    const markAllRead = async () => {
      try {
        await apiPatch({ path: "/user/website/form-submissions/mark-all-read" });
        window.dispatchEvent(new Event("submissions:updated"));
      } catch {
        // Silent fail — non-critical
      }
    };

    markAllRead();
  }, [activeView]);

  // Warn before closing/reloading when there are unsaved changes
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

  // Resolve shortcodes for preview (debounced)
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!htmlContent) {
      setResolvedHtmlContent("");
      return;
    }

    // Always show raw HTML immediately (prevents blank screen)
    setResolvedHtmlContent(htmlContent);

    // If no shortcodes present, no need to resolve
    if (
      !htmlContent.includes("post_block") &&
      !htmlContent.includes("review_block") &&
      !htmlContent.includes("{{ menu")
    ) {
      return;
    }

    // Resolve shortcodes asynchronously
    setIsResolving(true);
    if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
    resolveTimerRef.current = setTimeout(async () => {
      try {
        const res = await apiPost({
          path: "/user/website/resolve-preview",
          passedData: { html: htmlContent },
        });
        setResolvedHtmlContent(res.html || htmlContent);
      } catch {
        // On failure, raw HTML is already showing
      } finally {
        setIsResolving(false);
      }
    }, 300);

    return () => {
      if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
    };
  }, [htmlContent]);

  // Rebuild htmlContent from given sections (keeps undo/redo in sync)
  const rebuildHtml = useCallback(
    (newSections: Section[]) => {
      if (!project) return;
      const html = assemblePageHtml(
        project.wrapper || "{{slot}}",
        project.header || "",
        project.footer || "",
        newSections,
        undefined,
        undefined,
        undefined,
        project.id,
      );
      htmlStaleRef.current = false;
      setHtmlContent(html);
    },
    [project],
  );

  // The desktop and mobile previews are separate <iframe> elements, so the
  // viewport toggle remounts — rebuild first when in-place edits made the
  // current htmlContent stale.
  useEffect(() => {
    if (htmlStaleRef.current) rebuildHtml(sectionsRef.current);
  }, [viewportMode, rebuildHtml]);

  // Quick action handler from iframe label icons
  const handleIframeQuickAction = useCallback(
    (payload: QuickActionPayload) => {
      deferredTargetRef.current = payload.targetAlloroClass;
      if (payload.action === "rich-text" && payload.value) {
        deferredEditRef.current = {
          type: "replace-inline-html",
          html: payload.value,
        };
        setPendingSidebarAction("__deferred__" as QuickActionType);
      } else if (
        (payload.action === "text" || payload.action === "link") &&
        payload.value
      ) {
        deferredEditRef.current =
          payload.action === "text"
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
    },
    [],
  );

  // Selector hook (hover, click, selection in iframe)
  const {
    selectedInfo,
    setSelectedInfo,
    clearSelection,
    setupListeners,
    beginCanvasTextEditing,
    flushCanvasTextEdit,
    isCanvasTextEditing,
  } = useIframeSelector(iframeRef, handleIframeQuickAction, {
    sectionsOnly: true,
    onDirty: () => setIsDirty(true),
  });

  // --- Load website data (skip API when wizard is active) ---
  useEffect(() => {
    if (isWizardActive && wizardDemoData) {
      setProject(wizardDemoData.demoProject as unknown as Project);
      setPages(wizardDemoData.demoPages as unknown as Page[]);
      setStatus("READY");
      setLoading(false);
      if (wizardDemoData.demoPages?.length > 0) {
        setSelectedPage(wizardDemoData.demoPages[0] as unknown as Page);
      }
      return;
    }
    fetchWebsite();
  }, [isWizardActive, wizardDemoData]);

  // --- Assemble preview when page or project changes ---
  useEffect(() => {
    if (!selectedPage || !project) return;
    // Lazy editor: only build the heavy preview HTML (which also triggers
    // shortcode resolution) when the editor tab is active. Skip re-assembly for
    // a page that's already built so returning from the overview/other tabs
    // preserves unsaved edits.
    if (activeView !== "editor") return;
    if (assembledPageIdRef.current === selectedPage.id) {
      // Re-entering the editor for an already-built page: the iframe is
      // about to remount, and in-place edits may have outrun htmlContent —
      // rebuild from sections so the edits don't visually revert (and then
      // get persisted as a reversion by the next extraction).
      if (htmlStaleRef.current) rebuildHtml(sectionsRef.current);
      return;
    }
    assembledPageIdRef.current = selectedPage.id;

    const pageSections = normalizeSections(selectedPage.sections);
    setSections(pageSections);

    const html = assemblePageHtml(
      project.wrapper || "{{slot}}",
      project.header || "",
      project.footer || "",
      pageSections,
      undefined,
      undefined,
      undefined,
      project.id,
    );
    htmlStaleRef.current = false;
    setHtmlContent(html);

    // Reset editor state for new page
    setChatMap(new Map());
    setUndoStack([]);
    setRedoStack([]);
    setEditError(null);
    setIsDirty(false);
  }, [selectedPage, project, activeView, rebuildHtml]);

  const fetchWebsite = async () => {
    try {
      const data = await apiGet({ path: "/user/website" });

      if (data.status === "PREPARING") {
        setStatus("PREPARING");
      } else if (data.project) {
        setProject(data.project);
        setPages(data.pages || []);

        if (data.project.is_read_only) {
          setStatus("READ_ONLY");
        } else {
          setStatus("READY");
        }

        if (data.pages?.length > 0) {
          // Preserve the current selection by PATH — a restore replaces the
          // row at the path with a new id, and resetting to pages[0] would
          // silently swap the editor to the wrong page.
          setSelectedPage((prev) => {
            const samePath = prev
              ? data.pages.find((p: Page) => p.path === prev.path)
              : undefined;
            return samePath ?? data.pages[0];
          });
        }
      }
    } catch {
      toast.error("Failed to load website");
    } finally {
      setLoading(false);
    }
  };

  // --- Handle iframe load: set up selector listeners + save shortcut ---
  const handleIframeLoad = useCallback(() => {
    setupListeners();
    iframeRef.current?.contentDocument?.addEventListener(
      "keydown",
      handleSaveShortcut,
    );
  }, [setupListeners, handleSaveShortcut]);

  // --- Handle edit send (ported from admin PageEditor) ---
  const handleSendEdit = useCallback(
    async (instruction: string, attachedMedia?: Array<{ alt_text?: string | null; s3_url: string }>) => {
      if (!selectedPage || !selectedInfo) return;

      setIsEditing(true);
      setEditError(null);

      const alloroClass = selectedInfo.alloroClass;

      // Enrich instruction with attached media context
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
        content: instruction,
        timestamp: Date.now(),
      };

      setChatMap((prev) => {
        const next = new Map(prev);
        next.set(alloroClass, [
          ...(next.get(alloroClass) || []),
          userMessage,
        ]);
        return next;
      });

      try {
        const existingMessages = chatMap.get(alloroClass) || [];
        const chatHistory = existingMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const result = await apiPost({
          path: `/user/website/pages/${selectedPage.id}/edit`,
          passedData: {
            alloroClass,
            currentHtml: selectedInfo.outerHtml,
            instruction: enrichedInstruction,
            chatHistory,
          },
        });

        // apiPost swallows HTTP errors and returns the error body — a 4xx/5xx
        // here must surface as a failure, not masquerade as a silent success.
        if (!result || result.error) {
          throw new Error(result?.message || result?.error || "Edit failed");
        }

        // Handle rejection
        if (result.rejected) {
          const rejectionMessage: ChatMessage = {
            role: "assistant",
            content: result.message || "This edit is not allowed.",
            timestamp: Date.now(),
            isError: true,
          };

          setChatMap((prev) => {
            const next = new Map(prev);
            next.set(alloroClass, [
              ...(next.get(alloroClass) || []),
              rejectionMessage,
            ]);
            return next;
          });
          return;
        }

        // DOM mutation path — if API returns edited HTML
        if (result.editedHtml) {
          const validation = validateHtml(result.editedHtml);
          if (!validation.valid) {
            throw new Error(`Invalid HTML: ${validation.error}`);
          }

          const iframe = iframeRef.current;
          const changedSectionName =
            iframe?.contentDocument
              ?.querySelector(`.${CSS.escape(alloroClass)}`)
              ?.closest("[data-alloro-section]")
              ?.getAttribute("data-alloro-section") || undefined;
          const changedSectionNames = changedSectionName
            ? [changedSectionName]
            : undefined;

          setUndoStack((prev) => [
            ...prev,
            {
              sections: structuredClone(sections),
              changedSectionNames,
            },
          ]);
          setRedoStack([]);

          if (iframe?.contentDocument) {
            const scrollY = iframe.contentWindow?.scrollY || 0;
            const scrollX = iframe.contentWindow?.scrollX || 0;

            replaceComponentInDom(
              iframe.contentDocument,
              alloroClass,
              result.editedHtml,
            );

            const updatedSections = extractSectionsFromDom(
              iframe.contentDocument,
              sectionsRef.current,
            );
            setSections(updatedSections);
            // No rebuildHtml here — the DOM is already mutated in place;
            // re-setting srcDoc reloads the iframe and jumps the scroll.
            htmlStaleRef.current = true;
            setIsDirty(true);

            setupListeners();
            iframe.contentWindow?.scrollTo(scrollX, scrollY);

            const freshEl = iframe.contentDocument.querySelector(
              `.${CSS.escape(alloroClass)}`,
            );
            if (freshEl && selectedInfo) {
              setSelectedInfo({
                ...selectedInfo,
                outerHtml: freshEl.outerHTML,
                isHidden:
                  freshEl.getAttribute("data-alloro-hidden") === "true",
              });
            }
          }
        } else {
          // Fallback: refresh entire page data
          await fetchWebsite();
        }

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: result.message || "Edit applied.",
          timestamp: Date.now(),
        };

        setChatMap((prev) => {
          const next = new Map(prev);
          next.set(alloroClass, [
            ...(next.get(alloroClass) || []),
            assistantMessage,
          ]);
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
          next.set(alloroClass, [
            ...(next.get(alloroClass) || []),
            errorChatMessage,
          ]);
          return next;
        });
      } finally {
        setIsEditing(false);
      }
    },
    [selectedPage, selectedInfo, chatMap, setupListeners, setSelectedInfo],
  );

  const {
    handleApplyDirectEdit,
    handleLiveTextRevert,
    handleLiveTextPreview,
    handleToggleHidden,
    handleUndo,
    handleRedo,
    handleSave,
    handleForceSave,
    handlePreviewVersion,
    handleExitPreview,
    handleRestoreVersion,
    currentChatMessages,
  } = useDfyWebsiteEditor({
    project,
    selectedPage,
    setSelectedPage,
    setPages,
    sections,
    setSections,
    sectionsRef,
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
    isSaving,
    setIsSaving,
    setIsDirty,
    setHtmlContent,
    setShowConflictModal,
    chatMap,
    setEditError,
    setPreviewVersion,
    setPreviewHtmlContent,
    iframeRef,
    htmlStaleRef,
    liveTextRef,
    textUndoCoalesceRef,
    deferredEditRef,
    deferredTargetRef,
    pendingSidebarAction,
    setPendingSidebarAction,
    clearBackup,
    fetchWebsite,
    selectedInfo,
    setSelectedInfo,
    clearSelection,
    setupListeners,
    flushCanvasTextEdit,
  });

  saveRef.current = handleSave;

  return {
    activeView,
    beginCanvasTextEditing,
    currentChatMessages,
    editError,
    fetchWebsite,
    handleApplyDirectEdit,
    handleExitPreview,
    handleForceSave,
    handleIframeLoad,
    handleLiveTextPreview,
    handleLiveTextRevert,
    handlePreviewVersion,
    handleRedo,
    handleRestoreVersion,
    handleSave,
    handleSendEdit,
    handleToggleHidden,
    handleUndo,
    iframeRef,
    isCanvasTextEditing,
    isDirty,
    isEditing,
    isResolving,
    isSaving,
    loading,
    mediaApi,
    pages,
    pendingSidebarAction,
    previewHtmlContent,
    previewVersion,
    project,
    rebuildHtml,
    recoveryPrompt,
    redoStack,
    resolvedHtmlContent,
    sections,
    sectionsRef,
    selectedInfo,
    selectedPage,
    setEditError,
    setIsDirty,
    setPendingSidebarAction,
    setPreviewHtmlContent,
    setPreviewVersion,
    setRecoveryPrompt,
    setRedoStack,
    setSections,
    setSelectedPage,
    setShowConflictModal,
    setShowDomainModal,
    setUndoStack,
    setViewportMode,
    setWebsiteTab,
    showConflictModal,
    showDomainModal,
    status,
    undoStack,
    viewportMode,
  };
}
