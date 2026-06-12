import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Sparkles,
  Link as LinkIcon,
  ExternalLink,
  ArrowLeft,
  Monitor,
  Smartphone,
  RotateCcw,
  Loader2,
  Save,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from "../api";
import { userWebsiteMediaApi } from "../api/websiteMedia";
import ConnectDomainModal from "../components/Admin/ConnectDomainModal";
import FormSubmissionsTab from "../components/Admin/FormSubmissionsTab";
import PostsTab from "../components/Admin/PostsTab";
import MenusTab from "../components/Admin/MenusTab";
import RecipientsConfig from "../components/Admin/RecipientsConfig";
import { WebsiteOverview } from "../components/website/overview/WebsiteOverview";
import { WebsitePagesTab } from "../components/website/WebsitePagesTab";
import { WebsiteLoadingSkeleton } from "../components/website/WebsiteLoadingSkeleton";
import {
  WebsiteDashboardTabs,
  type WebsiteDashboardView,
} from "../components/website/WebsiteDashboardTabs";
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
import { useSidebar } from "../components/Admin/SidebarContext";
import {
  useIsWizardActive,
  useWizardDemoData,
  useOnboardingWizard,
} from "../contexts/OnboardingWizardContext";

interface Page {
  id: string;
  path: string;
  status: string;
  sections: unknown;
  updated_at: string;
}

interface Project {
  id: string;
  hostname: string;
  display_name: string | null;
  status: string;
  is_read_only: boolean;
  custom_domain: string | null;
  domain_verified_at: string | null;
  wrapper: string;
  header: string;
  footer: string;
  template_id: string | null;
  organization_id: number | null;
  primary_color: string | null;
  accent_color: string | null;
}

const DESKTOP_SCALE = 0.7;
/** Window in which consecutive same-element text applies share one undo entry. */
const TEXT_UNDO_COALESCE_MS = 2500;
const WEBSITE_TABS = ["overview", "editor", "submissions", "posts", "menus", "pages"] as const;
type WebsiteTab = typeof WEBSITE_TABS[number];

type SectionHistoryEntry = {
  sections: Section[];
  changedSectionNames?: string[];
};

function parseWebsiteTab(value: string | null): WebsiteTab | null {
  return WEBSITE_TABS.includes(value as WebsiteTab)
    ? (value as WebsiteTab)
    : null;
}

function getWebsiteTabFromParams(searchParams: URLSearchParams): WebsiteTab {
  return (
    parseWebsiteTab(searchParams.get("tab")) ||
    parseWebsiteTab(searchParams.get("view")) ||
    "overview"
  );
}

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
    isCanvasTextEditing,
  } = useIframeSelector(iframeRef, handleIframeQuickAction, {
    sectionsOnly: true,
  });

  // User-facing API wrappers (routes don't need projectId — inferred from auth)
  const userFetchRecipients = async (_projectId: string) =>
    apiGet({ path: "/user/website/recipients" });

  const userUpdateRecipients = async (
    _projectId: string,
    recipients: string[],
  ) =>
    apiPut({
      path: "/user/website/recipients",
      passedData: { recipients },
    });

  const userFetchSubmissions = async (
    _projectId: string,
    page: number,
    limit: number,
    filter?: string,
    formName?: string,
  ) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filter) params.set("filter", filter);
    if (formName) params.set("formName", formName);
    return apiGet({
      path: `/user/website/form-submissions?${params}`,
    });
  };

  const userToggleRead = async (
    _projectId: string,
    submissionId: string,
    is_read: boolean,
  ) =>
    apiPatch({
      path: `/user/website/form-submissions/${submissionId}/read`,
      passedData: { is_read },
    });

  const userDeleteSubmission = async (
    _projectId: string,
    submissionId: string,
  ) =>
    apiDelete({
      path: `/user/website/form-submissions/${submissionId}`,
    });

  const userMarkAllRead = async (_projectId: string, formName?: string) => {
    void _projectId;
    return apiPatch({
      path: "/user/website/form-submissions/mark-all-read",
      passedData: { formName },
    });
  };

  const userFetchFormCatalog = async (_projectId: string) => {
    void _projectId;
    return apiGet({ path: "/user/website/forms/catalog" });
  };

  const userUpdateFormRecipientRule = async (
    _projectId: string,
    payload: {
      formName: string;
      recipients: string[];
      isEnabled: boolean;
    },
  ) => {
    void _projectId;
    return apiPut({
      path: "/user/website/forms/recipients",
      passedData: payload,
    });
  };

  const userUpdateFormPreferences = async (
    _projectId: string,
    payload: {
      preferences: Array<{
        formName: string;
        displayLabel: string | null;
        sortOrder: number;
      }>;
    },
  ) => {
    void _projectId;
    return apiPut({
      path: "/user/website/forms/preferences",
      passedData: payload,
    });
  };

  // User-facing API wrappers for Posts
  const userFetchPosts = async (_projectId: string, filters?: { post_type_id?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.post_type_id) params.set("post_type_id", filters.post_type_id);
    if (filters?.status) params.set("status", filters.status);
    const qs = params.toString() ? `?${params}` : "";
    return apiGet({ path: `/user/website/posts${qs}` });
  };

  const userCreatePost = async (_projectId: string, data: any) =>
    apiPost({ path: "/user/website/posts", passedData: data });

  const userUpdatePost = async (_projectId: string, postId: string, data: any) =>
    apiPatch({ path: `/user/website/posts/${postId}`, passedData: data });

  const userDeletePost = async (_projectId: string, postId: string) =>
    apiDelete({ path: `/user/website/posts/${postId}` });

  const userFetchPostTypes = async (_templateId: string) =>
    apiGet({ path: "/user/website/post-types" });

  const userFetchCategories = async (postTypeId: string) =>
    apiGet({ path: `/user/website/post-types/${postTypeId}/categories` });

  const userFetchTags = async (postTypeId: string) =>
    apiGet({ path: `/user/website/post-types/${postTypeId}/tags` });

  const userCreateCategory = async (postTypeId: string, data: any) =>
    apiPost({ path: `/user/website/post-types/${postTypeId}/categories`, passedData: data });

  const userCreateTag = async (postTypeId: string, data: any) =>
    apiPost({ path: `/user/website/post-types/${postTypeId}/tags`, passedData: data });

  const userUpdatePostSeo = async (_projectId: string, postId: string, data: any) =>
    apiPatch({ path: `/user/website/posts/${postId}/seo`, passedData: data });

  // User-facing API wrappers for Menus
  const userFetchMenus = async (_projectId: string) =>
    apiGet({ path: "/user/website/menus" });

  const userFetchMenu = async (_projectId: string, menuId: string) =>
    apiGet({ path: `/user/website/menus/${menuId}` });

  const userCreateMenu = async (_projectId: string, data: any) =>
    apiPost({ path: "/user/website/menus", passedData: data });

  const userUpdateMenu = async (_projectId: string, menuId: string, data: any) =>
    apiPatch({ path: `/user/website/menus/${menuId}`, passedData: data });

  const userDeleteMenu = async (_projectId: string, menuId: string) =>
    apiDelete({ path: `/user/website/menus/${menuId}` });

  const userCreateMenuItem = async (_projectId: string, menuId: string, data: any) =>
    apiPost({ path: `/user/website/menus/${menuId}/items`, passedData: data });

  const userUpdateMenuItem = async (_projectId: string, menuId: string, itemId: string, data: any) =>
    apiPatch({ path: `/user/website/menus/${menuId}/items/${itemId}`, passedData: data });

  const userDeleteMenuItem = async (_projectId: string, menuId: string, itemId: string) =>
    apiDelete({ path: `/user/website/menus/${menuId}/items/${itemId}` });

  const userReorderMenuItems = async (_projectId: string, menuId: string, items: any[]) =>
    apiPatch({ path: `/user/website/menus/${menuId}/items/reorder`, passedData: { items } });

  const handleExportSubmissions = async () => {
    try {
      const token =
        window.sessionStorage.getItem("token") ||
        localStorage.getItem("auth_token") ||
        localStorage.getItem("token");
      const apiBase = (import.meta as any)?.env?.VITE_API_URL ?? "/api";
      const response = await fetch(`${apiBase}/user/website/form-submissions/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        toast.error("Failed to export submissions");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "form-submissions.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export submissions");
    }
  };

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
    async (instruction: string, attachedMedia?: any[]) => {
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
        // No rebuildHtml here — the operation already mutated the iframe DOM
        // in place; re-setting srcDoc reloads the preview on every font-size
        // step / color change and jumps the scroll. Mark htmlContent stale so
        // remount boundaries rebuild from sections.
        htmlStaleRef.current = true;
        liveTextRef.current = null;
        setIsDirty(true);
        setupListeners();
        iframe.contentWindow?.scrollTo(scrollX, scrollY);
        if (!isOverride) setSelectedInfo(result.selectedInfo);
      } catch (err) {
        setEditError(err instanceof Error ? err.message : "Direct edit failed");
      }
    },
    [selectedInfo, setupListeners, setSelectedInfo],
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
        console.error("Failed to sync preview DOM:", err);
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
      setIsSaving(true);
      try {
        const res = await apiPatch({
          path: `/user/website/pages/${selectedPage.id}/save`,
          passedData: {
            sections,
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
            prev ? { ...prev, updated_at: savedAt, sections } : prev,
          );
          // Keep the pages list fresh too — reopening this page from the
          // Pages tab would otherwise regress expected_updated_at (spurious
          // 409 that trains "Save Anyway") and reload pre-save content.
          setPages((prev) =>
            prev.map((p) =>
              p.id === selectedPage.id
                ? { ...p, updated_at: savedAt, sections }
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
    [selectedPage, project, sections, isSaving, clearBackup],
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
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <div className="animate-spin w-12 h-12 border-4 border-alloro-orange border-t-transparent rounded-full mx-auto mb-4" />
          <h2 className="font-display text-xl font-medium text-alloro-navy mb-2">
            Your Website is Being Prepared
          </h2>
          <p className="text-gray-600">
            We're setting up your website. You'll receive an email when it's
            ready!
          </p>
        </div>
      </div>
    );
  }

  if (status === "READ_ONLY") {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="font-display text-xl font-medium text-alloro-navy mb-2">
            Website in Read-Only Mode
          </h2>
          <p className="text-gray-600 mb-4">
            Your subscription has been downgraded. Your website is still live
            but you cannot make edits.
          </p>
          <p className="text-sm text-gray-500">
            Contact your administrator to upgrade your plan and regain editing
            access.
          </p>
        </div>
      </div>
    );
  }

  // Empty state — project exists but no pages yet
  if (status === "READY" && pages.length === 0) {
    return (
      <div className="min-h-screen bg-alloro-bg font-body flex items-center justify-center py-16 px-6">
        <div className="max-w-xl w-full text-center">
          {/* Animated building blocks */}
          <div className="flex items-end justify-center gap-2 mb-8 h-20">
            <div className="w-5 rounded-t-md bg-alloro-orange/60 animate-[grow1_1.5s_ease-in-out_infinite]" />
            <div className="w-5 rounded-t-md bg-alloro-orange/80 animate-[grow2_1.5s_ease-in-out_infinite_0.2s]" />
            <div className="w-5 rounded-t-md bg-alloro-orange animate-[grow3_1.5s_ease-in-out_infinite_0.4s]" />
            <div className="w-5 rounded-t-md bg-alloro-orange/80 animate-[grow2_1.5s_ease-in-out_infinite_0.6s]" />
            <div className="w-5 rounded-t-md bg-alloro-orange/60 animate-[grow1_1.5s_ease-in-out_infinite_0.8s]" />
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-alloro-orange/10 rounded-full mb-4">
            <Sparkles className="w-4 h-4 text-alloro-orange" />
            <span className="text-xs font-bold text-alloro-orange uppercase tracking-wider">
              Almost There
            </span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-medium text-alloro-navy tracking-tight mb-3">
            Your Website is Being Built
          </h1>
          <p className="text-base text-slate-500 font-medium max-w-md mx-auto">
            Your project has been created and Alloro is setting up your pages.
            You'll be able to edit them here once they're ready.
          </p>
        </div>

        <style>{`
          @keyframes grow1 {
            0%, 100% { height: 24px; }
            50% { height: 56px; }
          }
          @keyframes grow2 {
            0%, 100% { height: 32px; }
            50% { height: 72px; }
          }
          @keyframes grow3 {
            0%, 100% { height: 40px; }
            50% { height: 80px; }
          }
        `}</style>
      </div>
    );
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
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-8 sm:px-6 lg:px-8 lg:pt-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-navy/45">
            Web presence
          </div>
          <h1 className="font-display text-[28px] font-medium tracking-tight text-alloro-navy">
            Website
          </h1>
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-alloro-navy/55">
            Traffic, leads, posts, and pages — manage it all in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDomainModal(true)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              project?.custom_domain && project?.domain_verified_at
                ? "bg-green-50 text-green-700 hover:bg-green-100"
                : project?.custom_domain
                  ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "bg-alloro-orange/10 text-alloro-orange hover:bg-alloro-orange/20"
            }`}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            {project?.custom_domain || "Connect Domain"}
          </button>
          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-soft bg-white px-3 py-1.5 text-xs font-semibold text-alloro-navy/70 transition-colors hover:text-alloro-orange"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Live
            </a>
          )}
        </div>
      </div>
      <div className="mt-6">
        <WebsiteDashboardTabs
          activeView={activeView as WebsiteDashboardView}
          hasPosts={!!project?.template_id}
          onViewChange={(v) => setWebsiteTab(v)}
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Editor toolbar — focused editing mode (reached from the Pages tab) */}
      {activeView === "editor" && (
        <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
          <button
            type="button"
            onClick={() => setWebsiteTab("pages")}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-alloro-navy"
          >
            <ArrowLeft size={15} />
            Back to pages
          </button>
          {selectedPage && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-400">Editing</span>
              <span className="font-semibold text-gray-800">
                {selectedPage.path === "/" ? "Home" : selectedPage.path}
              </span>
            </div>
          )}
          <div className="flex-1" />
          <div className="flex items-center rounded-lg bg-gray-100 p-0.5">
            <button
              onClick={() => setViewportMode("desktop")}
              className={`rounded-md p-1.5 transition-colors ${
                viewportMode === "desktop"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
              title="Desktop view"
            >
              <Monitor size={13} />
            </button>
            <button
              onClick={() => setViewportMode("mobile")}
              className={`rounded-md p-1.5 transition-colors ${
                viewportMode === "mobile"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
              title="Mobile view"
            >
              <Smartphone size={13} />
            </button>
          </div>
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-alloro-orange px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-alloro-orange/20 transition-colors hover:bg-alloro-orange/90 disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {isSaving ? "Saving..." : "Save & Publish"}
            </button>
          )}
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
          <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
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
          <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
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
          <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
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

            {viewportMode === "desktop" && !previewVersion && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[10px] px-3 py-1 rounded-full backdrop-blur-sm">
                Preview scaled to fit — use View Live for full size
              </div>
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
