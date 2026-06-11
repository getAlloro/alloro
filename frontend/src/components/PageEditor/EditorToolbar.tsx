import { useState } from "react";
import { ArrowLeft, Undo2, Redo2, Save, Upload, Monitor, Tablet, Smartphone, Loader2, Code, BarChart3, Sparkles, ChevronDown, Replace } from "lucide-react";

type EditorView = "visual" | "code" | "seo";

interface EditorToolbarProps {
  pagePath: string;
  pageVersion: number;
  pageStatus: string;
  device: "desktop" | "tablet" | "mobile";
  onDeviceChange: (device: "desktop" | "tablet" | "mobile") => void;
  activeView: EditorView;
  onViewChange: (view: EditorView) => void;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onSaveWithNote?: (note: string) => void;
  onPublish: () => void;
  onRegenerate?: () => void;
  onFindReplace?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  isDirty: boolean;
}

export default function EditorToolbar({
  pagePath,
  pageVersion,
  pageStatus,
  device,
  onDeviceChange,
  activeView,
  onViewChange,
  onBack,
  onUndo,
  onRedo,
  onSave,
  onSaveWithNote,
  onPublish,
  onRegenerate,
  onFindReplace,
  canUndo,
  canRedo,
  isSaving,
  isPublishing,
  isDirty,
}: EditorToolbarProps) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState("");

  const submitNote = () => {
    if (!onSaveWithNote) return;
    onSaveWithNote(noteText.trim());
    setNoteText("");
    setShowNoteInput(false);
  };

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shrink-0">
      {/* Left: Back + page info */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-xs text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Back
        </button>
        <div className="w-px h-4 bg-gray-200" />
        <span className="text-xs font-medium text-gray-700">{pagePath}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
          v{pageVersion}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            pageStatus === "published"
              ? "bg-green-50 text-green-600 border border-green-200"
              : pageStatus === "draft"
                ? "bg-amber-50 text-amber-600 border border-amber-200"
                : "bg-gray-50 text-gray-500 border border-gray-200"
          }`}
        >
          {pageStatus}
        </span>
        {isDirty && (
          <span className="text-[10px] text-gray-400">Unsaved changes</span>
        )}
      </div>

      {/* Center: Device switcher + Code + SEO tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        {/* Device icons — grouped */}
        {(
          [
            { key: "desktop", icon: Monitor, title: "Desktop (100%)" },
            { key: "tablet", icon: Tablet, title: "Tablet (768px)" },
            { key: "mobile", icon: Smartphone, title: "Mobile (375px)" },
          ] as const
        ).map(({ key, icon: Icon, title }) => (
          <button
            key={key}
            onClick={() => { onViewChange("visual"); onDeviceChange(key); }}
            className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
              activeView === "visual" && device === key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
            title={title}
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}

        <div className="w-px h-4 bg-gray-300 mx-0.5" />

        {/* Code tab */}
        <button
          onClick={() => onViewChange(activeView === "code" ? "visual" : "code")}
          className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
            activeView === "code"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-400 hover:text-gray-600"
          }`}
          title="Code editor"
        >
          <Code className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-gray-300 mx-0.5" />

        {/* SEO tab */}
        <button
          onClick={() => onViewChange(activeView === "seo" ? "visual" : "seo")}
          className={`px-2.5 py-1 rounded-md text-xs transition-colors flex items-center gap-1 ${
            activeView === "seo"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-400 hover:text-gray-600"
          }`}
          title="SEO panel"
        >
          <BarChart3 className="w-4 h-4" />
          <span className="text-[10px] font-bold">SEO</span>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
          title="Undo last edit (Cmd+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
          Undo
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
          title="Redo (Shift+Cmd+Z)"
        >
          <Redo2 className="w-3.5 h-3.5" />
          Redo
        </button>

        {onFindReplace && (
          <button
            onClick={onFindReplace}
            title="Find & replace across all pages"
            className="px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors flex items-center gap-1"
          >
            <Replace className="w-3.5 h-3.5" />
          </button>
        )}

        {onRegenerate && (
          <button
            onClick={onRegenerate}
            title="Regenerate a section with AI"
            className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Regenerate
          </button>
        )}

        <div className="relative flex items-center">
          <button
            onClick={onSave}
            disabled={isSaving || !isDirty}
            className="px-3 py-1.5 rounded-l-lg text-xs border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {isSaving ? "Saving..." : "Save"}
          </button>
          {onSaveWithNote && (
            <button
              onClick={() => setShowNoteInput((prev) => !prev)}
              disabled={isSaving || !isDirty}
              title="Save with a note"
              aria-label="Save with a note"
              className="px-1.5 py-1.5 rounded-r-lg text-xs border border-l-0 border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}

          {showNoteInput && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex items-center gap-1.5 w-72">
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNote();
                  if (e.key === "Escape") setShowNoteInput(false);
                }}
                placeholder="What changed? (optional)"
                maxLength={255}
                autoFocus
                className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-alloro-orange"
              />
              <button
                onClick={submitNote}
                className="text-xs px-2 py-1.5 rounded-md bg-alloro-orange text-white hover:bg-alloro-orange/90 transition-colors"
              >
                Save
              </button>
            </div>
          )}
        </div>

        <button
          onClick={onPublish}
          disabled={isPublishing}
          className="px-3 py-1.5 rounded-lg text-xs bg-alloro-orange text-white hover:bg-alloro-orange/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 shadow-sm shadow-alloro-orange/20"
        >
          {isPublishing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          {isPublishing ? "Publishing..." : "Publish"}
        </button>
      </div>
    </div>
  );
}
