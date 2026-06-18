import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { usePmStore } from "../../stores/pmStore";
import { PriorityTriangle, PRIORITY_LABELS } from "./PriorityTriangle";
import { fetchProjects, fetchProject } from "../../api/pm";
import type { PmProject, PmColumn } from "../../types/pm";

const PRIORITY_CYCLE = ["P4", "P5", "P3", "P2", "P1"] as const;

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedProjectId?: string;
}

export function CreateTaskModal({ isOpen, onClose, preselectedProjectId }: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(preselectedProjectId || "");
  const [columnId, setColumnId] = useState("");
  const [priority, setPriority] = useState<typeof PRIORITY_CYCLE[number]>("P4");
  const [deadline, setDeadline] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projects, setProjects] = useState<PmProject[]>([]);
  const [columns, setColumns] = useState<PmColumn[]>([]);

  const createTask = usePmStore((s) => s.createTask);
  const pmFetchProject = usePmStore((s) => s.fetchProject);

  // Load projects list
  useEffect(() => {
    if (isOpen) {
      fetchProjects().then((p) => {
        setProjects(p);
        if (preselectedProjectId) setProjectId(preselectedProjectId);
        else if (p.length > 0 && !projectId) setProjectId(p[0].id);
      });
    }
  }, [isOpen, preselectedProjectId]);

  // Load columns when project changes
  useEffect(() => {
    if (!projectId) { setColumns([]); return; }
    fetchProject(projectId).then((p) => {
      setColumns(p.columns || []);
      const toDoCol = p.columns?.find((c: PmColumn) => c.name === "To Do");
      setColumnId(toDoCol?.id || p.columns?.[0]?.id || "");
    });
  }, [projectId]);

  const selectedColumnIsBacklog = columns.find((c) => c.id === columnId)?.is_backlog ?? false;

  const cyclePriority = () => {
    const idx = PRIORITY_CYCLE.indexOf(priority);
    setPriority(PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !projectId || !columnId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await createTask(projectId, {
        title: title.trim(),
        description: description || undefined,
        column_id: columnId,
        priority: selectedColumnIsBacklog ? undefined : priority,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
      });
      // Refresh active project if viewing it
      const activeId = usePmStore.getState().activeProject?.id;
      if (activeId === projectId) pmFetchProject(projectId);
      resetAndClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setTitle(""); setDescription(""); setPriority("P3"); setDeadline("");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={resetAndClose} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-xl p-6 overflow-y-auto max-h-[90vh]"
            style={{ backgroundColor: "var(--color-pm-bg-secondary)", boxShadow: "0 16px 48px rgba(0,0,0,0.2)", border: "1px solid var(--color-pm-border)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[17px] font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>New Task</h2>
              <button onClick={resetAndClose} className="rounded-lg p-1.5" style={{ color: "var(--color-pm-text-muted)" }}>
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-pm-text-secondary)" }}>Title *</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Task title" className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none" style={{ backgroundColor: "var(--color-pm-bg-primary)", border: "1px solid var(--color-pm-border)", color: "var(--color-pm-text-primary)" }} />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-pm-text-secondary)" }}>Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional description" className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none resize-none" style={{ backgroundColor: "var(--color-pm-bg-primary)", border: "1px solid var(--color-pm-border)", color: "var(--color-pm-text-primary)" }} />
              </div>

              {/* Project + Column row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-pm-text-secondary)" }}>Project</label>
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ backgroundColor: "var(--color-pm-bg-primary)", border: "1px solid var(--color-pm-border)", color: "var(--color-pm-text-primary)" }}>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-pm-text-secondary)" }}>Column</label>
                  <select value={columnId} onChange={(e) => setColumnId(e.target.value)} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ backgroundColor: "var(--color-pm-bg-primary)", border: "1px solid var(--color-pm-border)", color: "var(--color-pm-text-primary)" }}>
                    {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Priority + Deadline row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-pm-text-secondary)" }}>Priority</label>
                  <button type="button" onClick={cyclePriority} disabled={selectedColumnIsBacklog} className="flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm w-full disabled:opacity-40" style={{ backgroundColor: "var(--color-pm-bg-primary)", border: "1px solid var(--color-pm-border)", color: "var(--color-pm-text-primary)" }}>
                    <PriorityTriangle priority={selectedColumnIsBacklog ? null : priority} size={14} />
                    <span>{selectedColumnIsBacklog ? "N/A" : PRIORITY_LABELS[priority] || priority}</span>
                  </button>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-pm-text-secondary)" }}>Deadline</label>
                  <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none" style={{ backgroundColor: "var(--color-pm-bg-primary)", border: "1px solid var(--color-pm-border)", color: "var(--color-pm-text-primary)" }} />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={resetAndClose} className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold" style={{ border: "1px solid var(--color-pm-border)", color: "var(--color-pm-text-secondary)" }}>Cancel</button>
                <button type="submit" disabled={!title.trim() || isSubmitting} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#D66853", boxShadow: "0 2px 8px rgba(214,104,83,0.3)" }}>
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? "Creating..." : "Create Task"}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
