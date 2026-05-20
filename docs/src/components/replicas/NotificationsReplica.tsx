/**
 * NotificationsReplica — visual replica of the real Notifications page.
 * Source: frontend/src/pages/Notifications.tsx
 * Stripped: useNotifications, useInvalidateNotifications, useAuth, useLocationContext,
 *   useNavigate, markNotificationRead, markAllNotificationsRead, deleteAllNotifications,
 *   ConfirmModal, all onClick/mutation handlers, read/unread toggle, date-fns.
 * Hardcoded: 4 sample notifications with static timestamps.
 */

import {
  Bell,
  Zap,
  AlertCircle,
  Clock,
  CheckCircle2,
  ChevronRight,
  Activity,
  Lock,
  ShieldCheck,
  Check,
  Trash2,
} from "lucide-react";
import type { ReplicaProps } from "../../types/docs";
import { DashboardLayout } from "./DashboardLayout";
import { HotspotZone } from "../HotspotZone";

/* ── Fixture data ─────────────────────────────────────────── */

interface MockNotification {
  id: number;
  title: string;
  message: string;
  type: "ranking" | "task" | "pms" | "agent";
  impact: "critical" | "high" | "update";
  read: boolean;
  timestamp: string;
}

const notifications: MockNotification[] = [
  {
    id: 1,
    title: "Your Maps ranking dropped to #5",
    message:
      "Your Google Maps ranking for 'dentist near me' dropped from #3 to #5. Competitor activity and review velocity may be factors.",
    type: "ranking",
    impact: "critical",
    read: false,
    timestamp: "2 hours ago",
  },
  {
    id: 2,
    title: "New high-priority task assigned",
    message:
      "A new task has been assigned to your practice: 'Respond to 3 pending Google reviews from this week.'",
    type: "task",
    impact: "high",
    read: false,
    timestamp: "5 hours ago",
  },
  {
    id: 3,
    title: "Monthly production report ready",
    message:
      "Your May production report has been generated and is ready for review in the PMS Statistics dashboard.",
    type: "pms",
    impact: "update",
    read: true,
    timestamp: "Yesterday",
  },
  {
    id: 4,
    title: "Practice health score updated",
    message:
      "Your overall practice health score has been recalculated. Current score: 82/100 — up 3 points from last month.",
    type: "agent",
    impact: "update",
    read: true,
    timestamp: "2 days ago",
  },
];

/* ── Helpers (mirroring real page logic) ──────────────────── */

function getNotificationType(notif: MockNotification) {
  if (notif.impact === "critical") return "error";
  if (notif.impact === "high") return "warning";
  return "success";
}

function getImpactLabel(notif: MockNotification) {
  if (notif.impact === "critical") return "Critical Intervention";
  if (notif.impact === "high") return "High Priority Alert";
  if (notif.type === "ranking") return "Strategic Alpha";
  return "Update";
}

/* ── Component ────────────────────────────────────────────── */

export function NotificationsReplica({
  hotspots,
  activeHotspotId,
  onHotspotClick,
}: ReplicaProps) {
  const findHotspot = (id: string) => hotspots.find((h) => h.id === id);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <DashboardLayout activeItem="notifications">
      <div className="min-h-full bg-alloro-bg font-body text-alloro-textDark selection:bg-alloro-orange selection:text-white">
        {/* Header */}
        <HotspotZone
          id="header"
          hotspot={findHotspot("header")}
          isActive={activeHotspotId === "header"}
          onHotspotClick={onHotspotClick}
        >
          <header className="glass-header lg:sticky lg:top-0 z-40 border-b border-black/5">
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
                  type="button"
                  disabled={unreadCount === 0}
                  className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-alloro-orange uppercase tracking-[0.15em] transition-all group disabled:opacity-50 px-3 py-2 rounded-lg hover:bg-slate-100"
                >
                  <Check size={14} />
                  <span className="hidden sm:inline">Mark all as read</span>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-[0.15em] transition-all group disabled:opacity-50 px-3 py-2 rounded-lg hover:bg-red-50"
                >
                  <Trash2 size={14} />
                  <span className="hidden sm:inline">Delete all</span>
                </button>
              </div>
            </div>
          </header>
        </HotspotZone>

        <main className="w-full max-w-[1100px] mx-auto px-6 lg:px-10 py-10 lg:py-16 space-y-12 lg:space-y-20 text-left">
          {/* Notification list */}
          <section className="bg-white rounded-[2.5rem] border border-black/5 shadow-premium overflow-hidden">
            <div className="divide-y divide-black/5">
              {notifications.map((notif, idx) => {
                const type = getNotificationType(notif);
                const impact = getImpactLabel(notif);
                const isRead = notif.read;
                const hotspotId =
                  idx < 3 ? `notification-${idx + 1}` : undefined;

                const card = (
                  <div
                    className={`p-10 lg:p-14 hover:bg-slate-50/40 transition-all flex flex-col sm:flex-row gap-10 group cursor-pointer relative overflow-hidden ${
                      isRead ? "opacity-60" : ""
                    }`}
                  >
                    {/* Unread indicator — orange left border */}
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
                            {notif.timestamp}
                          </span>
                          {!isRead && (
                            <span className="text-alloro-navy">
                              Mark as read
                            </span>
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

                if (hotspotId) {
                  return (
                    <HotspotZone
                      key={notif.id}
                      id={hotspotId}
                      hotspot={findHotspot(hotspotId)}
                      isActive={activeHotspotId === hotspotId}
                      onHotspotClick={onHotspotClick}
                    >
                      {card}
                    </HotspotZone>
                  );
                }

                return (
                  <div key={notif.id}>{card}</div>
                );
              })}
            </div>
          </section>

          {/* Bottom Section — Notification Monitoring */}
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
                Alloro AI is continuously monitoring your practice and will
                notify you of important events and updates.
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
      </div>
    </DashboardLayout>
  );
}
