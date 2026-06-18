import { useState, useCallback, useEffect, useRef } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd";
import {
  GripVertical,
  Plus,
  Trash2,
  Code,
  LayoutList,
  Sparkles,
  Loader2,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import type { Section } from "../../../api/templates";
import { serializeSectionsJs, parseSectionsJs } from "../../../utils/templateRenderer";
import { beautifySections } from "../../../utils/htmlBeautify";
import { logger } from "../../../lib/logger";

interface SectionsEditorProps {
  sections: Section[];
  onChange: (sections: Section[]) => void;
  onSave?: () => void;
  height?: string;
}

export default function SectionsEditor({
  sections,
  onChange,
  onSave,
  height = "100%",
}: SectionsEditorProps) {
  const [mode, setMode] = useState<"structured" | "raw">("structured");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    sections.length > 0 ? 0 : null
  );
  const [rawContent, setRawContent] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);
  const [isBeautifying, setIsBeautifying] = useState(false);
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Sync selectedIndex when sections change externally
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= sections.length) {
      setSelectedIndex(sections.length > 0 ? sections.length - 1 : null);
    }
    if (selectedIndex === null && sections.length > 0) {
      setSelectedIndex(0);
    }
  }, [sections.length]);

  // Focus rename input when renaming starts
  useEffect(() => {
    if (renamingIndex !== null) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingIndex]);

  // --- Structured mode handlers ---

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;
      const from = result.source.index;
      const to = result.destination.index;
      if (from === to) return;

      const updated = [...sections];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);

      // Adjust selected index to follow the moved item
      if (selectedIndex === from) {
        setSelectedIndex(to);
      } else if (selectedIndex !== null) {
        if (from < selectedIndex && to >= selectedIndex) {
          setSelectedIndex(selectedIndex - 1);
        } else if (from > selectedIndex && to <= selectedIndex) {
          setSelectedIndex(selectedIndex + 1);
        }
      }

      onChange(updated);
    },
    [sections, selectedIndex, onChange]
  );

  const handleContentChange = useCallback(
    (value: string | undefined) => {
      if (selectedIndex === null) return;
      const updated = sections.map((s, i) =>
        i === selectedIndex ? { ...s, content: value || "" } : s
      );
      onChange(updated);
    },
    [selectedIndex, sections, onChange]
  );

  const handleAddSection = useCallback(() => {
    const newSection: Section = {
      name: `section-${sections.length + 1}`,
      content: "<section>\n  \n</section>",
    };
    const updated = [...sections, newSection];
    onChange(updated);
    setSelectedIndex(updated.length - 1);
  }, [sections, onChange]);

  const handleDeleteSection = useCallback(
    (index: number) => {
      if (sections.length <= 1) return;
      const updated = sections.filter((_, i) => i !== index);
      onChange(updated);

      if (selectedIndex === index) {
        setSelectedIndex(Math.min(index, updated.length - 1));
      } else if (selectedIndex !== null && selectedIndex > index) {
        setSelectedIndex(selectedIndex - 1);
      }
    },
    [sections, selectedIndex, onChange]
  );

  const handleRename = useCallback(
    (index: number, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      const updated = sections.map((s, i) =>
        i === index ? { ...s, name: trimmed } : s
      );
      onChange(updated);
      setRenamingIndex(null);
    },
    [sections, onChange]
  );

  // --- Mode switching ---

  const switchToRaw = useCallback(() => {
    setRawContent(serializeSectionsJs(sections));
    setRawError(null);
    setMode("raw");
  }, [sections]);

  const switchToStructured = useCallback(() => {
    try {
      const parsed = parseSectionsJs(rawContent);
      onChange(parsed);
      setSelectedIndex(parsed.length > 0 ? 0 : null);
      setRawError(null);
      setMode("structured");
    } catch (err) {
      setRawError(err instanceof Error ? err.message : "Parse error");
    }
  }, [rawContent, onChange]);

  // --- Raw mode handlers ---

  const handleRawChange = useCallback((value: string | undefined) => {
    setRawContent(value || "");
    setRawError(null);

    // Try to parse for live preview updates
    try {
      const parsed = parseSectionsJs(value || "[]");
      onChange(parsed);
    } catch {
      // Don't block typing — just skip preview update
    }
  }, [onChange]);

  // --- Beautify ---

  const handleBeautify = useCallback(async () => {
    setIsBeautifying(true);
    try {
      const beautified = await beautifySections(sections);
      onChange(beautified);
      if (mode === "raw") {
        setRawContent(serializeSectionsJs(beautified));
      }
    } catch (err) {
      logger.error("Beautify failed:", err);
    } finally {
      setIsBeautifying(false);
    }
  }, [sections, mode, onChange]);

  // --- Cmd+S handler ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();

        // If in raw mode, try to parse first
        if (mode === "raw") {
          try {
            const parsed = parseSectionsJs(rawContent);
            onChange(parsed);
          } catch (err) {
            setRawError(err instanceof Error ? err.message : "Parse error");
            return;
          }
        }

        onSave?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, rawContent, onChange, onSave]);

  const selectedSection = selectedIndex !== null ? sections[selectedIndex] : null;

  return (
    <div className="flex flex-col" style={{ height }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e1e] border-b border-[#333]">
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#2d2d2d] rounded-md p-0.5">
            <button
              onClick={mode === "raw" ? switchToStructured : undefined}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                mode === "structured"
                  ? "bg-[#404040] text-white"
                  : "text-gray-400 hover:text-white"
              }`}
              title="Structured editor"
            >
              <LayoutList className="w-3.5 h-3.5" />
              Structured
            </button>
            <button
              onClick={mode === "structured" ? switchToRaw : undefined}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                mode === "raw"
                  ? "bg-[#404040] text-white"
                  : "text-gray-400 hover:text-white"
              }`}
              title="Raw JS editor"
            >
              <Code className="w-3.5 h-3.5" />
              Raw
            </button>
          </div>

          {mode === "structured" && selectedSection && (
            <span className="text-xs text-gray-500 ml-2 font-mono">
              {selectedSection.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {rawError && (
            <span className="text-xs text-red-400 mr-2">{rawError}</span>
          )}
          <button
            onClick={handleBeautify}
            disabled={isBeautifying}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-[#2d2d2d] transition-colors disabled:opacity-50"
            title="Beautify HTML (format all sections)"
          >
            {isBeautifying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Beautify
          </button>
        </div>
      </div>

      {/* Editor area */}
      {mode === "structured" ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Section list */}
          <div className="w-56 bg-[#252526] border-r border-[#333] flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-[#333]">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                Sections
              </span>
            </div>

            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="sections-list">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex-1 overflow-y-auto"
                  >
                    {sections.map((section, index) => (
                      <Draggable
                        key={`${section.name}-${index}`}
                        draggableId={`${section.name}-${index}`}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`group flex items-center gap-1 px-1 py-1.5 cursor-pointer transition-colors ${
                              selectedIndex === index
                                ? "bg-[#37373d] text-white"
                                : snapshot.isDragging
                                  ? "bg-[#2d2d2d] text-gray-300"
                                  : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
                            }`}
                            onClick={() => {
                              setSelectedIndex(index);
                              setRenamingIndex(null);
                            }}
                            onDoubleClick={() => setRenamingIndex(index)}
                          >
                            <div
                              {...provided.dragHandleProps}
                              className="flex-shrink-0 p-0.5 text-gray-600 hover:text-gray-400"
                            >
                              <GripVertical className="w-3 h-3" />
                            </div>

                            {renamingIndex === index ? (
                              <input
                                ref={renameInputRef}
                                defaultValue={section.name}
                                className="flex-1 min-w-0 bg-[#1e1e1e] text-white text-xs font-mono px-1.5 py-0.5 rounded border border-[#555] outline-none"
                                onBlur={(e) => handleRename(index, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRename(index, e.currentTarget.value);
                                  if (e.key === "Escape") setRenamingIndex(null);
                                }}
                              />
                            ) : (
                              <span className="flex-1 min-w-0 text-xs font-mono truncate">
                                {section.name}
                              </span>
                            )}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSection(index);
                              }}
                              className="flex-shrink-0 p-0.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete section"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            <button
              onClick={handleAddSection}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 hover:text-white hover:bg-[#2d2d2d] transition-colors border-t border-[#333]"
            >
              <Plus className="w-3 h-3" />
              Add Section
            </button>
          </div>

          {/* HTML editor */}
          <div className="flex-1 overflow-hidden">
            {selectedSection ? (
              <Editor
                height="100%"
                language="html"
                value={selectedSection.content}
                onChange={handleContentChange}
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
            ) : (
              <div className="h-full flex items-center justify-center bg-[#1e1e1e]">
                <p className="text-sm text-gray-600">Select a section to edit</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Raw mode */
        <div className="flex-1 overflow-hidden">
          <Editor
            height="100%"
            defaultLanguage="javascript"
            value={rawContent}
            onChange={handleRawChange}
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
