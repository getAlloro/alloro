import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Filter } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { PmActivityEntry, PmProject } from "../../types/pm";
import { fetchGlobalActivity, fetchProjects } from "../../api/pm";

const ACTION_LABELS: Record<string, string> = {
  task_created: "created task", task_updated: "updated task", task_moved: "moved task",
  task_completed: "completed task", task_deleted: "deleted task", task_assigned: "assigned task",
  task_reordered: "reordered task", project_created: "created project", project_deleted: "deleted project",
  deadline_changed: "changed deadline for",
};

const ACTION_DOT_COLORS: Record<string, string> = {
  task_created: "#5B9BD5", task_moved: "#D4920A", task_completed: "#3D8B40",
  task_deleted: "#C43333", task_assigned: "#9B59B6", task_updated: "#9A938A",
  task_reordered: "#9A938A", project_created: "#D66853", project_deleted: "#C43333", deadline_changed: "#D4920A",
};

const ACTION_TYPES = [
  { value: "", label: "All types" },
  { value: "task_created", label: "Created" },
  { value: "task_moved", label: "Moved" },
  { value: "task_completed", label: "Completed" },
  { value: "task_deleted", label: "Deleted" },
  { value: "task_assigned", label: "Assigned" },
  { value: "task_updated", label: "Updated" },
];

interface ActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ActivityModal({ isOpen, onClose }: ActivityModalProps) {
  const [entries, setEntries] = useState<PmActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [projects, setProjects] = useState<PmProject[]>([]);
  const [filterProject, setFilterProject] = useState("");
  const [filterAction, setFilterAction] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchProjects().then(setProjects).catch(() => {});
      loadEntries(true);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpen) loadEntries(true);
  }, [filterProject, filterAction]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadEntries = async (reset = false) => {
    setIsLoading(true);
    try {
      const offset = reset ? 0 : entries.length;
      const result = await fetchGlobalActivity(30, offset);
      let filtered = result.data;
      if (filterProject) filtered = filtered.filter((e) => e.project_id === filterProject);
      if (filterAction) filtered = filtered.filter((e) => e.action === filterAction);
      setEntries(reset ? filtered : [...entries, ...filtered]);
      setTotal(result.total);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl overflow-hidden flex flex-col max-h-[80vh]"
            style={{ backgroundColor: "var(--color-pm-bg-secondary)", border: "1px solid var(--color-pm-border)", boxShadow: "0 16px 48px rgba(0,0,0,0.25)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--color-pm-border-subtle)" }}>
              <h2 className="text-[16px] font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>All Activity</h2>
              <button onClick={onClose} className="rounded-lg p-1.5" style={{ color: "var(--color-pm-text-muted)" }}>
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 px-6 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--color-pm-border-subtle)" }}>
              <Filter className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} style={{ color: "var(--color-pm-text-muted)" }} />
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-[12px] outline-none"
                style={{ backgroundColor: "var(--color-pm-bg-primary)", border: "1px solid var(--color-pm-border)", color: "var(--color-pm-text-primary)", colorScheme: "dark" }}
              >
                <option value="">All projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-[12px] outline-none"
                style={{ backgroundColor: "var(--color-pm-bg-primary)", border: "1px solid var(--color-pm-border)", color: "var(--color-pm-text-primary)", colorScheme: "dark" }}
              >
                {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>

            {/* Entries */}
            <div className="flex-1 overflow-y-auto">
              {entries.length === 0 && !isLoading ? (
                <div className="py-12 text-center text-[13px]" style={{ color: "var(--color-pm-text-muted)" }}>No activity found</div>
              ) : (
                entries.map((entry) => {
                  const actionLabel = ACTION_LABELS[entry.action] || entry.action;
                  const dotColor = ACTION_DOT_COLORS[entry.action] || "#9A938A";
                  const timeAgo = formatDistanceToNow(new Date(entry.created_at), { addSuffix: true });
                  const userName = entry.user?.display_name || entry.user?.email?.split("@")[0] || "someone";

                  return (
                    <div key={entry.id} className="flex items-start gap-3 px-6 py-3" style={{ borderBottom: "1px solid var(--color-pm-border-subtle)" }}>
                      <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] leading-snug">
                          <span className="font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>{userName}</span>
                          <span style={{ color: "var(--color-pm-text-secondary)" }}> {actionLabel}</span>
                          {entry.task && <span className="font-medium" style={{ color: "var(--color-pm-text-primary)" }}> &lsquo;{entry.task.title}&rsquo;</span>}
                          {entry.project && <span style={{ color: "var(--color-pm-text-muted)" }}> in {entry.project.name}</span>}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--color-pm-text-muted)" }}>{timeAgo}</p>
                      </div>
                    </div>
                  );
                })
              )}
              {entries.length > 0 && entries.length < total && (
                <div className="py-3 text-center">
                  <button onClick={() => loadEntries(false)} disabled={isLoading} className="text-[12px] font-medium text-[#D66853] disabled:opacity-50">
                    {isLoading ? "Loading..." : "Load more"}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
