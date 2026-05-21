import { useState, useRef, useEffect } from "react";
import { Pencil, ImagePlus, Link, Eye, EyeOff, Minus, Plus } from "lucide-react";
import type { SelectedInfo } from "../../hooks/useIframeSelector";
import type { QuickActionType } from "../../hooks/useIframeSelector";
import type { EditDebugInfo } from "../../api/websites";
import {
  getDirectOperationAvailability,
  getSelectedTextValue,
  type DirectEditorOperation,
} from "../../utils/editorDirectOperations";
import ChatPanel from "./ChatPanel";
import DebugPanel from "./DebugPanel";
import MediaBrowser from "./MediaBrowser";
import VersionHistoryTab from "./VersionHistoryTab";
import type { PageVersion } from "./VersionHistoryTab";
import type { MediaApi, MediaItem } from "./MediaBrowser";
import type { ChatMessage } from "./ChatPanel";

export type EditorSidebarProps = {
  selectedInfo: SelectedInfo | null;
  chatMessages: ChatMessage[];
  onSendEdit: (instruction: string, attachedMedia?: MediaItem[]) => void;
  onApplyDirectEdit: (operation: DirectEditorOperation) => void;
  onToggleHidden?: () => void;
  isEditing: boolean;
  debugInfo: EditDebugInfo | null;
  systemPrompt: string | null;
  mediaApi?: MediaApi;
  /** Triggered from iframe label action icons — opens the corresponding sidebar quick action. */
  externalAction?: QuickActionType | null;
  onExternalActionHandled?: () => void;
  /** Hide the Debug tab (default: true). */
  showDebug?: boolean;
  /** Show the History tab (default: false). */
  showHistory?: boolean;
  /** Page ID for version history. */
  historyPageId?: string | null;
  /** Callback when user clicks Preview on a version. */
  onPreviewVersion?: (version: PageVersion) => void;
  /** Callback when user clicks Restore on a version. */
  onRestoreVersion?: (versionId: string) => Promise<void>;
  /** Whether the editor is in version preview mode. */
  isPreviewingVersion?: boolean;
  /** ID of the version being previewed. */
  previewVersionId?: string | null;
  /** Callback to exit preview mode. */
  onExitPreview?: () => void;
  /** Project primary color for color picker. */
  primaryColor?: string | null;
  /** Project accent color for color picker. */
  accentColor?: string | null;
};

export default function EditorSidebar({
  selectedInfo,
  chatMessages,
  onSendEdit,
  onApplyDirectEdit,
  onToggleHidden,
  isEditing,
  debugInfo,
  systemPrompt,
  mediaApi,
  externalAction,
  onExternalActionHandled,
  showDebug = true,
  showHistory = false,
  historyPageId,
  onPreviewVersion,
  onRestoreVersion,
  isPreviewingVersion = false,
  previewVersionId,
  onExitPreview,
  primaryColor,
  accentColor,
}: EditorSidebarProps) {
  const [tab, setTab] = useState<"chat" | "debug" | "history">("chat");
  const [activeAction, setActiveAction] = useState<"text" | "link" | "media" | null>(null);
  const [actionInput, setActionInput] = useState("");
  const actionInputRef = useRef<HTMLInputElement>(null);

  // Handle external action triggered from iframe label icons
  useEffect(() => {
    if (!externalAction) return;

    if (externalAction === "hide" || externalAction === "text-up" || externalAction === "text-down") {
      if (externalAction === "hide") {
        onApplyDirectEdit({ type: "toggle-hidden" });
      } else {
        onApplyDirectEdit({
          type: "step-font-size",
          direction: externalAction === "text-up" ? "up" : "down",
        });
      }
    } else {
      if (externalAction === "link") {
        setActionInput(selectedInfo?.href || "");
      } else if (externalAction === "text") {
        setActionInput(getSelectedTextValue(selectedInfo));
      } else {
        setActionInput("");
      }
      setActiveAction(externalAction);
    }
    onExternalActionHandled?.();
  }, [externalAction, onApplyDirectEdit, onExternalActionHandled, selectedInfo, selectedInfo?.href]);

  // Focus input when action opens
  useEffect(() => {
    if (activeAction === "text" || activeAction === "link") {
      setTimeout(() => actionInputRef.current?.focus(), 50);
    }
  }, [activeAction]);

  const {
    canEditText,
    canChangeMedia,
    canChangeLink,
    canAdjustTextSize,
  } = getDirectOperationAvailability(selectedInfo, Boolean(mediaApi));

  // Put the direct text control in front of people instead of burying it behind chat.
  useEffect(() => {
    if (canEditText) {
      setActiveAction("text");
      setActionInput(getSelectedTextValue(selectedInfo));
      return;
    }

    setActiveAction(null);
    setActionInput("");
  }, [canEditText, selectedInfo, selectedInfo?.alloroClass, selectedInfo?.outerHtml]);

  const handleTextSubmit = () => {
    const trimmed = actionInput.trim();
    if (!trimmed) return;
    onApplyDirectEdit({ type: "replace-text", value: trimmed });
    setActiveAction(null);
    setActionInput("");
  };

  const handleLinkSubmit = () => {
    const trimmed = actionInput.trim();
    if (!trimmed) return;
    onApplyDirectEdit({ type: "update-link", href: trimmed });
    setActiveAction(null);
    setActionInput("");
  };

  const handleMediaSelect = (media: MediaItem) => {
    onApplyDirectEdit({ type: "replace-media", media });
    setActiveAction(null);
  };

  const handleActionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeAction === "text") handleTextSubmit();
      if (activeAction === "link") handleLinkSubmit();
    }
    if (e.key === "Escape") {
      setActiveAction(null);
      setActionInput("");
    }
  };

  const openTextAction = () => {
    setActiveAction("text");
    setActionInput(getSelectedTextValue(selectedInfo));
  };

  const openLinkAction = () => {
    setActiveAction("link");
    setActionInput(selectedInfo?.href || "");
  };

  const openMediaAction = () => {
    setActiveAction(activeAction === "media" ? null : "media");
  };

  const handleToggleVisibility = () => {
    if (onToggleHidden) {
      onToggleHidden();
      return;
    }
    onApplyDirectEdit({ type: "toggle-hidden" });
  };

  return (
    <div className="w-[380px] shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Header with tabs */}
      <div className="px-4 pt-3 pb-0 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setTab("chat")}
            className={`pb-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${
              tab === "chat"
                ? "text-alloro-orange border-alloro-orange"
                : "text-gray-400 border-transparent hover:text-gray-600"
            }`}
          >
            Chat
          </button>
          {showDebug && (
            <button
              onClick={() => setTab("debug")}
              className={`pb-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                tab === "debug"
                  ? "text-alloro-orange border-alloro-orange"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              Debug
            </button>
          )}
          {showHistory && (
            <button
              onClick={() => setTab("history")}
              className={`pb-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                tab === "history"
                  ? "text-alloro-orange border-alloro-orange"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              History
            </button>
          )}
        </div>
      </div>

      {/* Selected element info bar with quick actions */}
      {selectedInfo && (
        <div className="border-b border-gray-100 bg-gray-50">
          <div className="px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                  selectedInfo.type === "section" ? "bg-purple-500" : "bg-blue-500"
                }`}
              />
              <span className="text-xs text-gray-700 font-semibold">
                {selectedInfo.friendlyName}
              </span>
              {selectedInfo.isHidden && (
                <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium shrink-0">
                  Hidden
                </span>
              )}
            </div>

            {/* Quick action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              {canEditText && (
                <button
                  onClick={openTextAction}
                  disabled={isEditing}
                  title="Edit text"
                  className={`p-1.5 rounded transition-colors disabled:opacity-30 ${
                    activeAction === "text"
                      ? "text-alloro-orange bg-orange-50"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  }`}
                  aria-label="Edit text"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {canAdjustTextSize && (
                <>
                  <button
                    onClick={() =>
                      onApplyDirectEdit({ type: "step-font-size", direction: "down" })
                    }
                    disabled={isEditing}
                    title="Decrease text size"
                    aria-label="Decrease text size"
                    className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-30"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      onApplyDirectEdit({ type: "step-font-size", direction: "up" })
                    }
                    disabled={isEditing}
                    title="Increase text size"
                    aria-label="Increase text size"
                    className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-30"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {canChangeMedia && (
                <button
                  onClick={openMediaAction}
                  disabled={isEditing}
                  title="Change image"
                  className={`p-1.5 rounded transition-colors disabled:opacity-30 ${
                    activeAction === "media"
                      ? "text-alloro-orange bg-orange-50"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  }`}
                  aria-label="Change media"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                </button>
              )}
              {canChangeLink && (
                <button
                  onClick={openLinkAction}
                  disabled={isEditing}
                  title="Change link"
                  className={`p-1.5 rounded transition-colors disabled:opacity-30 ${
                    activeAction === "link"
                      ? "text-alloro-orange bg-orange-50"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  }`}
                  aria-label="Change link"
                >
                  <Link className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={handleToggleVisibility}
                title={selectedInfo.isHidden ? "Unhide element" : "Hide element"}
                aria-label={selectedInfo.isHidden ? "Unhide element" : "Hide element"}
                className={`p-1.5 rounded transition-colors ${
                  selectedInfo.isHidden
                    ? "text-amber-600 bg-amber-50 hover:bg-amber-100"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                }`}
              >
                {selectedInfo.isHidden ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Inline text input */}
          {activeAction === "text" && (
            <div className="px-4 pb-2">
              <div className="flex items-center gap-1.5">
                <input
                  ref={actionInputRef}
                  type="text"
                  value={actionInput}
                  onChange={(e) => setActionInput(e.target.value)}
                  onKeyDown={handleActionKeyDown}
                  placeholder="Enter new text..."
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-alloro-orange focus:ring-1 focus:ring-alloro-orange/20"
                />
                <button
                  onClick={handleTextSubmit}
                  disabled={!actionInput.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-alloro-orange text-white text-xs font-medium hover:bg-alloro-orange/90 transition-colors disabled:opacity-30"
                >
                  Apply
                </button>
              </div>
            </div>
          )}

          {/* Inline link input */}
          {activeAction === "link" && (
            <div className="px-4 pb-2">
              <div className="flex items-center gap-1.5">
                <input
                  ref={actionInputRef}
                  type="text"
                  value={actionInput}
                  onChange={(e) => setActionInput(e.target.value)}
                  onKeyDown={handleActionKeyDown}
                  placeholder="Enter URL..."
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-alloro-orange focus:ring-1 focus:ring-alloro-orange/20"
                />
                <button
                  onClick={handleLinkSubmit}
                  disabled={!actionInput.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-alloro-orange text-white text-xs font-medium hover:bg-alloro-orange/90 transition-colors disabled:opacity-30"
                >
                  Apply
                </button>
              </div>
            </div>
          )}

          {/* Floating media browser */}
          {activeAction === "media" && mediaApi && (
            <div className="px-4 pb-2">
              <MediaBrowser
                mediaApi={mediaApi}
                onSelect={handleMediaSelect}
                onClose={() => setActiveAction(null)}
              />
            </div>
          )}
        </div>
      )}

      {tab === "chat" ? (
        selectedInfo ? (
          <ChatPanel
            messages={chatMessages}
            onSend={onSendEdit}
            isLoading={isEditing}
            disabled={isPreviewingVersion}
            mediaApi={mediaApi}
            primaryColor={primaryColor}
            accentColor={accentColor}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-2">
                Click on a section or component to start editing.
              </p>
              <p className="text-xs text-gray-300">
                Hover to preview selectable elements.
              </p>
            </div>
          </div>
        )
      ) : tab === "history" ? (
        <VersionHistoryTab
          pageId={historyPageId || null}
          onPreview={onPreviewVersion || (() => {})}
          onRestore={onRestoreVersion || (async () => {})}
          isPreviewMode={isPreviewingVersion}
          previewVersionId={previewVersionId || null}
          onExitPreview={onExitPreview || (() => {})}
        />
      ) : (
        <DebugPanel debugInfo={debugInfo} selectedInfo={selectedInfo} systemPrompt={systemPrompt} />
      )}
    </div>
  );
}
