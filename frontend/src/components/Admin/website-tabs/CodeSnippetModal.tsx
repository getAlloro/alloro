import { useState, useEffect } from "react";
import { X, Loader2, Save } from "lucide-react";
import Editor from "@monaco-editor/react";
import {
  type CodeSnippet,
  type CodeSnippetLocation,
  type CreateCodeSnippetRequest,
  createTemplateCodeSnippet,
  updateTemplateCodeSnippet,
  createProjectCodeSnippet,
  updateProjectCodeSnippet,
} from "../../../api/codeSnippets";
import type { WebsitePage } from "../../../api/websites";
import { getErrorMessage } from "../../../lib/errorMessage";

interface CodeSnippetModalProps {
  templateId?: string;
  projectId?: string;
  snippet?: CodeSnippet;
  onSuccess: () => void;
  onClose: () => void;
  pages?: WebsitePage[];
}

const LOCATION_OPTIONS: { value: CodeSnippetLocation; label: string; description: string }[] = [
  {
    value: "head_start",
    label: "Head Start",
    description: "Injected right after <head> (analytics, meta tags)",
  },
  {
    value: "head_end",
    label: "Head End",
    description: "Injected right before </head> (CSS, late-loading scripts)",
  },
  {
    value: "body_start",
    label: "Body Start",
    description: "Injected right after <body> (immediate scripts, GTM)",
  },
  {
    value: "body_end",
    label: "Body End",
    description: "Injected right before </body> (deferred scripts, widgets)",
  },
];

export default function CodeSnippetModal({
  templateId,
  projectId,
  snippet,
  onSuccess,
  onClose,
  pages,
}: CodeSnippetModalProps) {
  const [name, setName] = useState(snippet?.name || "");
  const [location, setLocation] = useState<CodeSnippetLocation>(snippet?.location || "head_end");
  const [code, setCode] = useState(snippet?.code || "");
  const [pageIds, setPageIds] = useState<string[]>(snippet?.page_ids || []);
  const [applyToAllPages, setApplyToAllPages] = useState((snippet?.page_ids?.length || 0) === 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid =
    name.trim().length > 0 &&
    code.trim().length > 0 &&
    (applyToAllPages || pageIds.length > 0);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isValid) return;

    setSaving(true);
    setError(null);

    try {
      const data: CreateCodeSnippetRequest = {
        name,
        location,
        code,
        page_ids: applyToAllPages ? [] : pageIds,
      };

      if (snippet) {
        // Update existing snippet
        if (templateId) {
          await updateTemplateCodeSnippet(templateId, snippet.id, data);
        } else if (projectId) {
          await updateProjectCodeSnippet(projectId, snippet.id, data);
        }
      } else {
        // Create new snippet
        if (templateId) {
          await createTemplateCodeSnippet(templateId, data);
        } else if (projectId) {
          await createProjectCodeSnippet(projectId, data);
        }
      }

      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to save code snippet");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
          <h2 className="text-xl font-bold text-alloro-textDark">
            {snippet ? "Edit Code Snippet" : "Create Code Snippet"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-black/5 rounded-lg transition-colors text-black/40 hover:text-alloro-textDark"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-semibold text-alloro-textDark mb-2">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., GBP Tracking"
                maxLength={255}
                className="w-full px-4 py-2.5 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange transition-all"
                autoFocus
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-semibold text-alloro-textDark mb-2">
                Injection Location *
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as CodeSnippetLocation)}
                className="w-full px-4 py-2.5 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange transition-all appearance-none bg-white cursor-pointer"
              >
                {LOCATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} — {option.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Page Targeting */}
            <div>
              <label className="block text-sm font-semibold text-alloro-textDark mb-2">
                Target Pages
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="applyToAllPages"
                  checked={applyToAllPages}
                  onChange={(e) => {
                    setApplyToAllPages(e.target.checked);
                    if (e.target.checked) {
                      setPageIds([]);
                    }
                  }}
                  className="w-4 h-4 text-alloro-orange border-black/20 rounded focus:ring-alloro-orange/20 cursor-pointer"
                />
                <label
                  htmlFor="applyToAllPages"
                  className="text-sm text-black/60 cursor-pointer"
                >
                  Apply to all pages
                </label>
              </div>
              {!applyToAllPages && (
                <>
                  <div className="mt-3 border border-black/10 rounded-lg max-h-48 overflow-y-auto">
                    {pages && pages.length > 0 ? (
                      pages.map((page) => (
                        <label
                          key={page.id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-black/5 cursor-pointer transition-colors border-b border-black/5 last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={pageIds.includes(page.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPageIds([...pageIds, page.id]);
                              } else {
                                setPageIds(pageIds.filter(id => id !== page.id));
                              }
                            }}
                            className="w-4 h-4 text-alloro-orange border-black/20 rounded focus:ring-alloro-orange/20 cursor-pointer"
                          />
                          <span className="text-sm text-black/80 font-medium">{page.path}</span>
                        </label>
                      ))
                    ) : (
                      <p className="px-4 py-3 text-xs text-black/40">No pages available</p>
                    )}
                  </div>
                  {pageIds.length === 0 && (
                    <p className="mt-2 text-xs text-red-500">
                      Please select at least one page or check "Apply to all pages"
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Code Editor */}
            <div>
              <label className="block text-sm font-semibold text-alloro-textDark mb-2">
                Code *
              </label>
              <div className="border border-black/10 rounded-lg overflow-hidden">
                <Editor
                  height="400px"
                  language="html"
                  value={code}
                  onChange={(value) => setCode(value || "")}
                  theme="vs-light"
                  options={{
                    minimap: { enabled: false },
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    tabSize: 2,
                    wordWrap: "on",
                    automaticLayout: true,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-black/40">
                Press Cmd+S (Mac) or Ctrl+S (Windows) to save
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-black/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-black/60 hover:text-alloro-textDark transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-alloro-orange hover:bg-alloro-orange/90 disabled:bg-black/10 disabled:text-black/30 text-white font-semibold rounded-lg transition-all disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Snippet
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
