import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  RotateCcw,
  Loader2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api";
import { userWebsiteMediaApi } from "../api/websiteMedia";
import ConnectDomainModal from "../components/Admin/website-tabs/ConnectDomainModal";
import FormSubmissionsTab from "../components/Admin/leadgen/FormSubmissionsTab";
import PostsTab from "../components/Admin/website-tabs/PostsTab";
import MenusTab from "../components/Admin/website-tabs/MenusTab";
import RecipientsConfig from "../components/Admin/leadgen/RecipientsConfig";
import { WebsiteOverview } from "../components/website/overview/WebsiteOverview";
import { KeywordsTab } from "../components/website/KeywordsTab";
import { WebsitePagesTab } from "../components/website/WebsitePagesTab";
import { WebsiteLoadingSkeleton } from "../components/website/WebsiteLoadingSkeleton";
import {
  renderPage as assemblePageHtml,
  normalizeSections,
} from "../utils/templateRenderer";
import {
  useIframeSelector,
  prepareHtmlForPreview,
} from "../hooks/useIframeSelector";
import type {
  QuickActionPayload,
  QuickActionType,
} from "../hooks/useIframeSelector";
import {
  replaceComponentInDom,
  validateHtml,
  extractSectionsFromDom,
} from "../utils/htmlReplacer";
import {
  applyDirectEditorOperation,
  type DirectEditorOperation,
} from "../utils/editorDirectOperations";
import EditorSidebar from "../components/PageEditor/EditorSidebar";
import InlineEditorPopover from "../components/PageEditor/InlineEditorPopover";
import { ConfirmModal } from "../components/settings/ConfirmModal";
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
  DESKTOP_SCALE,
  TEXT_UNDO_COALESCE_MS,
  type WebsiteTab,
  getWebsiteTabFromParams,
  parseWebsiteTab,
  userFetchRecipients,
  userUpdateRecipients,
  userFetchSubmissions,
  userToggleRead,
  userDeleteSubmission,
  userMarkAllRead,
  userFetchFormCatalog,
  userUpdateFormRecipientRule,
  userUpdateFormPreferences,
  userFetchPosts,
  userCreatePost,
  userUpdatePost,
  userDeletePost,
  userDuplicatePost,
  userFetchPostTypes,
  userFetchCategories,
  userFetchTags,
  userCreateCategory,
  userCreateTag,
  userUpdatePostSeo,
  userFetchMenus,
  userFetchMenu,
  userCreateMenu,
  userUpdateMenu,
  userDeleteMenu,
  userCreateMenuItem,
  userUpdateMenuItem,
  userDeleteMenuItem,
  userReorderMenuItems,
  handleExportSubmissions,
} from "./dfyWebsite.utils";
import { PreparingState } from "./DFYWebsite/PreparingState";
import { ReadOnlyState } from "./DFYWebsite/ReadOnlyState";
import { EmptyState } from "./DFYWebsite/EmptyState";
import { EditorToolbar } from "./DFYWebsite/EditorToolbar";
import { DashboardHeader } from "./DFYWebsite/DashboardHeader";

export function DFYWebsite() {
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
    } catch (error) {
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
        setEditError("Header/footer components can't be edited from the page editor.");
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
        const updatedSections = extractSectionsFromDom(
          doc,
          sectionsRef.current,
        );

        const changedSectionName =
          targetElement
            ?.closest("[data-alloro-section]")
            ?.getAttribute("data-alloro-section") || undefined;
        const changedSectionNames = changedSectionName
          ? [changedSectionName]
          : undefined;

        // Consecutive text applies on the same element coalesce into one
        // undo entry (the debounced sidebar flushes mid-sentence); redo
        // still clears — the content changed either way.
        const now = Date.now();
        const coalesceText =
          operation.type === "replace-text" &&
          textUndoCoalesceRef.current?.cls === opInfo.alloroClass &&
          now - textUndoCoalesceRef.current.at < TEXT_UNDO_COALESCE_MS;
        textUndoCoalesceRef.current =
          operation.type === "replace-text"
            ? { cls: opInfo.alloroClass, at: now }
            : null;

        if (!coalesceText) {
          setUndoStack((prev) => [
            ...prev,
            {
              sections: previousSections,
              changedSectionNames,
            },
          ]);
        }
        setRedoStack([]);
        setSections(updatedSections);
        // Keep the ref in lockstep so a synchronous flush-then-save (Save while
        // an inline edit is mid-flight) reads the just-applied content rather
        // than the stale render-time value.
        sectionsRef.current = updatedSections;
        // No rebuildHtml here — the operation already mutated the iframe DOM
        // in place; re-setting srcDoc reloads the preview on every font-size
        // step / color change and jumps the scroll. Mark htmlContent stale so
        // remount boundaries rebuild from sections.
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
    [selectedInfo, setupListeners, setSelectedInfo, clearSelection],
  );

  // --- Live text preview: mirror sidebar typing into the iframe element ---
  // Visual only — sections update on Apply; an abandoned preview reverts.
  const handleLiveTextRevert = useCallback(() => {
    const ref = liveTextRef.current;
    if (!ref) return;
    const doc = iframeRef.current?.contentDocument;
    const el = doc?.querySelector(
      `.${CSS.escape(ref.alloroClass)}`,
    ) as HTMLElement | null;
    if (el) el.innerHTML = ref.html;
    liveTextRef.current = null;
  }, []);

  const handleLiveTextPreview = useCallback(
    (value: string) => {
      if (!selectedInfo) return;
      const doc = iframeRef.current?.contentDocument;
      const el = doc?.querySelector(
        `.${CSS.escape(selectedInfo.alloroClass)}`,
      ) as HTMLElement | null;
      if (!el) return;
      // Holding a preview for a different element — revert it before starting.
      if (
        liveTextRef.current &&
        liveTextRef.current.alloroClass !== selectedInfo.alloroClass
      ) {
        handleLiveTextRevert();
      }
      if (!liveTextRef.current) {
        liveTextRef.current = {
          alloroClass: selectedInfo.alloroClass,
          html: el.innerHTML,
        };
      }
      el.textContent = value;
    },
    [selectedInfo, handleLiveTextRevert],
  );

  // Process deferred quick-action edits from iframe input panel
  useEffect(() => {
    if (
      deferredEditRef.current &&
      pendingSidebarAction === ("__deferred__" as QuickActionType)
    ) {
      const operation = deferredEditRef.current;
      const targetCls = deferredTargetRef.current;
      deferredEditRef.current = null;
      deferredTargetRef.current = undefined;
      setPendingSidebarAction(null);
      handleApplyDirectEdit(operation, targetCls);
    }
  }, [pendingSidebarAction, handleApplyDirectEdit]);

  // --- Toggle hidden ---
  const handleToggleHidden = useCallback(() => {
    handleApplyDirectEdit({ type: "toggle-hidden" });
  }, [handleApplyDirectEdit]);

  const syncPreviewDomFromSections = useCallback(
    (nextSections: Section[], changedSectionNames?: string[]) => {
      if (!project) return;

      const buildFullHtml = () =>
        assemblePageHtml(
          project.wrapper || "{{slot}}",
          project.header || "",
          project.footer || "",
          nextSections,
          undefined,
          undefined,
          undefined,
          project.id,
        );

      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!iframe?.contentWindow || !doc?.body || !changedSectionNames?.length) {
        setHtmlContent(buildFullHtml());
        return;
      }

      try {
        const scrollY = iframe.contentWindow.scrollY || 0;
        const scrollX = iframe.contentWindow.scrollX || 0;
        let patched = false;

        for (const sectionName of changedSectionNames) {
          const nextSection = nextSections.find(
            (section) => section.name === sectionName,
          );
          const liveSection = doc.querySelector(
            `[data-alloro-section="${CSS.escape(sectionName)}"]`,
          );
          if (!nextSection || !liveSection) continue;

          const sectionHtml = assemblePageHtml(
            "{{slot}}",
            "",
            "",
            [nextSection],
          );
          const nextDoc = new DOMParser().parseFromString(
            prepareHtmlForPreview(sectionHtml),
            "text/html",
          );
          const nextSectionEl = nextDoc.querySelector(
            `[data-alloro-section="${CSS.escape(sectionName)}"]`,
          );
          if (!nextSectionEl) continue;

          liveSection.replaceWith(doc.importNode(nextSectionEl, true));
          patched = true;
        }

        if (!patched) {
          htmlStaleRef.current = false;
          setHtmlContent(buildFullHtml());
          return;
        }

        // Patched the live DOM in place — htmlContent is now behind it.
        htmlStaleRef.current = true;
        setupListeners();
        iframe.contentWindow.scrollTo(scrollX, scrollY);
      } catch (err) {
        logger.error("Failed to sync preview DOM:", err);
        htmlStaleRef.current = false;
        setHtmlContent(buildFullHtml());
      }
    },
    [project, setupListeners],
  );

  // --- Undo ---
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !project) return;

    const previousEntry = undoStack[undoStack.length - 1];
    const previousSections = previousEntry.sections;
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [
      ...prev,
      {
        sections: structuredClone(sections),
        changedSectionNames: previousEntry.changedSectionNames,
      },
    ]);
    setSections(previousSections);
    setIsDirty(true);
    clearSelection();
    syncPreviewDomFromSections(previousSections, previousEntry.changedSectionNames);
  }, [undoStack, sections, project, clearSelection, syncPreviewDomFromSections]);

  // --- Redo ---
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !project) return;

    const nextEntry = redoStack[redoStack.length - 1];
    const nextSections = nextEntry.sections;
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [
      ...prev,
      {
        sections: structuredClone(sections),
        changedSectionNames: nextEntry.changedSectionNames,
      },
    ]);
    setSections(nextSections);
    setIsDirty(true);
    clearSelection();
    syncPreviewDomFromSections(nextSections, nextEntry.changedSectionNames);
  }, [redoStack, sections, project, clearSelection, syncPreviewDomFromSections]);

  // --- Save & Publish ---
  // Note: apiPatch swallows HTTP errors and returns the error body, so the
  // 409 STALE_WRITE conflict is detected on the returned object, not in catch.
  const performSave = useCallback(
    async (force = false) => {
      if (!selectedPage || !project || isSaving) return;
      // Flush any in-progress inline edit into sections FIRST, so a Save click
      // mid-typing persists the typed change instead of the pre-edit content
      // (the commit-on-blur is deferred and would otherwise lose the race).
      const flushed = flushCanvasTextEdit();
      if (flushed) handleApplyDirectEdit(flushed.operation, flushed.targetAlloroClass);
      const sectionsToSave = sectionsRef.current;
      setIsSaving(true);
      try {
        const res = await apiPatch({
          path: `/user/website/pages/${selectedPage.id}/save`,
          passedData: {
            sections: sectionsToSave,
            expected_updated_at: selectedPage.updated_at,
            force,
          },
        });
        if (res?.error === "STALE_WRITE") {
          setShowConflictModal(true);
          return;
        }
        if (!res?.success) {
          toast.error(res?.message || "Failed to save changes");
          return;
        }
        if (res?.data?.updated_at) {
          const savedAt = res.data.updated_at;
          setSelectedPage((prev) =>
            prev ? { ...prev, updated_at: savedAt, sections: sectionsToSave } : prev,
          );
          // Keep the pages list fresh too — reopening this page from the
          // Pages tab would otherwise regress expected_updated_at (spurious
          // 409 that trains "Save Anyway") and reload pre-save content.
          setPages((prev) =>
            prev.map((p) =>
              p.id === selectedPage.id
                ? { ...p, updated_at: savedAt, sections: sectionsToSave }
                : p,
            ),
          );
        }
        setIsDirty(false);
        clearBackup();
        toast.success("Changes saved & published");
      } catch {
        toast.error("Failed to save changes");
      } finally {
        setIsSaving(false);
      }
    },
    [selectedPage, project, isSaving, clearBackup, flushCanvasTextEdit, handleApplyDirectEdit],
  );

  const handleSave = useCallback(() => performSave(), [performSave]);
  const handleForceSave = useCallback(() => {
    setShowConflictModal(false);
    performSave(true);
  }, [performSave]);

  saveRef.current = handleSave;

  // --- Version preview ---
  const handlePreviewVersion = useCallback(
    async (version: PageVersion) => {
      if (!project || !selectedPage) return;
      try {
        const res = await apiGet({
          path: `/user/website/pages/${selectedPage.id}/versions/${version.id}`,
        });
        const versionData = res.data;
        const versionSections = normalizeSections(versionData.sections);
        const html = assemblePageHtml(
          project.wrapper || "{{slot}}",
          project.header || "",
          project.footer || "",
          versionSections,
          undefined,
          undefined,
          undefined,
          project.id,
        );
        setPreviewHtmlContent(html);
        setPreviewVersion(version);
        clearSelection();
      } catch {
        toast.error("Failed to load version preview");
      }
    },
    [project, selectedPage, clearSelection],
  );

  const handleExitPreview = useCallback(() => {
    setPreviewVersion(null);
    setPreviewHtmlContent("");
  }, []);

  const handleRestoreVersion = useCallback(
    async (versionId: string) => {
      if (!selectedPage) return;
      const res = await apiPost({
        path: `/user/website/pages/${selectedPage.id}/versions/${versionId}/restore`,
      });
      // apiPost swallows HTTP errors — a 403 READ_ONLY / 404 / 500 must not
      // toast "restored" and exit preview while the live site is unchanged.
      if (!res?.success) {
        toast.error(res?.message || "Failed to restore version");
        return;
      }
      setPreviewVersion(null);
      setPreviewHtmlContent("");
      toast.success("Version restored");
      await fetchWebsite();
    },
    [selectedPage],
  );

  // Current chat messages for selected element
  const currentChatMessages = selectedInfo
    ? chatMap.get(selectedInfo.alloroClass) || []
    : [];

  // --- Loading skeleton (matches the view being loaded) ---
  if (loading) {
    return <WebsiteLoadingSkeleton editor={activeView === "editor"} />;
  }

  if (status === "PREPARING") {
    return <PreparingState />;
  }

  if (status === "READ_ONLY") {
    return <ReadOnlyState />;
  }

  // Empty state — project exists but no pages yet
  if (status === "READY" && pages.length === 0) {
    return <EmptyState />;
  }

  const liveUrl =
    project?.custom_domain && project?.domain_verified_at
      ? `https://${project.custom_domain}`
      : project
        ? `https://${project.hostname}.sites.getalloro.com`
        : null;

  // Shared dashboard header (intro heading + pill tabs + site actions). Rendered
  // INSIDE each non-editor view's scroll area so it scrolls instead of sticking.
  const dashboardHeader = (
    <DashboardHeader
      project={project}
      liveUrl={liveUrl}
      activeView={activeView}
      onConnectDomain={() => setShowDomainModal(true)}
      setWebsiteTab={setWebsiteTab}
    />
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Editor toolbar — focused editing mode (reached from the Pages tab) */}
      {activeView === "editor" && (
        <EditorToolbar
          selectedPage={selectedPage}
          viewportMode={viewportMode}
          setViewportMode={setViewportMode}
          isDirty={isDirty}
          isSaving={isSaving}
          onSave={handleSave}
          setWebsiteTab={setWebsiteTab}
        />
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

      {/* Main Content */}
      {activeView === "overview" ? (
        <div className="flex-1 overflow-y-auto bg-alloro-bg">
          {dashboardHeader}
          <WebsiteOverview
            pageCount={pages.length}
            templateId={project?.template_id ?? null}
            onOpenTab={(tab) => setWebsiteTab(tab)}
          />
        </div>
      ) : activeView === "pages" ? (
        <div className="flex-1 overflow-y-auto bg-alloro-bg">
          {dashboardHeader}
          <WebsitePagesTab
            pages={pages}
            onOpenPage={(pageId) => {
              const target = pages.find((p) => p.id === pageId);
              if (target) setSelectedPage(target);
              setPreviewVersion(null);
              setPreviewHtmlContent("");
              setWebsiteTab("editor");
            }}
          />
        </div>
      ) : activeView === "submissions" ? (
        <div className="flex-1 overflow-y-auto bg-alloro-bg" data-wizard-target="website-submissions">
          {dashboardHeader}
          <div className="mx-auto w-full max-w-[960px] px-4 py-6 sm:px-6 lg:px-8">
          {project && (
            <>
              <FormSubmissionsTab
                projectId={project.id}
                fetchSubmissionsFn={userFetchSubmissions}
                fetchFormCatalogFn={userFetchFormCatalog}
                fetchRecipientsFn={userFetchRecipients}
                updateFormRecipientRuleFn={userUpdateFormRecipientRule}
                updateFormPreferencesFn={userUpdateFormPreferences}
                markAllReadFn={userMarkAllRead}
                formCatalogQueryScope="client"
                toggleReadFn={userToggleRead}
                deleteSubmissionFn={userDeleteSubmission}
                onExport={handleExportSubmissions}
                settingsContent={
                  <div className="space-y-5">
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h3 className="mb-3 text-sm font-semibold text-gray-900">
                        Default Recipients
                      </h3>
                      <RecipientsConfig
                        projectId={project.id}
                        fetchRecipientsFn={userFetchRecipients}
	                        updateRecipientsFn={userUpdateRecipients}
	                      />
	                    </div>
	                  </div>
	                }
	              />
            </>
          )}
          </div>
        </div>
      ) : activeView === "posts" ? (
        <div className="flex-1 overflow-y-auto bg-alloro-bg">
          {dashboardHeader}
          <div className="mx-auto w-full max-w-[960px] px-4 py-6 sm:px-6 lg:px-8">
          {project && project.template_id && (
            <PostsTab
              projectId={project.id}
              templateId={project.template_id}
              organizationId={project.organization_id || undefined}
              borderless
              fetchPostsFn={userFetchPosts}
              createPostFn={userCreatePost}
              updatePostFn={userUpdatePost}
              deletePostFn={userDeletePost}
              duplicatePostFn={userDuplicatePost}
              fetchPostTypesFn={userFetchPostTypes}
              fetchCategoriesFn={userFetchCategories}
              fetchTagsFn={userFetchTags}
              createCategoryFn={userCreateCategory}
              createTagFn={userCreateTag}
              updatePostSeoFn={userUpdatePostSeo}
            />
          )}
          </div>
        </div>
      ) : activeView === "menus" ? (
        <div className="flex-1 overflow-y-auto bg-alloro-bg">
          {dashboardHeader}
          <div className="mx-auto w-full max-w-[960px] px-4 py-6 sm:px-6 lg:px-8">
          {project && (
            <MenusTab
              projectId={project.id}
              templateId={project.template_id}
              borderless
              fetchMenusFn={userFetchMenus}
              fetchMenuFn={userFetchMenu}
              createMenuFn={userCreateMenu}
              updateMenuFn={userUpdateMenu}
              deleteMenuFn={userDeleteMenu}
              createMenuItemFn={userCreateMenuItem}
              updateMenuItemFn={userUpdateMenuItem}
              deleteMenuItemFn={userDeleteMenuItem}
              reorderMenuItemsFn={userReorderMenuItems}
              fetchPostsFn={userFetchPosts}
              fetchPostTypesFn={userFetchPostTypes}
            />
          )}
          </div>
        </div>
      ) : activeView === "keywords" ? (
        <div className="flex-1 overflow-y-auto bg-alloro-bg">
          {dashboardHeader}
          <KeywordsTab />
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden" data-wizard-target="website-editor">
          {/* Preview */}
          <div className="flex-1 flex flex-col relative">
            <div className="flex-1 overflow-hidden bg-gray-100 relative">
              {/* Loading overlay for page switching / shortcode resolution */}
              {isResolving && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-20 flex items-center justify-center">
                  <div className="flex items-center gap-2 bg-white rounded-xl shadow-lg px-4 py-3">
                    <Loader2 className="w-4 h-4 text-alloro-orange animate-spin" />
                    <span className="text-sm text-gray-600">Loading preview...</span>
                  </div>
                </div>
              )}
              {viewportMode === "desktop" ? (
                <>
                  <iframe
                    ref={iframeRef}
                    srcDoc={prepareHtmlForPreview(
                      previewVersion ? previewHtmlContent : resolvedHtmlContent,
                    )}
                    style={{
                      width: `${Math.round(100 / DESKTOP_SCALE)}%`,
                      height: `${Math.round(100 / DESKTOP_SCALE)}%`,
                      transform: `scale(${DESKTOP_SCALE})`,
                      transformOrigin: "top left",
                    }}
                    className="border-0"
                    title="Page Preview"
                    sandbox="allow-same-origin allow-scripts"
                    onLoad={previewVersion ? undefined : handleIframeLoad}
                  />
                  <div
                    className="absolute left-0 top-0 pointer-events-none"
                    style={{
                      width: `${Math.round(100 / DESKTOP_SCALE)}%`,
                      height: `${Math.round(100 / DESKTOP_SCALE)}%`,
                      transform: `scale(${DESKTOP_SCALE})`,
                      transformOrigin: "top left",
                    }}
                  >
                    <InlineEditorPopover
                      selectedInfo={previewVersion ? null : selectedInfo}
                      mediaApi={mediaApi}
                      isEditing={isEditing}
                      isCanvasTextEditing={isCanvasTextEditing}
                      onStartCanvasTextEdit={beginCanvasTextEditing}
                      onApplyDirectEdit={handleApplyDirectEdit}
                    />
                  </div>
                </>
              ) : (
                <div className="flex justify-center h-full py-4">
                  <div className="relative w-[375px] h-full bg-white rounded-2xl shadow-xl border border-gray-300 overflow-hidden">
                    <iframe
                      ref={iframeRef}
                      srcDoc={prepareHtmlForPreview(
                        previewVersion ? previewHtmlContent : resolvedHtmlContent,
                      )}
                      className="w-full h-full border-0"
                      title="Page Preview"
                      sandbox="allow-same-origin allow-scripts"
                      onLoad={previewVersion ? undefined : handleIframeLoad}
                    />
                    <div className="absolute inset-0 pointer-events-none">
                      <InlineEditorPopover
                        selectedInfo={previewVersion ? null : selectedInfo}
                        mediaApi={mediaApi}
                        isEditing={isEditing}
                        isCanvasTextEditing={isCanvasTextEditing}
                        onStartCanvasTextEdit={beginCanvasTextEditing}
                        onApplyDirectEdit={handleApplyDirectEdit}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Version preview overlay */}
            <AnimatePresence>
              {previewVersion && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-xl px-5 py-3 flex items-center gap-4 z-10"
                >
                  <div className="text-sm">
                    <p className="text-gray-700 font-medium">
                      Previewing v{previewVersion.version}
                    </p>
                    <p className="text-xs text-gray-400">
                      Editing is disabled in preview mode
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestoreVersion(previewVersion.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-alloro-orange text-white text-xs font-medium hover:bg-alloro-orange/90 transition-colors"
                  >
                    <RotateCcw size={12} />
                    Restore this version
                  </button>
                  <button
                    onClick={handleExitPreview}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Exit
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {!previewVersion && (
              <button
                type="button"
                onClick={() =>
                  document.dispatchEvent(new CustomEvent("alloro:open-support"))
                }
                className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-[10px] text-white backdrop-blur-sm transition-colors hover:bg-black/75"
              >
                Alloro editor is in beta — found a bug or need a change?{" "}
                <span className="font-semibold underline">Report it</span>
              </button>
            )}
          </div>

          {/* Editor Sidebar (no debug tab, with history tab) */}
          <EditorSidebar
            selectedInfo={previewVersion ? null : selectedInfo}
            chatMessages={currentChatMessages}
            onSendEdit={handleSendEdit}
            onApplyDirectEdit={handleApplyDirectEdit}
            onToggleHidden={handleToggleHidden}
            isEditing={isEditing}
            debugInfo={null}
            systemPrompt={null}
            mediaApi={mediaApi}
            showDebug={false}
            showHistory={true}
            historyPageId={selectedPage?.id || null}
            onPreviewVersion={handlePreviewVersion}
            onRestoreVersion={handleRestoreVersion}
            isPreviewingVersion={!!previewVersion}
            previewVersionId={previewVersion?.id || null}
            onExitPreview={handleExitPreview}
            externalAction={
              pendingSidebarAction !==
              ("__deferred__" as QuickActionType)
                ? pendingSidebarAction
                : null
            }
            onExternalActionHandled={() => setPendingSidebarAction(null)}
            primaryColor={project?.primary_color}
            accentColor={project?.accent_color}
            isCanvasTextEditing={isCanvasTextEditing}
            onLiveTextPreview={handleLiveTextPreview}
            onLiveTextRevert={handleLiveTextRevert}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={handleUndo}
            onRedo={handleRedo}
            editViewport={viewportMode}
          />
        </div>
      )}

      {/* Save Conflict Modal (409 STALE_WRITE) */}
      <ConfirmModal
        isOpen={showConflictModal}
        onClose={() => setShowConflictModal(false)}
        onConfirm={handleForceSave}
        title="Page Changed Elsewhere"
        message="This page was saved from somewhere else after you loaded it. Saving anyway overwrites that version (it stays in History). Keep editing to review first — your work is also backed up locally."
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
            setUndoStack((prev) => [
              ...prev,
              { sections: structuredClone(sectionsRef.current) },
            ]);
            setRedoStack([]);
            setSections(recoveryPrompt);
            rebuildHtml(recoveryPrompt);
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

      {/* Custom Domain Modal */}
      {project && (
        <ConnectDomainModal
          isOpen={showDomainModal}
          onClose={() => setShowDomainModal(false)}
          projectId={project.id}
          currentDomain={project.custom_domain}
          domainVerifiedAt={project.domain_verified_at}
          onDomainChange={fetchWebsite}
          onConnect={async (domain) => {
            const res = await apiPost({
              path: "/user/website/domain/connect",
              passedData: { domain },
            });
            return { server_ip: res.data.server_ip };
          }}
          onVerify={async () => {
            const res = await apiPost({
              path: "/user/website/domain/verify",
            });
            return res.data;
          }}
          onDisconnect={async () => {
            await apiDelete({ path: "/user/website/domain/disconnect" });
          }}
        />
      )}
    </div>
  );
}
