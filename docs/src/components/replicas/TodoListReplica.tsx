/**
 * TodoListReplica — visual replica of frontend/src/components/tasks/TasksView.tsx
 *
 * Mirrors the real TasksView layout: header with Target icon and sync button,
 * Team Tasks section with circular progress, TaskCard grid (rounded-3xl cards
 * with checkbox, priority badge, description, and metadata footer), plus the
 * Alloro System Intelligence collapsible and the Add Task dashed button.
 *
 * Stripped: fetchClientTasks, completeTask API, event dispatchers,
 * checkbox onClick, expand/collapse, getPriorityItem, useIsWizardActive,
 * useLocationContext, pulse animation, useRef scroll, parseHighlightTags.
 *
 * Hardcoded: 4 task cards (1 complete, 3 incomplete) with priority badges,
 * agent_type labels, due dates, and categories. Progress at 25% (1/4).
 */
import {
  CheckSquare,
  Square,
  Clock,
  Target,
  Zap,
  Layout,
  Users,
  Plus,
  ChevronDown,
  HelpCircle,
  RotateCw,
} from "lucide-react";
import type { ReplicaProps } from "../../types/docs";
import { DashboardLayout } from "./DashboardLayout";
import { HotspotZone } from "../HotspotZone";

/* ── Fixture data ─────────────────────────────────────────── */

interface FixtureTask {
  id: number;
  hotspotId: string;
  title: string;
  description: string;
  dueDate: string;
  status: "pending" | "complete";
  priority: "High" | "Normal" | "Low";
  agentType: string;
  category: string;
  completedAt?: string;
}

const userTasks: FixtureTask[] = [
  {
    id: 1,
    hotspotId: "task-card-1",
    title: "Reply to 3 new Google reviews",
    description:
      "You have 3 unread reviews from the past week that need responses. Timely replies improve your local ranking signal.",
    dueDate: "May 14, 2026",
    status: "complete",
    priority: "High",
    agentType: "Office Manager",
    category: "Reputation",
    completedAt: "May 13, 2026",
  },
  {
    id: 2,
    hotspotId: "task-card-2",
    title: "Upload May PMS export",
    description:
      "Your monthly PMS data is due for upload to keep analytics current.",
    dueDate: "May 18, 2026",
    status: "pending",
    priority: "High",
    agentType: "Office Manager",
    category: "Analytics",
  },
  {
    id: 3,
    hotspotId: "task-card-3",
    title: "Review website content draft",
    description:
      "New homepage copy is ready for your approval before it goes live.",
    dueDate: "May 20, 2026",
    status: "pending",
    priority: "Normal",
    agentType: "Doctor",
    category: "Website",
  },
  {
    id: 4,
    hotspotId: "task-card-4",
    title: "Confirm updated office hours for summer",
    description:
      "Google Business Profile hours need to be verified before the holiday schedule starts.",
    dueDate: "May 22, 2026",
    status: "pending",
    priority: "Low",
    agentType: "Front Desk",
    category: "GBP",
  },
];

const alloroTasks = [
  {
    id: 101,
    title: "Monitoring reputation signals",
    description: "Tracking review velocity across Google and Yelp.",
    category: "Reputation",
  },
  {
    id: 102,
    title: "Rank tracking — weekly snapshot",
    description: "Collecting local pack positions for 12 target keywords.",
    category: "Rankings",
  },
];

const completionPct = 25; // 1 of 4 complete
const dashOffset = 100 - completionPct;

/* ── Component ────────────────────────────────────────────── */

export function TodoListReplica({
  hotspots,
  activeHotspotId,
  onHotspotClick,
}: ReplicaProps) {
  const findHotspot = (id: string) => hotspots.find((h) => h.id === id);

  return (
    <DashboardLayout activeItem="todo-list">
      {/* ── Header ─────────────────────────────────────────── */}
      <HotspotZone
        id="header"
        hotspot={findHotspot("header")}
        isActive={activeHotspotId === "header"}
        onHotspotClick={onHotspotClick}
      >
        <div className="glass-header lg:sticky lg:top-0 z-40 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="w-10 h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg">
              <Target size={20} />
            </div>
            <div className="flex flex-col text-left">
              <h1 className="text-[11px] font-black font-heading text-alloro-navy uppercase tracking-[0.25em] leading-none">
                To-Do List
              </h1>
              <span className="text-[9px] font-bold text-alloro-navy/40 uppercase tracking-widest mt-1.5">
                Tasks for your team
              </span>
            </div>
          </div>

          <button
            type="button"
            className="flex items-center gap-3 px-5 py-3 bg-white border border-black/5 text-alloro-navy rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:border-alloro-orange/20 transition-all shadow-sm"
          >
            <RotateCw size={14} />
            <span>Update To-Do List</span>
          </button>
        </div>
      </HotspotZone>

      {/* ── Team Tasks + Progress ──────────────────────────── */}
      <HotspotZone
        id="progress-bar"
        hotspot={findHotspot("progress-bar")}
        isActive={activeHotspotId === "progress-bar"}
        onHotspotClick={onHotspotClick}
      >
        <div className="mt-10 flex items-center justify-between px-2">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 bg-alloro-orange text-white rounded-2xl flex items-center justify-center shadow-xl">
              <Layout size={24} />
            </div>
            <div className="text-left">
              <h2 className="text-2xl font-medium text-alloro-navy tracking-tight leading-tight">
                Team Tasks
              </h2>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
                Action items for practice staff
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end mr-4">
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">
                Total Completion
              </span>
              <span className="text-base font-black font-sans leading-none text-alloro-navy">
                {completionPct}%
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl border border-black/5 bg-white flex items-center justify-center relative">
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="50%"
                  cy="50%"
                  r="40%"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="transparent"
                  className="text-slate-50"
                />
                <circle
                  cx="50%"
                  cy="50%"
                  r="40%"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="transparent"
                  strokeDasharray="100"
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  className="text-alloro-orange"
                />
              </svg>
            </div>
          </div>
        </div>
      </HotspotZone>

      {/* ── Task Card Grid ─────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {userTasks.map((task) => {
          const isDone = task.status === "complete";
          const isHighPriority = task.priority === "High";

          return (
            <HotspotZone
              key={task.id}
              id={task.hotspotId}
              hotspot={findHotspot(task.hotspotId)}
              isActive={activeHotspotId === task.hotspotId}
              onHotspotClick={onHotspotClick}
            >
              <div
                className={`group relative bg-white rounded-[2rem] p-8 border transition-all duration-500 select-none text-left h-full ${
                  isDone
                    ? "border-green-100 bg-green-50/20 opacity-60 shadow-none"
                    : "border-black/5 shadow-premium hover:shadow-2xl hover:-translate-y-1 hover:border-alloro-orange/20"
                }`}
              >
                <div className="flex flex-row gap-8 items-start">
                  {/* Checkbox */}
                  <div className="shrink-0 mt-1">
                    {isDone ? (
                      <div className="w-8 h-8 rounded-xl bg-green-500 text-white flex items-center justify-center shadow-lg shadow-green-500/20">
                        <CheckSquare size={20} />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center border-2 bg-white border-slate-200 text-slate-200">
                        <Square size={18} />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-4">
                        <h3
                          className={`font-black text-xl text-alloro-navy font-heading tracking-tight leading-tight ${
                            isDone ? "line-through opacity-30" : ""
                          }`}
                        >
                          {task.title}
                        </h3>
                        {isHighPriority && !isDone && (
                          <span className="px-3 py-1 bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-100 leading-none">
                            High Priority
                          </span>
                        )}
                        {task.priority === "Low" && !isDone && (
                          <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[9px] font-black uppercase tracking-widest rounded-lg border border-blue-100 leading-none">
                            Low Priority
                          </span>
                        )}
                      </div>
                      {!isDone && (
                        <button
                          type="button"
                          className="p-2 rounded-xl bg-slate-50 text-slate-400 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest"
                        >
                          <HelpCircle size={14} /> Ask Question
                        </button>
                      )}
                    </div>

                    <p
                      className={`text-[16px] leading-relaxed font-bold tracking-tight line-clamp-2 ${
                        isDone ? "opacity-30" : "text-slate-500"
                      }`}
                    >
                      {task.description}
                    </p>

                    {/* Metadata footer */}
                    <div className="flex flex-wrap items-center gap-x-10 gap-y-3 pt-6 border-t border-black/5 text-[10px] font-black text-alloro-navy/30 uppercase tracking-[0.2em]">
                      <span className="flex items-center gap-2.5">
                        <Clock size={16} className="text-alloro-orange/40" />
                        {isDone && task.completedAt
                          ? `Done: ${task.completedAt}`
                          : `Due: ${task.dueDate}`}
                      </span>
                      <span className="flex items-center gap-2.5">
                        <Users size={16} className="text-alloro-orange/40" />
                        {task.agentType}
                      </span>
                      <div className="flex items-center gap-2">
                        <Layout size={14} className="opacity-40" />
                        <span className="text-slate-500">{task.category}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </HotspotZone>
          );
        })}

        {/* Add Task placeholder */}
        <div className="h-full min-h-[280px] border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center gap-4 text-slate-400 font-black uppercase tracking-[0.4em] text-[9px]">
          <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 flex items-center justify-center">
            <Plus size={24} />
          </div>
          Add Task
        </div>
      </div>

      {/* ── Alloro System Intelligence (collapsed) ─────────── */}
      <div className="mt-12">
        <div className="w-full flex items-center justify-between p-8 rounded-[2rem] border border-black/5 bg-white text-alloro-navy shadow-premium">
          <div className="flex items-center gap-6">
            <div className="w-12 h-12 rounded-2xl bg-alloro-navy/5 text-alloro-navy flex items-center justify-center">
              <Zap size={22} />
            </div>
            <div className="text-left">
              <h3 className="text-xl font-black font-heading tracking-tight leading-none text-alloro-navy">
                Alloro System Intelligence
              </h3>
              <p className="text-[9px] font-black uppercase tracking-widest mt-1.5 text-slate-300">
                {alloroTasks.length} background tasks running
              </p>
            </div>
          </div>
          <div className="text-slate-300">
            <ChevronDown size={24} />
          </div>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────── */}
      <div className="mt-16 pb-12 flex flex-col items-center gap-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-alloro-navy/5 shadow-lg" />
        <p className="text-[11px] text-alloro-navy/20 font-black tracking-[0.4em] uppercase">
          Alloro Roadmap &bull; v2.6.0
        </p>
      </div>
    </DashboardLayout>
  );
}
