import React, { useState, useEffect } from "react";
import {
  Bell,
  Zap,
  AlertCircle,
  Clock,
  Trash2,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Activity,
  Lock,
  ShieldCheck,
  Check,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useLocationContext } from "../contexts/locationContext";
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteAllNotifications,
  type Notification,
} from "../api/notifications";
import {
  useNotifications,
  useInvalidateNotifications,
} from "../hooks/queries/useNotificationQueries";
import { formatDistanceToNow } from "date-fns";
import { ConfirmModal } from "../components/settings/ConfirmModal";
import { logger } from "../lib/logger";

export const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const [markingAll, setMarkingAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const organizationId = userProfile?.organizationId ?? null;
  const locationId = selectedLocation?.id ?? null;

  const { data: notificationsData, isLoading: loading } = useNotifications(
    organizationId,
    locationId,
  );
  const { invalidateAll: refetchNotifications } = useInvalidateNotifications();

  const notifications = notificationsData?.notifications ?? [];

  // Set page title
  useEffect(() => {
    document.title = "Notifications | Alloro";
  }, []);

  // Mark all notifications as read when leaving the page
  useEffect(() => {
    return () => {
      if (organizationId) {
        markAllNotificationsRead(organizationId, locationId);
        window.dispatchEvent(new CustomEvent("notifications:updated"));
      }
    };
  }, [organizationId, locationId]);

  // Get navigation path based on notification type
  const getNotificationPath = (notification: Notification) => {
    const actionPath = notification.metadata?.actionPath;
    if (typeof actionPath === "string" && actionPath.startsWith("/")) {
      return actionPath;
    }

    switch (notification.type) {
      case "pms":
        return "/pmsStatistics";
      case "task":
        return "/tasks";
      case "agent":
        return "/dashboard";
      case "ranking":
        return "/rankings";
      default:
        return "/dashboard";
    }
  };

  // Get notification type for styling
  const getNotificationType = (notification: Notification) => {
    if (
      notification.type === "pms" ||
      notification.title.toLowerCase().includes("sync") ||
      notification.title.toLowerCase().includes("pms")
    ) {
      return "success";
    }
    if (
      notification.title.toLowerCase().includes("drop") ||
      notification.title.toLowerCase().includes("error") ||
      notification.title.toLowerCase().includes("critical")
    ) {
      return "error";
    }
    if (
      notification.title.toLowerCase().includes("volatility") ||
      notification.title.toLowerCase().includes("below") ||
      notification.title.toLowerCase().includes("warning")
    ) {
      return "warning";
    }
    return "success";
  };

  // Get impact label based on notification
  const getImpactLabel = (notification: Notification) => {
    const type = getNotificationType(notification);
    if (type === "error") return "Critical Intervention";
    if (type === "warning") return "High Priority Alert";
    if ((notification.type as string) === "ranking") return "Strategic Alpha";
    return "Update";
  };

  // Handle notification click
  const handleNotificationClick = async (notification: Notification) => {
    if (!organizationId) return;

    try {
      if (!notification.read) {
        await markNotificationRead(notification.id, organizationId);
        refetchNotifications();
      }
      navigate(getNotificationPath(notification));
    } catch (error) {
      logger.error("Error handling notification click:", error);
    }
  };

  // Handle mark as read
  const handleMarkAsRead = async (
    notificationId: number,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (!organizationId) return;

    try {
      await markNotificationRead(notificationId, organizationId);
      refetchNotifications();
    } catch (error) {
      logger.error("Error marking notification as read:", error);
    }
  };

  // Handle mark all as read
  const handleMarkAllRead = async () => {
    if (!organizationId) return;

    setMarkingAll(true);
    try {
      await markAllNotificationsRead(organizationId, locationId);
      refetchNotifications();
      // Dispatch event to update sidebar notification badge
      window.dispatchEvent(new CustomEvent("notifications:updated"));
    } catch (error) {
      logger.error("Error marking all notifications as read:", error);
    } finally {
      setMarkingAll(false);
    }
  };

  // Handle delete all notifications
  const handleDeleteAll = async () => {
    if (!organizationId) return;

    setDeletingAll(true);
    try {
      await deleteAllNotifications(organizationId, locationId);
      refetchNotifications();
      // Dispatch event to update sidebar notification badge
      window.dispatchEvent(new CustomEvent("notifications:updated"));
      setShowDeleteConfirm(false);
    } catch (error) {
      logger.error("Error deleting all notifications:", error);
    } finally {
      setDeletingAll(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32 selection:bg-alloro-orange selection:text-white">
      {/* Header */}
      <header className="glass-header border-b border-black/5 lg:sticky lg:top-0 z-40">
        <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="w-10 h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg">
              <Bell size={20} />
            </div>
            <div className="flex flex-col text-left">
              <h1 className="text-[11px] font-black font-heading text-alloro-textDark uppercase tracking-[0.25em] leading-none">
                Notifications
              </h1>
              <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5 hidden sm:inline">
                Real-time Practice Updates
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll || unreadCount === 0}
              className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-alloro-orange uppercase tracking-[0.15em] transition-all group disabled:opacity-50 px-3 py-2 rounded-lg hover:bg-slate-100"
            >
              {markingAll ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              <span className="hidden sm:inline">Mark all as read</span>
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deletingAll || notifications.length === 0}
              className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-[0.15em] transition-all group disabled:opacity-50 px-3 py-2 rounded-lg hover:bg-red-50"
            >
              {deletingAll ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              <span className="hidden sm:inline">Delete all</span>
            </button>
          </div>
        </div>
      </header>

      <main className="w-full max-w-[1100px] mx-auto px-6 lg:px-10 py-10 lg:py-16 space-y-12 lg:space-y-20 text-left">
        {loading ? (
          <div className="bg-white rounded-[2.5rem] border border-black/5 shadow-premium overflow-hidden">
            <div className="divide-y divide-black/5">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="p-10 lg:p-14 flex flex-col sm:flex-row gap-10 animate-pulse"
                >
                  <div className="w-16 h-16 rounded-2xl bg-slate-200 shrink-0"></div>
                  <div className="flex-1 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                      <div className="h-8 bg-slate-200 rounded w-3/4"></div>
                      <div className="h-8 bg-slate-200 rounded-full w-32"></div>
                    </div>
                    <div className="h-6 bg-slate-200 rounded w-full"></div>
                    <div className="h-6 bg-slate-200 rounded w-full"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : notifications.length > 0 ? (
          <section className="bg-white rounded-[2.5rem] border border-black/5 shadow-premium overflow-hidden">
            <div className="divide-y divide-black/5">
              {notifications.map((notif) => {
                const type = getNotificationType(notif);
                const impact = getImpactLabel(notif);
                const isRead = notif.read;
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-10 lg:p-14 hover:bg-slate-50/40 transition-all flex flex-col sm:flex-row gap-10 group cursor-pointer relative overflow-hidden ${
                      isRead ? "opacity-60" : ""
                    }`}
                  >
                    {/* Unread indicator - orange left border */}
                    {!isRead && (
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-alloro-orange"></div>
                    )}
                    {/* Hover indicator */}
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-alloro-orange opacity-0 group-hover:opacity-100 transition-all duration-500"></div>

                    <div
                      className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-500 group-hover:scale-110 shadow-sm ${
                        type === "success"
                          ? "bg-green-50 text-green-600 border-green-100"
                          : type === "warning"
                            ? "bg-amber-50 text-amber-600 border-amber-100"
                            : "bg-red-50 text-red-600 border-red-100"
                      }`}
                    >
                      {type === "success" ? (
                        <CheckCircle2 size={28} />
                      ) : type === "warning" ? (
                        <Zap size={28} />
                      ) : (
                        <AlertCircle size={28} />
                      )}
                    </div>

                    <div className="flex-1 space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                          <h3
                            className={`font-display text-xl md:text-2xl font-medium tracking-tight leading-tight group-hover:text-alloro-orange transition-colors ${
                              isRead ? "text-slate-500" : "text-alloro-navy"
                            }`}
                          >
                            {notif.title}
                          </h3>
                          {!isRead && (
                            <span className="px-2 py-1 bg-alloro-orange text-white text-[8px] font-black uppercase tracking-widest rounded-md">
                              New
                            </span>
                          )}
                        </div>
                        <span
                          className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border shrink-0 w-fit shadow-sm ${
                            impact.includes("Critical")
                              ? "bg-red-50 text-red-600 border-red-100"
                              : impact.includes("High")
                                ? "bg-amber-50 text-amber-600 border-amber-100"
                                : "bg-white text-alloro-navy border-black/5"
                          }`}
                        >
                          {impact}
                        </span>
                      </div>
                      <p
                        className={`text-lg lg:text-xl font-medium leading-relaxed tracking-tight max-w-4xl ${
                          isRead ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        {notif.message}
                      </p>
                      <div className="flex items-center justify-between pt-6 border-t border-black/[0.03]">
                        <div className="flex items-center gap-8 text-[11px] font-black text-slate-300 uppercase tracking-[0.2em]">
                          <span className="flex items-center gap-2.5">
                            <Clock
                              size={18}
                              className={
                                isRead
                                  ? "text-slate-300"
                                  : "text-alloro-orange/30"
                              }
                            />{" "}
                            {formatDistanceToNow(new Date(notif.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                          {!isRead && (
                            <button
                              onClick={(e) => handleMarkAsRead(notif.id, e)}
                              className="text-alloro-navy hover:text-alloro-orange transition-colors"
                            >
                              Mark as read
                            </button>
                          )}
                          {isRead && (
                            <span className="text-slate-300 flex items-center gap-1.5">
                              <CheckCircle2 size={14} /> Read
                            </span>
                          )}
                        </div>
                        <div className="w-10 h-10 rounded-full border border-black/5 flex items-center justify-center text-slate-200 group-hover:text-alloro-orange group-hover:border-alloro-orange/20 transition-all group-hover:translate-x-2">
                          <ChevronRight size={20} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="p-12 lg:p-20 bg-white border border-black/5 rounded-[2.5rem] shadow-premium flex flex-col items-center text-center space-y-8">
            <div className="w-20 h-20 bg-slate-50 text-slate-300 rounded-[1.5rem] flex items-center justify-center border border-black/5 shadow-inner">
              <ShieldCheck size={40} />
            </div>
            <div className="space-y-4">
              <h4 className="text-2xl font-black font-heading text-alloro-navy tracking-tight">
                All Clear.
              </h4>
              <p className="text-slate-400 font-bold text-lg max-w-md leading-relaxed tracking-tight">
                No active signals requiring attention. System surveillance is
                active and monitoring 24/7.
              </p>
            </div>
          </div>
        )}

        {/* Bottom Section - Notification Monitoring */}
        <section className="p-12 lg:p-20 bg-alloro-navy rounded-[2.5rem] border border-white/5 shadow-2xl flex flex-col items-center text-center space-y-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-80 bg-alloro-orange/5 rounded-full -mr-40 -mt-40 blur-[120px] pointer-events-none group-hover:bg-alloro-orange/10 transition-all duration-700"></div>

          <div className="w-20 h-20 bg-white/10 text-white rounded-[1.5rem] flex items-center justify-center border border-white/10 shadow-2xl relative z-10">
            <ShieldCheck size={40} className="text-white/60" />
          </div>
          <div className="space-y-4 relative z-10">
            <h4 className="text-2xl font-black font-heading text-white tracking-tight">
              Notification Monitoring Active
            </h4>
            <p className="text-blue-100/40 font-bold text-lg max-w-lg leading-relaxed tracking-tight">
              Alloro AI is continuously monitoring your practice and will notify
              you of important events and updates.
            </p>
          </div>
          <div className="flex items-center gap-12 pt-6 relative z-10">
            <div className="flex items-center gap-3 text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
              <Lock size={16} /> SOC2 SECURE
            </div>
            <div className="flex items-center gap-3 text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
              <Activity size={16} /> LIVE DATASTREAM
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-10 pb-12 flex flex-col items-center gap-10 text-center">
          <img
            src="/logo.png"
            alt="Alloro"
            className="w-16 h-16 rounded-2xl shadow-2xl"
          />
          <p className="text-[11px] text-alloro-textDark/20 font-black tracking-[0.4em] uppercase">
            Alloro Notifications • v2.6.0
          </p>
        </footer>
      </main>

      {/* Delete All Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteAll}
        title="Delete All Notifications?"
        message="Are you sure you want to delete all notifications? This action cannot be undone."
        confirmText="Delete All"
        cancelText="Cancel"
        isLoading={deletingAll}
        type="danger"
      />
    </div>
  );
};

export default Notifications;
