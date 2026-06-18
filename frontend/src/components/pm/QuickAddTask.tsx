import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { usePmStore } from "../../stores/pmStore";
import { PriorityTriangle } from "./PriorityTriangle";

const PRIORITY_CYCLE = ["P4", "P5", "P3", "P2", "P1"] as const;

interface QuickAddTaskProps {
  projectId: string;
  columnId: string;
  isBacklog?: boolean;
}

export function QuickAddTask({ projectId, columnId, isBacklog = false }: QuickAddTaskProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<typeof PRIORITY_CYCLE[number]>("P3");
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createTask = usePmStore((s) => s.createTask);

  const handleOpen = () => {
    setIsOpen(true);
    setPriority("P4");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cyclePriority = () => {
    const idx = PRIORITY_CYCLE.indexOf(priority);
    setPriority(PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length]);
  };

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed || isCreating) return;
    setIsCreating(true);
    try {
      await createTask(projectId, {
        title: trimmed,
        column_id: columnId,
        priority: isBacklog ? undefined : priority,
      });
      setTitle("");
    } finally {
      setIsCreating(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
    if (e.key === "Escape") { setIsOpen(false); setTitle(""); }
  };

  return (
    <div className="px-3 pb-2">
      <AnimatePresence mode="wait">
        {!isOpen ? (
          <motion.button
            key="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleOpen}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors duration-150"
            style={{ color: "var(--color-pm-text-muted)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-pm-bg-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Add task
          </motion.button>
        ) : (
          <motion.div key="input" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="flex items-center gap-1.5">
            {!isBacklog && (
              <button onClick={cyclePriority} className="flex-shrink-0 rounded-md p-1.5" style={{ backgroundColor: "var(--color-pm-bg-hover)" }} title={`Priority: ${priority}`}>
                <PriorityTriangle priority={priority} size={14} />
              </button>
            )}
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => { if (!title.trim()) setIsOpen(false); }}
              placeholder="Add a task..."
              className="flex-1 min-w-0 rounded-lg px-3 py-2 text-[13px] outline-none"
              style={{ backgroundColor: "var(--color-pm-bg-primary)", border: "1px solid var(--color-pm-border)", color: "var(--color-pm-text-primary)" }}
            />
            <button onClick={handleSubmit} disabled={isCreating} className="flex-shrink-0 rounded-md p-1.5" style={{ color: "#D66853" }}>
              {isCreating ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#D66853] border-t-transparent" /> : <Plus className="h-4 w-4" strokeWidth={2} />}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skeleton shimmer during creation */}
      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 72 }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 rounded-lg overflow-hidden"
            style={{
              background: "linear-gradient(90deg, var(--color-pm-bg-secondary) 25%, var(--color-pm-bg-hover) 50%, var(--color-pm-bg-secondary) 75%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite linear",
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
