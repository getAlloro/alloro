import {
  ArrowLeft,
  Monitor,
  Smartphone,
  Loader2,
  Save,
} from "lucide-react";
import type { Page } from "../dfyWebsite.types";
import type { WebsiteTab } from "../dfyWebsite.utils";

interface EditorToolbarProps {
  selectedPage: Page | null;
  viewportMode: "desktop" | "mobile";
  setViewportMode: (mode: "desktop" | "mobile") => void;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  setWebsiteTab: (tab: WebsiteTab) => void;
}

export function EditorToolbar({
  selectedPage,
  viewportMode,
  setViewportMode,
  isDirty,
  isSaving,
  onSave,
  setWebsiteTab,
}: EditorToolbarProps) {
  return (
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
          onClick={onSave}
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
  );
}
