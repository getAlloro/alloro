import { useEffect, useState, useCallback } from "react";
import { Bell, Check, X, CheckCheck, Trash2, AtSign, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { PmNotification } from "../../types/pm";
import { fetchNotifications, markNotificationsRead, deleteAllNotifications, fetchPmUsers } from "../../api/pm";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function notificationMessage(n: PmNotification, userMap: Map<number, string>): string {
  const actor = n.metadata?.actor_name ?? userMap.get(n.actor_user_id) ?? "Someone";
  const task = n.metadata?.task_title ?? "a task";
  if (n.type === "task_assigned") return `${actor} assigned you "${task}"`;
  if (n.type === "task_unassigned") return `${actor} unassigned you from "${task}"`;
  if (n.type === "mention_in_comment") return `${actor} mentioned you in "${task}"`;
  if (n.type === "task_commented") return `${actor} commented on "${task}"`;
  return `${actor} completed "${task}" you assigned`;
}

const TYPE_ICON: Record<PmNotification["type"], React.ReactNode> = {
  task_assigned: <Check className="h-3 w-3" style={{ color: "#3D8B40" }} />,
  task_unassigned: <X className="h-3 w-3" style={{ color: "#C43333" }} />,
  assignee_completed_task: <CheckCheck className="h-3 w-3" style={{ color: "#5B9BD5" }} />,
  mention_in_comment: <AtSign className="h-3 w-3" style={{ color: "#D66853" }} />,
  task_commented: <MessageCircle className="h-3 w-3" style={{ color: "#5B9BD5" }} />,
};

interface NotificationCardProps {
  onTaskClick?: (taskId: string) => void;
}

export function NotificationCard({ onTaskClick }: NotificationCardProps) {
  const [notifications, setNotifications] = useState<PmNotification[]>([]);
  const [userMap, setUserMap] = useState<Map<number, string>>(new Map());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const load = useCallback(async () => {
    try {
      const [data, users] = await Promise.all([fetchNotifications(), fetchPmUsers()]);
      setNotifications((data ?? []).slice(0, 10));
      setUserMap(new Map((users ?? []).map((u: { id: number; display_name: string }) => [u.id, u.display_name])));
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleMarkAllRead = async () => {
    try {
      await markNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch { /* silent */ }
  };

  const handleDeleteAll = async () => {
    try {
      await deleteAllNotifications();
      setNotifications([]);
      setShowDeleteConfirm(false);
    } catch { /* silent */ }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.12 }}
      className="rounded-[14px] p-4 flex flex-col"
      style={{
        backgroundColor: "var(--color-pm-bg-secondary)",
        boxShadow: "var(--pm-shadow-card)",
        border: "1px solid var(--color-pm-border)",
        minHeight: 120,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Bell className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color: "var(--color-pm-text-muted)" }} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full text-[7px] font-bold text-white" style={{ backgroundColor: "#D66853" }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
          <span className="text-[12px] font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>
            Notifications
          </span>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-[10px] transition-colors"
              style={{ color: "var(--color-pm-text-muted)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#D66853"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-pm-text-muted)"; }}
            >
              Mark read
            </button>
          )}

          {notifications.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowDeleteConfirm((v) => !v)}
                className="transition-colors"
                style={{ color: "var(--color-pm-text-muted)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#C43333"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-pm-text-muted)"; }}
              >
                <Trash2 className="h-3 w-3" strokeWidth={1.5} />
              </button>
              <AnimatePresence>
                {showDeleteConfirm && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -4 }}
                    transition={{ duration: 0.1 }}
                    className="absolute right-0 top-full mt-1.5 z-50 flex items-center gap-2 rounded-lg px-2.5 py-1.5 whitespace-nowrap"
                    style={{
                      backgroundColor: "var(--color-pm-bg-tertiary)",
                      border: "1px solid var(--color-pm-border)",
                      boxShadow: "var(--pm-shadow-elevated)",
                    }}
                  >
                    <span className="text-[10px]" style={{ color: "var(--color-pm-text-secondary)" }}>Clear all?</span>
                    <button onClick={handleDeleteAll} className="text-[10px] font-semibold text-[#C43333]">Yes</button>
                    <button onClick={() => setShowDeleteConfirm(false)} className="text-[10px]" style={{ color: "var(--color-pm-text-muted)" }}>No</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* List */}
      {notifications.length === 0 ? (
        <p className="text-[11px] text-center py-3" style={{ color: "var(--color-pm-text-muted)" }}>
          No notifications
        </p>
      ) : (
        <div className="pm-scrollbar space-y-0.5 overflow-y-auto" style={{ maxHeight: 220 }}>
          {notifications.map((n) => {
            const project = n.metadata?.project_name;
            const isClickable = !!n.task_id && !!onTaskClick;

            return (
              <div
                key={n.id}
                onClick={() => isClickable && onTaskClick!(n.task_id!)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
                style={{
                  backgroundColor: n.is_read ? "transparent" : "rgba(214,104,83,0.06)",
                  cursor: isClickable ? "pointer" : "default",
                }}
                onMouseEnter={(e) => {
                  if (isClickable) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-pm-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = n.is_read ? "transparent" : "rgba(214,104,83,0.06)";
                }}
              >
                <div className="flex-shrink-0 h-4 w-4 flex items-center justify-center rounded-full" style={{ backgroundColor: "var(--color-pm-bg-primary)" }}>
                  {TYPE_ICON[n.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] leading-snug truncate" style={{ color: "var(--color-pm-text-primary)" }}>
                    {notificationMessage(n, userMap)}
                    {project && (
                      <span className="text-[10px] ml-1" style={{ color: "var(--color-pm-text-muted)" }}>
                        · {project}
                      </span>
                    )}
                  </p>
                </div>
                <span className="flex-shrink-0 text-[9px]" style={{ color: "var(--color-pm-text-muted)" }}>
                  {timeAgo(n.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
