import { Plus, Loader2, X, Globe, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { ActionButton } from "../../../ui/DesignSystem";
import { type MindSource } from "../../../../api/minds";

interface SourcesSectionProps {
  sources: MindSource[];
  loadingSources: boolean;
  showAddSource: boolean;
  setShowAddSource: (value: boolean) => void;
  newSourceUrl: string;
  setNewSourceUrl: (value: string) => void;
  newSourceName: string;
  setNewSourceName: (value: string) => void;
  addingSource: boolean;
  handleAddSource: () => void;
  handleToggleSource: (sourceId: string, currentlyActive: boolean) => void;
  handleDeleteSource: (sourceId: string) => void;
}

export function SourcesSection({
  sources,
  loadingSources,
  showAddSource,
  setShowAddSource,
  newSourceUrl,
  setNewSourceUrl,
  newSourceName,
  setNewSourceName,
  addingSource,
  handleAddSource,
  handleToggleSource,
  handleDeleteSource,
}: SourcesSectionProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Sources</h3>
        <ActionButton
          label="Add Source"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setShowAddSource(true)}
          variant="secondary"
          size="sm"
        />
      </div>

      {showAddSource && (
        <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-600">New Source</span>
            <button
              onClick={() => setShowAddSource(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={newSourceUrl}
              onChange={(e) => setNewSourceUrl(e.target.value)}
              placeholder="https://example.com/blog"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange"
            />
            <input
              type="text"
              value={newSourceName}
              onChange={(e) => setNewSourceName(e.target.value)}
              placeholder="Name (optional)"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange"
            />
            <div className="flex justify-end">
              <ActionButton
                label="Add"
                onClick={handleAddSource}
                variant="primary"
                size="sm"
                disabled={!newSourceUrl.trim()}
                loading={addingSource}
              />
            </div>
          </div>
        </div>
      )}

      {loadingSources ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : sources.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          No sources added yet.
        </p>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="text-sm text-gray-800 truncate">
                    {source.name || source.url}
                  </span>
                  {!source.is_active && (
                    <span className="text-[10px] font-medium text-gray-400 uppercase">
                      inactive
                    </span>
                  )}
                </div>
                {source.name && (
                  <p className="text-xs text-gray-400 truncate mt-0.5 ml-5.5">
                    {source.url}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-3">
                <button
                  onClick={() => handleToggleSource(source.id, source.is_active)}
                  className="text-gray-400 hover:text-gray-600"
                  title={source.is_active ? "Deactivate" : "Activate"}
                >
                  {source.is_active ? (
                    <ToggleRight className="h-5 w-5 text-green-500" />
                  ) : (
                    <ToggleLeft className="h-5 w-5" />
                  )}
                </button>
                <button
                  onClick={() => handleDeleteSource(source.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
