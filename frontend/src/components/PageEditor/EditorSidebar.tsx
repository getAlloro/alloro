import { useState } from "react";
import type { SelectedInfo } from "../../hooks/useIframeSelector";
import type { QuickActionType } from "../../hooks/useIframeSelector";
import type { EditDebugInfo } from "../../api/websites";
import type { DirectEditorOperation } from "../../utils/editorDirectOperations";
import ChatPanel from "./ChatPanel";
import DebugPanel from "./DebugPanel";
import SelectedElementEditorPanel from "./SelectedElementEditorPanel";
import VersionHistoryTab from "./VersionHistoryTab";
import type { PageVersion } from "./VersionHistoryTab";
import type { SectionDiffEntry } from "../../utils/sectionDiff";
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
  /** Override the version list source (defaults to the user-website endpoint). */
  fetchVersions?: (pageId: string) => Promise<PageVersion[]>;
  /** Allow restoring published rows too (admin restores into the draft). */
  allowRestorePublished?: boolean;
  /** Per-section diff vs the current draft for the previewed version. */
  previewDiff?: SectionDiffEntry[] | null;
  /** Restore a single section from the previewed version into the draft. */
  onRestoreSection?: (name: string) => void;
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
  /** True while an in-canvas text session is active (sidebar must not steal focus). */
  isCanvasTextEditing?: boolean;
  /** Mirror sidebar typing into the preview element (visual only). */
  onLiveTextPreview?: (value: string) => void;
  /** Revert an unapplied live preview. */
  onLiveTextRevert?: () => void;
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
  fetchVersions,
  allowRestorePublished = false,
  previewDiff,
  onRestoreSection,
  isPreviewingVersion = false,
  previewVersionId,
  onExitPreview,
  primaryColor,
  accentColor,
  isCanvasTextEditing = false,
  onLiveTextPreview,
  onLiveTextRevert,
}: EditorSidebarProps) {
  const [tab, setTab] = useState<"chat" | "debug" | "history">("chat");

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

      {selectedInfo && (
        <SelectedElementEditorPanel
          selectedInfo={selectedInfo}
          isEditing={isEditing}
          mediaApi={mediaApi}
          externalAction={externalAction}
          onExternalActionHandled={onExternalActionHandled}
          onApplyDirectEdit={onApplyDirectEdit}
          onToggleHidden={onToggleHidden}
          isCanvasTextEditing={isCanvasTextEditing}
          onLiveTextPreview={onLiveTextPreview}
          onLiveTextRevert={onLiveTextRevert}
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
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
          fetchVersions={fetchVersions}
          allowRestorePublished={allowRestorePublished}
          previewDiff={previewDiff}
          onRestoreSection={onRestoreSection}
        />
      ) : (
        <DebugPanel debugInfo={debugInfo} selectedInfo={selectedInfo} systemPrompt={systemPrompt} />
      )}
    </div>
  );
}
