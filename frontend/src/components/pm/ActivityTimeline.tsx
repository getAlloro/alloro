import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Trash2 } from "lucide-react";
import type { PmActivityEntry } from "../../types/pm";
import { fetchGlobalActivity, fetchProjectActivity, clearActivity as clearActivityApi } from "../../api/pm";
import { NoActivity } from "./EmptyStates";

const ACTION_LABELS: Record<string, string> = {
  task_created: "created task",
  task_updated: "updated task",
  task_moved: "moved task",
  task_completed: "completed task",
  task_deleted: "deleted task",
  task_assigned: "assigned task",
  task_reordered: "reordered task",
  project_created: "created project",
  project_deleted: "deleted project",
  deadline_changed: "changed deadline for",
};

const ACTION_DOT_COLORS: Record<string, string> = {
  task_created: "#5B9BD5",
  task_moved: "#D4920A",
  task_completed: "#3D8B40",
  task_deleted: "#C43333",
  task_assigned: "#9B59B6",
  task_updated: "var(--color-pm-text-muted)",
  task_reordered: "var(--color-pm-text-muted)",
  project_created: "#D66853",
  project_deleted: "#C43333",
  deadline_changed: "#D4920A",
};

const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const itemVariants = { hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0, transition: { duration: 0.25, ease: "easeOut" as const } } };

interface ActivityTimelineProps {
  projectId?: string;
  compact?: boolean;
  onSeeMore?: () => void;
}

export function ActivityTimeline({ projectId, compact = false, onSeeMore }: ActivityTimelineProps) {
  const [entries, setEntries] = useState<PmActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const pageSize = compact ? 10 : 20;

  const loadEntries = async (offset = 0, append = false) => {
    setIsLoading(true);
    try {
      const result = projectId
        ? await fetchProjectActivity(projectId, pageSize, offset)
        : await fetchGlobalActivity(pageSize, offset);
      setEntries((prev) => append ? [...prev, ...result.data] : result.data);
      setTotal(result.total);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadEntries(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = async () => {
    await clearActivityApi();
    setEntries([]);
    setTotal(0);
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "var(--color-pm-bg-secondary)", boxShadow: "var(--pm-shadow-card)" }}
    >
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid var(--color-pm-border-subtle)" }}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-pm-text-secondary)" }}>
          Recent Activity
        </span>
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 text-[11px] font-medium transition-colors duration-150"
            style={{ color: "var(--color-pm-text-muted)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#C43333"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-pm-text-muted)"; }}
          >
            <Trash2 className="h-3 w-3" strokeWidth={1.5} />
            Clear
          </button>
        )}
      </div>

      {entries.length === 0 && !isLoading ? (
        <NoActivity />
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="show">
          {entries.map((entry) => {
            const actionLabel = ACTION_LABELS[entry.action] || entry.action;
            const dotColor = ACTION_DOT_COLORS[entry.action] || "var(--color-pm-text-muted)";
            const timeAgo = formatDistanceToNow(new Date(entry.created_at), { addSuffix: true });
            const userName = entry.user?.display_name || entry.user?.email?.split("@")[0] || "someone";

            return (
              <motion.div
                key={entry.id}
                variants={itemVariants}
                className="flex items-start gap-3 px-5 py-3"
                style={{ borderBottom: "1px solid var(--color-pm-border-subtle)" }}
              >
                <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] leading-snug">
                    <span className="font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>{userName}</span>
                    <span style={{ color: "var(--color-pm-text-secondary)" }}> {actionLabel}</span>
                    {entry.task && (
                      <span className="font-medium" style={{ color: "var(--color-pm-text-primary)" }}> &lsquo;{entry.task.title}&rsquo;</span>
                    )}
                    {!projectId && entry.project && (
                      <span style={{ color: "var(--color-pm-text-muted)" }}> in {entry.project.name}</span>
                    )}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--color-pm-text-muted)" }}>
                    {entry.user?.email && <>{entry.user.email} &middot; </>}
                    {timeAgo}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {entries.length < total && (
        <div className="px-5 py-3 text-center" style={{ borderTop: "1px solid var(--color-pm-border-subtle)" }}>
          {compact && onSeeMore ? (
            <button
              onClick={onSeeMore}
              className="text-[12px] font-medium text-[#D66853] hover:text-[#C45A46] transition-colors duration-150"
            >
              See all activity
            </button>
          ) : (
            <button
              onClick={() => loadEntries(entries.length, true)}
              disabled={isLoading}
              className="text-[12px] font-medium text-[#D66853] hover:text-[#C45A46] transition-colors duration-150 disabled:opacity-50"
            >
              {isLoading ? "Loading..." : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
