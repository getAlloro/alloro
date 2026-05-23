import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Save, Monitor, Tablet, Smartphone, Code } from "lucide-react";
import Editor from "@monaco-editor/react";
import {
  fetchWebsiteDetail,
  updateWebsite,
  editLayoutComponent,
  fetchEditorSystemPrompt,
} from "../../api/websites";
import { createAdminWebsiteMediaApi } from "../../api/websiteMedia";
import type { WebsiteProject, EditDebugInfo } from "../../api/websites";
import {
  useIframeSelector,
  prepareHtmlForPreview,
} from "../../hooks/useIframeSelector";
import type { QuickActionPayload, QuickActionType } from "../../hooks/useIframeSelector";
import { replaceComponentInDom, validateHtml } from "../../utils/htmlReplacer";
import {
  applyDirectEditorOperation,
  type DirectEditorOperation,
} from "../../utils/editorDirectOperations";
import { AdminTopBar } from "../../components/Admin/AdminTopBar";
import { AdminSidebar } from "../../components/Admin/AdminSidebar";
import { LoadingIndicator } from "../../components/Admin/LoadingIndicator";
import { SidebarProvider } from "../../components/Admin/SidebarContext";
import EditorSidebar from "../../components/PageEditor/EditorSidebar";
import InlineEditorPopover from "../../components/PageEditor/InlineEditorPopover";
import type { ChatMessage } from "../../components/PageEditor/ChatPanel";

type LayoutField = "wrapper" | "header" | "footer";

function isValidField(value: string | undefined): value is LayoutField {
  return value === "wrapper" || value === "header" || value === "footer";
}

function LayoutEditorInner() {
  const { id: projectId, field: rawField } = useParams<{
    id: string;
    field: string;
  }>();
  const navigate = useNavigate();
  const field = isValidField(rawField) ? rawField : null;
  const isVisualMode = field === "header" || field === "footer";

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mediaApi = useMemo(
    () => (projectId ? createAdminWebsiteMediaApi(projectId) : undefined),
    [projectId],
  );

  // Project state
  const [project, setProject] = useState<WebsiteProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Content state
  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Device preview
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  // Code view toggle (header/footer visual mode)
  const [codeView, setCodeView] = useState(false);

  // Visual editor state (header/footer only)
  const [previewHtml, setPreviewHtml] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [lastDebugInfo, setLastDebugInfo] = useState<EditDebugInfo | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [chatMap, setChatMap] = useState<Map<string, ChatMessage[]>>(new Map());

  // Quick action triggered from iframe label icons
  const [pendingSidebarAction, setPendingSidebarAction] = useState<QuickActionType | null>(null);
  const deferredEditRef = useRef<DirectEditorOperation | null>(null);
  const handleIframeQuickAction = useCallback((payload: QuickActionPayload) => {
    if ((payload.action === "text" || payload.action === "link") && payload.value) {
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

  // Selector hook (only active for header/footer)
  const {
    selectedInfo,
    setSelectedInfo,
    setupListeners,
    beginCanvasTextEditing,
    isCanvasTextEditing,
  } =
    useIframeSelector(iframeRef, handleIframeQuickAction);

  // --- Load project data ---
  useEffect(() => {
    if (!projectId || !field) return;

    // Trigger loading indicator
    window.dispatchEvent(new Event('navigation-start'));

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchWebsiteDetail(projectId);
        const proj = response.data;
        setProject(proj);

        const fieldContent = proj[field] || "";
        setContent(fieldContent);

        // Build preview HTML for header/footer (wrapped in project wrapper for styling)
        if (field !== "wrapper") {
          const wrapper = proj.wrapper || "{{slot}}";
          if (!wrapper.includes("{{slot}}")) {
            setError(
              "The project wrapper is missing the {{slot}} placeholder. " +
              "Edit the Wrapper first and add {{slot}} where content should be injected."
            );
            setLoading(false);
            window.dispatchEvent(new Event('navigation-complete'));
            return;
          }
          const html = wrapper.replace(
            "{{slot}}",
            `<div data-layout-content="true">${fieldContent}</div>`
          );
          setPreviewHtml(html);
        }
      } catch (err) {
        console.error("Failed to load project:", err);
        setError(err instanceof Error ? err.message : "Failed to load project");
      } finally {
        setLoading(false);
        // Manually complete loading indicator
        window.dispatchEvent(new Event('navigation-complete'));
      }
    };

    load();
  }, [projectId, field]);

  // --- Fetch system prompt for debug tab ---
  useEffect(() => {
    if (!isVisualMode) return;
    fetchEditorSystemPrompt()
      .then(setSystemPrompt)
      .catch((err) => console.error("Failed to load system prompt:", err));
  }, [isVisualMode]);

  // --- Handle iframe load ---
  const handleIframeLoad = useCallback(() => {
    setupListeners();
  }, [setupListeners]);

  // --- Save handler ---
  const handleSave = useCallback(async () => {
    if (!projectId || !field || isSaving) return;

    try {
      setIsSaving(true);
      await updateWebsite(projectId, { [field]: content });
      setIsDirty(false);
      setProject((prev) => (prev ? { ...prev, [field]: content } : prev));
    } catch (err) {
      console.error("Save failed:", err);
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [projectId, field, content, isSaving]);

  // --- Handle AI edit (header/footer only) ---
  const handleSendEdit = useCallback(
    async (instruction: string, attachedMedia?: any[]) => {
      if (!projectId || !field || !selectedInfo || !isVisualMode) return;

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

        const result = await editLayoutComponent(projectId, {
          alloroClass,
          currentHtml: selectedInfo.outerHtml,
          instruction: enrichedInstruction, // Send enriched instruction to API
          chatHistory,
        });

        setLastDebugInfo(result.debug ?? null);

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
          throw new Error(`Invalid HTML from edit: ${validation.error}`);
        }

        // Mutate the iframe DOM
        const iframe = iframeRef.current;
        if (iframe?.contentDocument) {
          replaceComponentInDom(
            iframe.contentDocument,
            alloroClass,
            result.editedHtml!
          );

          // Extract updated layout content from the marker div
          const marker = iframe.contentDocument.querySelector("[data-layout-content]");
          if (marker) {
            const updatedContent = marker.innerHTML;
            setContent(updatedContent);
            setIsDirty(true);
          }

          setupListeners();

          // Refresh selectedInfo with fresh outerHTML
          const freshEl = iframe.contentDocument.querySelector(`.${CSS.escape(alloroClass)}`);
          if (freshEl && selectedInfo) {
            setSelectedInfo({
              ...selectedInfo,
              outerHtml: freshEl.outerHTML,
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
        const errorMessage = err instanceof Error ? err.message : "Edit failed";
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
    [projectId, field, selectedInfo, setSelectedInfo, chatMap, isVisualMode, setupListeners]
  );

  const handleApplyDirectEdit = useCallback(
    (operation: DirectEditorOperation) => {
      if (!selectedInfo || !isVisualMode) return;

      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!doc) return;

      const selectedElement = doc.querySelector(
        `.${CSS.escape(selectedInfo.alloroClass)}`,
      );
      if (selectedElement && !selectedElement.closest("[data-layout-content]")) {
        setEditError("Only header/footer content can be edited here. Wrapper edits stay in code view.");
        return;
      }

      try {
        setEditError(null);
        const scrollY = iframe.contentWindow?.scrollY || 0;
        const scrollX = iframe.contentWindow?.scrollX || 0;
        const result = applyDirectEditorOperation(doc, selectedInfo, operation);
        if (!result.changed) {
          setSelectedInfo(result.selectedInfo);
          return;
        }
        const marker = doc.querySelector("[data-layout-content]");

        if (marker) {
          setContent(marker.innerHTML);
          setIsDirty(true);
        }

        setupListeners();
        iframe.contentWindow?.scrollTo(scrollX, scrollY);
        setSelectedInfo(result.selectedInfo);
      } catch (err) {
        setEditError(err instanceof Error ? err.message : "Direct edit failed");
      }
    },
    [selectedInfo, isVisualMode, setupListeners, setSelectedInfo],
  );

  // Process deferred quick-action edits from iframe input panel
  useEffect(() => {
    if (deferredEditRef.current && pendingSidebarAction === ("__deferred__" as QuickActionType)) {
      const operation = deferredEditRef.current;
      deferredEditRef.current = null;
      setPendingSidebarAction(null);
      handleApplyDirectEdit(operation);
    }
  }, [pendingSidebarAction, handleApplyDirectEdit]);

  // Toggle hidden handler
  const handleToggleHidden = useCallback(() => {
    handleApplyDirectEdit({ type: "toggle-hidden" });
  }, [handleApplyDirectEdit]);

  // --- Code view toggle for header/footer ---
  const handleCodeViewChange = useCallback(
    (active: boolean) => {
      if (!active && codeView && project) {
        // Leaving code view: rebuild preview HTML from updated content
        const wrapper = project.wrapper || "{{slot}}";
        const html = wrapper.replace(
          "{{slot}}",
          `<div data-layout-content="true">${content}</div>`
        );
        setPreviewHtml(html);
      }
      setCodeView(active);
    },
    [codeView, content, project]
  );

  // Current chat messages for selected element
  const currentChatMessages = selectedInfo
    ? chatMap.get(selectedInfo.alloroClass) || []
    : [];

  // --- Invalid field ---
  if (!field) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminTopBar />
        <div className="flex items-center justify-center" style={{ height: "calc(100vh - 4rem)" }}>
          <p className="text-sm text-red-500">Invalid layout field. Use wrapper, header, or footer.</p>
        </div>
      </div>
    );
  }

  // --- Loading ---
  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
        {/* Topbar loading indicator */}
        <LoadingIndicator />
        <AdminTopBar />
        <AdminSidebar />

        {/* Loading skeleton that matches layout editor structure */}
        <div className="flex-1 flex overflow-hidden ml-[72px]">
          {/* Left editor panel skeleton */}
          <div className="w-1/2 bg-white border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
              <div className="flex gap-2">
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </div>
            <div className="flex-1 p-4 space-y-2">
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3"></div>
            </div>
          </div>

          {/* Right preview panel skeleton */}
          <div className="flex-1 bg-gray-100 p-4 flex items-center justify-center">
            <div className="w-full h-full max-w-6xl bg-white rounded-xl shadow-lg border border-gray-200 animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  // --- Error ---
  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminTopBar />
        <div className="flex items-center justify-center" style={{ height: "calc(100vh - 4rem)" }}>
          <div className="text-center">
            <p className="text-sm text-red-500 mb-4">{error || "Project not found"}</p>
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
      <LoadingIndicator />
      <AdminTopBar />

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link
            to={`/admin/websites/${projectId}`}
            className="text-xs text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </Link>
          <div className="w-px h-4 bg-gray-200" />
          <span className="text-xs font-medium text-gray-700 capitalize">{field}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
            layout
          </span>
          {isDirty && (
            <span className="text-[10px] text-gray-400">Unsaved changes</span>
          )}
        </div>
        {/* Center: Device switcher + code toggle (header/footer only) */}
        {isVisualMode && (
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(
              [
                { key: "desktop", icon: Monitor, title: "Desktop (100%)" },
                { key: "tablet", icon: Tablet, title: "Tablet (768px)" },
                { key: "mobile", icon: Smartphone, title: "Mobile (375px)" },
              ] as const
            ).map(({ key, icon: Icon, title }) => (
              <button
                key={key}
                onClick={() => { setCodeView(false); setDevice(key); }}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                  !codeView && device === key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title={title}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
            <div className="w-px h-4 bg-gray-300 mx-0.5" />
            <button
              onClick={() => handleCodeViewChange(!codeView)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                codeView
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
              title="Code editor"
            >
              <Code className="w-4 h-4" />
            </button>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {isSaving ? "Saving..." : "Save"}
        </button>
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

      {/* Content area */}
      {isVisualMode ? (
        /* Header/Footer: iframe preview + AI sidebar (or code editor) */
        <div className="flex-1 flex overflow-hidden">
          {codeView ? (
            /* Code editor + live preview side by side */
            <>
              <div className="flex-1 overflow-hidden">
                <Editor
                  height="100%"
                  defaultLanguage="html"
                  value={content}
                  onChange={(v) => {
                    setContent(v || "");
                    setIsDirty(true);
                  }}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    padding: { top: 12 },
                  }}
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
              {/* Iframe preview */}
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
                  <iframe
                    ref={iframeRef}
                    srcDoc={prepareHtmlForPreview(previewHtml)}
                    sandbox="allow-same-origin allow-scripts"
                    onLoad={handleIframeLoad}
                    className="w-full h-full border-0 bg-white"
                  />
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
                </div>
              </div>

              {/* AI Editor sidebar */}
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
              />
            </>
          )}
        </div>
      ) : (
        /* Wrapper: Monaco code editor only */
        <div className="flex-1 overflow-hidden">
          <Editor
            height="100%"
            defaultLanguage="html"
            value={content}
            onChange={(v) => {
              setContent(v || "");
              setIsDirty(true);
            }}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              padding: { top: 12 },
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function LayoutEditor() {
  return (
    <SidebarProvider defaultCollapsed>
      <LayoutEditorInner />
    </SidebarProvider>
  );
}
