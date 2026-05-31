import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Sparkles,
  Inbox,
  Monitor,
  Smartphone,
  Undo2,
  Redo2,
  RotateCcw,
  FileText,
  Menu as MenuIcon,
  Pencil,
  Loader2,
  Save,
  LayoutGrid,
  Files,
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
const WEBSITE_TABS = ["overview", "editor", "submissions", "posts", "menus", "pages"] as const;
type WebsiteTab = typeof WEBSITE_TABS[number];

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
  const [undoStack, setUndoStack] = useState<Section[][]>([]);
  const [redoStack, setRedoStack] = useState<Section[][]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingSidebarAction, setPendingSidebarAction] =
    useState<QuickActionType | null>(null);

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
  const deferredEditRef = useRef<DirectEditorOperation | null>(null);
  // Tracks the page whose editor HTML is already assembled, so re-entering the
  // editor tab (e.g. from the overview) doesn't rebuild and clobber unsaved edits.
  const assembledPageIdRef = useRef<string | null>(null);

  // Collapse the sidebar only while the page editor is open; expand it for the
  // overview and every other (non-editor) view. Restore on unmount.
  useEffect(() => {
    setCollapsed(activeView === "editor");
    return () => setCollapsed(false);
  }, [activeView, setCollapsed]);

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
      setHtmlContent(html);
    },
    [project],
  );

  // Quick action handler from iframe label icons
  const handleIframeQuickAction = useCallback(
    (payload: QuickActionPayload) => {
      if (
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
  } = useIframeSelector(iframeRef, handleIframeQuickAction);

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
    if (assembledPageIdRef.current === selectedPage.id) return;
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
    setHtmlContent(html);

    // Reset editor state for new page
    setChatMap(new Map());
    setUndoStack([]);
    setRedoStack([]);
    setEditError(null);
    setIsDirty(false);
  }, [selectedPage, project, activeView]);

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
          setSelectedPage(data.pages[0]);
        }
      }
    } catch (error) {
      toast.error("Failed to load website");
    } finally {
      setLoading(false);
    }
  };

  // --- Handle iframe load: set up selector listeners ---
  const handleIframeLoad = useCallback(() => {
    setupListeners();
  }, [setupListeners]);

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

          setUndoStack((prev) => [...prev, structuredClone(sections)]);
          setRedoStack([]);

          const iframe = iframeRef.current;
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
            rebuildHtml(updatedSections);
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
    (operation: DirectEditorOperation) => {
      if (!selectedInfo) return;

      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!doc) return;

      const selectedElement = doc.querySelector(
        `.${CSS.escape(selectedInfo.alloroClass)}`,
      );
      if (selectedElement && !selectedElement.closest("[data-alloro-section]")) {
        setEditError("Header/footer components can't be edited from the page editor.");
        return;
      }

      try {
        setEditError(null);
        const scrollY = iframe.contentWindow?.scrollY || 0;
        const scrollX = iframe.contentWindow?.scrollX || 0;
        const previousSections = structuredClone(sectionsRef.current);

        const result = applyDirectEditorOperation(doc, selectedInfo, operation);
        if (!result.changed) {
          setSelectedInfo(result.selectedInfo);
          return;
        }
        const updatedSections = extractSectionsFromDom(
          doc,
          sectionsRef.current,
        );

        setUndoStack((prev) => [...prev, previousSections]);
        setRedoStack([]);
        setSections(updatedSections);
        rebuildHtml(updatedSections);
        setIsDirty(true);
        setupListeners();
        iframe.contentWindow?.scrollTo(scrollX, scrollY);
        setSelectedInfo(result.selectedInfo);
      } catch (err) {
        setEditError(err instanceof Error ? err.message : "Direct edit failed");
      }
    },
    [selectedInfo, rebuildHtml, setupListeners, setSelectedInfo],
  );

  // Process deferred quick-action edits from iframe input panel
  useEffect(() => {
    if (
      deferredEditRef.current &&
      pendingSidebarAction === ("__deferred__" as QuickActionType)
    ) {
      const operation = deferredEditRef.current;
      deferredEditRef.current = null;
      setPendingSidebarAction(null);
      handleApplyDirectEdit(operation);
    }
  }, [pendingSidebarAction, handleApplyDirectEdit]);

  // --- Toggle hidden ---
  const handleToggleHidden = useCallback(() => {
    handleApplyDirectEdit({ type: "toggle-hidden" });
  }, [handleApplyDirectEdit]);

  // --- Undo ---
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !project) return;

    const previousSections = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, structuredClone(sections)]);
    setSections(previousSections);
    setIsDirty(true);

    const html = assemblePageHtml(
      project.wrapper || "{{slot}}",
      project.header || "",
      project.footer || "",
      previousSections,
      undefined,
      undefined,
      undefined,
      project.id,
    );
    setHtmlContent(html);
    clearSelection();
  }, [undoStack, sections, project, clearSelection]);

  // --- Redo ---
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !project) return;

    const nextSections = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, structuredClone(sections)]);
    setSections(nextSections);
    setIsDirty(true);

    const html = assemblePageHtml(
      project.wrapper || "{{slot}}",
      project.header || "",
      project.footer || "",
      nextSections,
      undefined,
      undefined,
      undefined,
      project.id,
    );
    setHtmlContent(html);
    clearSelection();
  }, [redoStack, sections, project, clearSelection]);

  // --- Save & Publish ---
  const handleSave = useCallback(async () => {
    if (!selectedPage || !project || isSaving) return;
    setIsSaving(true);
    try {
      await apiPatch({
        path: `/user/website/pages/${selectedPage.id}/save`,
        passedData: { sections },
      });
      setIsDirty(false);
      toast.success("Changes saved & published");
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  }, [selectedPage, project, sections, isSaving]);

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
      await apiPost({
        path: `/user/website/pages/${selectedPage.id}/versions/${versionId}/restore`,
      });
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
    const isEditorView = activeView === "editor";
    return (
      <div className="flex flex-col h-screen bg-alloro-bg animate-pulse">
        <div className="bg-white border-b border-black/5 px-4 py-3 flex items-center gap-4">
          <div className="h-6 w-32 bg-slate-200 rounded" />
          <div className="flex gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-8 w-20 bg-slate-100 rounded-lg" />
            ))}
          </div>
        </div>
        {isEditorView ? (
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 p-6">
              <div className="h-full bg-slate-100 rounded-2xl" />
            </div>
            <div className="w-96 bg-white border-l border-black/5 p-4 space-y-4">
              <div className="h-6 w-24 bg-slate-200 rounded" />
              <div className="h-4 w-48 bg-slate-100 rounded" />
              <div className="mt-8 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-4 bg-slate-100 rounded"
                    style={{ width: `${80 - i * 15}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="mx-auto w-full max-w-[1320px] space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
              <div className="space-y-2">
                <div className="h-7 w-64 bg-slate-200 rounded" />
                <div className="h-4 w-80 bg-slate-100 rounded" />
              </div>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                <div className="h-72 rounded-[14px] border border-black/5 bg-white xl:col-span-2" />
                <div className="h-72 rounded-[14px] border border-black/5 bg-white" />
                <div className="h-40 rounded-[14px] border border-black/5 bg-white" />
                <div className="h-40 rounded-[14px] border border-black/5 bg-white" />
                <div className="h-40 rounded-[14px] border border-black/5 bg-white" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
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

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-0 flex items-center gap-0">
        {/* Animated View Tabs */}
        <nav className="flex items-center shrink-0">
          {(
            [
              { key: "overview", icon: LayoutGrid, label: "Overview" },
              { key: "editor", icon: Pencil, label: "Editor" },
              { key: "submissions", icon: Inbox, label: "Submissions" },
              ...(project?.template_id
                ? [{ key: "posts" as const, icon: FileText, label: "Posts" }]
                : []),
              { key: "menus", icon: MenuIcon, label: "Menus" },
              { key: "pages", icon: Files, label: "Pages" },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeView === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setWebsiteTab(tab.key)}
                className={`relative px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  isActive ? "text-alloro-orange" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon size={13} />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-2 right-2 h-[2px] bg-alloro-orange rounded-full"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Viewport toggle — slides in when on editor tab */}
        <AnimatePresence>
          {activeView === "editor" && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden flex items-center ml-1"
            >
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5 shrink-0">
                <button
                  onClick={() => setViewportMode("desktop")}
                  className={`p-1.5 rounded-md transition-colors ${
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
                  className={`p-1.5 rounded-md transition-colors ${
                    viewportMode === "mobile"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                  title="Mobile view"
                >
                  <Smartphone size={13} />
                </button>
              </div>

              {/* Undo / Redo */}
              {(undoStack.length > 0 || redoStack.length > 0) && (
                <div className="flex items-center gap-0.5 ml-1">
                  <button
                    onClick={handleUndo}
                    disabled={undoStack.length === 0}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Undo"
                  >
                    <Undo2 size={13} />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={redoStack.length === 0}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Redo"
                  >
                    <Redo2 size={13} />
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right section: save, usage, domain, view live */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Save button — only visible when dirty */}
          <AnimatePresence>
            {isDirty && activeView === "editor" && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-alloro-orange text-white hover:bg-alloro-orange/90 transition-colors disabled:opacity-60 shadow-sm shadow-alloro-orange/20"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {isSaving ? "Saving..." : "Save & Publish"}
              </motion.button>
            )}
          </AnimatePresence>

        </div>
      </div>

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
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <WebsiteOverview
            pageCount={pages.length}
            templateId={project?.template_id ?? null}
            liveUrl={liveUrl}
            customDomain={project?.custom_domain ?? null}
            domainVerified={!!project?.domain_verified_at}
            onConnectDomain={() => setShowDomainModal(true)}
            onOpenTab={(tab) => setWebsiteTab(tab)}
          />
        </div>
      ) : activeView === "pages" ? (
        <div className="flex-1 overflow-y-auto bg-gray-50">
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6" data-wizard-target="website-submissions">
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
      ) : activeView === "posts" ? (
        <div className="flex-1 overflow-y-auto">
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
      ) : activeView === "menus" ? (
        <div className="flex-1 overflow-y-auto">
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
                    onLoad={handleIframeLoad}
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
                      onLoad={handleIframeLoad}
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
          />
        </div>
      )}

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
