import { useState } from "react";
import { Sparkles, ChevronDown, Undo2, Redo2 } from "lucide-react";
import type { SelectedInfo } from "../../hooks/useIframeSelector";
import type { QuickActionType } from "../../hooks/useIframeSelector";
import type { EditDebugInfo } from "../../api/websites";
import type { DirectEditorOperation, EditViewport } from "../../utils/editorDirectOperations";
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
  /** Whether an undo action is available. */
  canUndo?: boolean;
  /** Whether a redo action is available. */
  canRedo?: boolean;
  /** Undo the latest editor change. */
  onUndo?: () => void;
  /** Redo the latest undone editor change. */
  onRedo?: () => void;
  /** Active preview breakpoint — size/alignment/visibility edits target it. */
  editViewport?: EditViewport;
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
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  editViewport = "desktop",
}: EditorSidebarProps) {
  const [tab, setTab] = useState<"edit" | "debug" | "history">("edit");
  const [aiOpen, setAiOpen] = useState(false);

  const tabClass = (active: boolean) =>
    `pb-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${
      active
        ? "text-alloro-orange border-alloro-orange"
        : "text-gray-400 border-transparent hover:text-gray-600"
    }`;

  return (
    <div className="editor-cobalt w-[380px] shrink-0 bg-[var(--ec-base)] border-l border-[color:var(--ec-border)] flex flex-col overflow-hidden">
      {/* Header with tabs */}
      <div className="px-4 pt-3 pb-0 border-b border-gray-200">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <button onClick={() => setTab("edit")} className={tabClass(tab === "edit")}>
              Edit
            </button>
            {showHistory && (
              <button onClick={() => setTab("history")} className={tabClass(tab === "history")}>
                History
              </button>
            )}
            {showDebug && (
              <button onClick={() => setTab("debug")} className={tabClass(tab === "debug")}>
                Debug
              </button>
            )}
          </div>
          {(onUndo || onRedo) && (
            <div className="mb-2 flex items-center gap-1">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200/60 text-gray-400 transition-colors hover:border-gray-300 hover:bg-gray-100/40 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Undo"
                title="Undo"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200/60 text-gray-400 transition-colors hover:border-gray-300 hover:bg-gray-100/40 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Redo"
                title="Redo"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {tab === "edit" ? (
        selectedInfo ? (
          <div className="flex flex-1 min-h-0 flex-col">
            {/* Direct controls — primary surface, scrolls independently */}
            <div className="flex-1 min-h-0 overflow-y-auto">
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
                editViewport={editViewport}
              />
              <p className="px-5 py-4 text-[11px] leading-5 text-gray-400">
                Tip: click text on the page to type directly. Changes preview live —
                Save when you're happy.
              </p>
            </div>

            {/* AI editor — demoted into a collapsible dropdown */}
            <div className="border-t border-gray-200">
              <button
                onClick={() => setAiOpen((open) => !open)}
                aria-expanded={aiOpen}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-100/40"
              >
                <span className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <Sparkles className="h-3.5 w-3.5 text-alloro-orange" />
                  AI Editor
                  <span className="font-normal text-gray-400">
                    — Tell Alloro what to change
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform ${aiOpen ? "rotate-180" : ""}`}
                />
              </button>
              {aiOpen && (
                <div className="flex h-[340px] min-h-0 flex-col border-t border-gray-100">
                  <ChatPanel
                    messages={chatMessages}
                    onSend={onSendEdit}
                    isLoading={isEditing}
                    disabled={isPreviewingVersion}
                    selectionLabel={selectedInfo.friendlyName}
                    mediaApi={mediaApi}
                    primaryColor={primaryColor}
                    accentColor={accentColor}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-2">
                Click an element on the page to edit it.
              </p>
              <p className="text-xs text-gray-300">
                Text, photos, color and links — edit directly on the page.
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
