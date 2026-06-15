import { useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd";
import { GripVertical, Plus, Pencil, Trash2 } from "lucide-react";
import {
  type CodeSnippet,
  type CodeSnippetLocation,
  deleteTemplateCodeSnippet,
  toggleTemplateCodeSnippet,
  reorderTemplateCodeSnippets,
  deleteProjectCodeSnippet,
  toggleProjectCodeSnippet,
  reorderProjectCodeSnippets,
} from "../../api/codeSnippets";
import { Badge, ActionButton } from "../ui/DesignSystem";
import CodeSnippetModal from "./CodeSnippetModal";
import type { WebsitePage } from "../../api/websites";
import { logger } from "../../lib/logger";

interface CodeManagerTabProps {
  templateId?: string;
  codeSnippets: CodeSnippet[];
  onSnippetsChange: () => void;
  isProject?: boolean;
  projectId?: string;
  pages?: WebsitePage[];
}

interface LocationSection {
  id: CodeSnippetLocation;
  label: string;
  color: string;
}

const LOCATIONS: LocationSection[] = [
  {
    id: "head_start",
    label: "HEAD START",
    color: "text-blue-600",
  },
  {
    id: "head_end",
    label: "HEAD END",
    color: "text-indigo-600",
  },
  {
    id: "body_start",
    label: "BODY START",
    color: "text-green-600",
  },
  {
    id: "body_end",
    label: "BODY END",
    color: "text-purple-600",
  },
];

export default function CodeManagerTab({
  templateId,
  codeSnippets,
  onSnippetsChange,
  isProject = false,
  projectId,
  pages,
}: CodeManagerTabProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<CodeSnippet | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const getSnippetsByLocation = (location: CodeSnippetLocation) => {
    return codeSnippets
      .filter((s) => s.location === location)
      .sort((a, b) => a.order_index - b.order_index);
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const location = result.source.droppableId as CodeSnippetLocation;
    const snippetsInLocation = getSnippetsByLocation(location);

    // Reorder locally
    const [movedSnippet] = snippetsInLocation.splice(result.source.index, 1);
    snippetsInLocation.splice(result.destination.index, 0, movedSnippet);

    const snippetIds = snippetsInLocation.map((s) => s.id);

    try {
      if (isProject && projectId) {
        await reorderProjectCodeSnippets(projectId, snippetIds);
      } else if (templateId) {
        await reorderTemplateCodeSnippets(templateId, snippetIds);
      }
      onSnippetsChange();
    } catch (error) {
      logger.error("Failed to reorder snippets:", error);
    }
  };

  const handleToggle = async (snippetId: string) => {
    try {
      if (isProject && projectId) {
        await toggleProjectCodeSnippet(projectId, snippetId);
      } else if (templateId) {
        await toggleTemplateCodeSnippet(templateId, snippetId);
      }
      onSnippetsChange();
    } catch (error) {
      logger.error("Failed to toggle snippet:", error);
    }
  };

  const handleDelete = async (snippetId: string) => {
    if (deletingId !== snippetId) {
      setDeletingId(snippetId);
      return;
    }

    try {
      if (isProject && projectId) {
        await deleteProjectCodeSnippet(projectId, snippetId);
      } else if (templateId) {
        await deleteTemplateCodeSnippet(templateId, snippetId);
      }
      setDeletingId(null);
      onSnippetsChange();
    } catch (error) {
      logger.error("Failed to delete snippet:", error);
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-end">
        <ActionButton
          label="Create Snippet"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setIsCreating(true)}
          variant="primary"
        />
      </div>

      {/* Snippets by location */}
      <DragDropContext onDragEnd={handleDragEnd}>
        {LOCATIONS.map((location) => {
          const snippets = getSnippetsByLocation(location.id);

          return (
            <div
              key={location.id}
              className="border border-black/10 rounded-xl overflow-hidden bg-white"
            >
              {/* Location header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${location.color}`}
                  >
                    {location.label}
                  </span>
                  <span className="text-xs text-black/40">
                    ({snippets.length} {snippets.length === 1 ? "snippet" : "snippets"})
                  </span>
                </div>
              </div>

              {/* Snippets list */}
              <Droppable droppableId={location.id}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="min-h-[60px]"
                  >
                    {snippets.length === 0 ? (
                      <div className="flex items-center justify-center py-8 text-sm text-black/30">
                        No snippets in this location
                      </div>
                    ) : (
                      snippets.map((snippet, index) => (
                        <Draggable
                          key={snippet.id}
                          draggableId={snippet.id}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`flex items-center gap-3 px-4 py-3 border-b border-black/5 hover:bg-black/[0.02] transition-colors ${
                                snapshot.isDragging ? "shadow-lg bg-white" : ""
                              }`}
                            >
                              {/* Drag handle */}
                              <div
                                {...provided.dragHandleProps}
                                className="cursor-grab active:cursor-grabbing text-black/20 hover:text-black/40"
                              >
                                <GripVertical className="w-4 h-4" />
                              </div>

                              {/* Snippet info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold text-sm text-alloro-textDark truncate">
                                    {snippet.name}
                                  </span>
                                  {!snippet.is_enabled && (
                                    <Badge label="Disabled" variant="gray" />
                                  )}
                                </div>
                                <div className="text-xs text-black/40">
                                  {snippet.page_ids.length === 0
                                    ? "All pages"
                                    : `${snippet.page_ids.length} page${
                                        snippet.page_ids.length === 1 ? "" : "s"
                                      }`}
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-2">
                                {/* Toggle switch */}
                                <button
                                  onClick={() => handleToggle(snippet.id)}
                                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                    snippet.is_enabled
                                      ? "bg-alloro-orange"
                                      : "bg-black/10"
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                      snippet.is_enabled
                                        ? "translate-x-5"
                                        : "translate-x-0.5"
                                    }`}
                                  />
                                </button>

                                {/* Edit button */}
                                <button
                                  onClick={() => setEditingSnippet(snippet)}
                                  className="p-2 hover:bg-black/5 rounded-lg transition-colors text-black/40 hover:text-alloro-orange"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>

                                {/* Delete button */}
                                <button
                                  onClick={() => handleDelete(snippet.id)}
                                  className={`p-2 rounded-lg transition-colors ${
                                    deletingId === snippet.id
                                      ? "bg-red-50 text-red-600"
                                      : "hover:bg-black/5 text-black/40 hover:text-red-600"
                                  }`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </DragDropContext>

      {/* Create/Edit Modal */}
      {(isCreating || editingSnippet) && (
        <CodeSnippetModal
          templateId={isProject ? undefined : templateId}
          projectId={isProject ? projectId : undefined}
          snippet={editingSnippet || undefined}
          pages={pages}
          onSuccess={() => {
            setIsCreating(false);
            setEditingSnippet(null);
            onSnippetsChange();
          }}
          onClose={() => {
            setIsCreating(false);
            setEditingSnippet(null);
          }}
        />
      )}
    </div>
  );
}
