import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { usePmStore } from "../../stores/pmStore";
import { CreateProjectModal } from "../../components/pm/CreateProjectModal";
import { CreateTaskModal } from "../../components/pm/CreateTaskModal";
import { StatsRow } from "../../components/pm/StatsRow";
import { VelocityChart } from "../../components/pm/VelocityChart";
import { TasksOverTimeChart } from "../../components/pm/TasksOverTimeChart";
import { ActivityTimeline } from "../../components/pm/ActivityTimeline";
import { ActivityModal } from "../../components/pm/ActivityModal";
import { FloatingClock } from "../../components/pm/FloatingClock";
import { MeTabView } from "../../components/pm/MeTabView";
import { BacklogTabView } from "../../components/pm/BacklogTabView";
import { AssigneeTabView } from "../../components/pm/AssigneeTabView";
import { CrossProjectAISynthModal } from "../../components/pm/CrossProjectAISynthModal";
import { NoProjects } from "../../components/pm/EmptyStates";
import { formatDeadline } from "../../utils/pmDateFormat";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

type DashboardView = "overview" | "backlog" | "me" | "assignee";

function ProjectIcon({ icon, color }: { icon: string; color: string }) {
  const name = icon.charAt(0).toUpperCase() + icon.slice(1);
  const iconMap = LucideIcons as unknown as Record<string, LucideIcon>;
  const IconComponent = iconMap[name] || LucideIcons.FolderKanban;
  return <IconComponent className="h-5 w-5" strokeWidth={1.5} style={{ color }} />;
}

export default function ProjectsDashboard() {
  const { projects, fetchProjects, isLoading } = usePmStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showCrossProjectSynth, setShowCrossProjectSynth] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const activeView: DashboardView =
    viewParam === "backlog" || viewParam === "me" || viewParam === "assignee"
      ? viewParam
      : "overview";
  const assigneeUserIdParam = Number(searchParams.get("userId"));
  const assigneeUserId =
    Number.isInteger(assigneeUserIdParam) && assigneeUserIdParam > 0
      ? assigneeUserIdParam
      : null;

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const tabStyle = (view: DashboardView) => ({
    backgroundColor: activeView === view ? "var(--color-pm-bg-hover)" : "transparent",
    color: activeView === view ? "var(--color-pm-text-primary)" : "var(--color-pm-text-muted)",
  });

  return (
    <div
      className="min-h-screen px-8 pt-7 pb-24"
      style={{ backgroundColor: "var(--color-pm-bg-primary)" }}
    >
      {/* Tab switcher */}
      <div className="flex items-center max-w-[1400px] mx-auto mb-6 gap-1">
        <button
          onClick={() => setSearchParams({})}
          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150"
          style={tabStyle("overview")}
        >
          Overview
        </button>
        <button
          onClick={() => setSearchParams({ view: "backlog" })}
          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150"
          style={tabStyle("backlog")}
        >
          Backlog
        </button>
        <button
          onClick={() => setSearchParams({ view: "me" })}
          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150"
          style={tabStyle("me")}
        >
          Me
        </button>
        <button
          onClick={() => setSearchParams({ view: "assignee" })}
          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150"
          style={tabStyle("assignee")}
        >
          People
        </button>
      </div>

      {/* BACKLOG tab */}
      {activeView === "backlog" && <BacklogTabView />}

      {/* ME tab */}
      {activeView === "me" && <MeTabView />}

      {/* ASSIGNEE tab */}
      {activeView === "assignee" && (
        <AssigneeTabView
          showUserPicker
          userId={assigneeUserId}
          onUserChange={(userId) => setSearchParams({ view: "assignee", userId: String(userId) })}
        />
      )}

      {/* OVERVIEW tab */}
      {activeView === "overview" && <>

      {/* Header actions */}
      <div className="flex justify-end items-center gap-4 max-w-[1400px] mx-auto mb-2">
        <button
          onClick={() => setShowCrossProjectSynth(true)}
          className="flex items-center gap-1.5 text-[13px] font-medium transition-colors duration-150"
          style={{ color: "#D66853" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#E37A66";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#D66853";
          }}
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
          Cross-project AI Synth
        </button>
        <button
          onClick={() => setShowCreateModal(true)}
          className="text-[13px] font-medium transition-colors duration-150"
          style={{ color: "var(--color-pm-text-muted)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#D66853"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-pm-text-muted)"; }}
        >
          + New Project
        </button>
      </div>

      {/* Sections */}
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {/* Stats + Velocity in one row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <StatsRow onBacklogClick={() => setSearchParams({ view: "backlog" })} />
          <VelocityChart />
        </div>

        {/* Tasks over time — 14-day daily completions */}
        <TasksOverTimeChart />

        {/* Main content: Grid + Activity */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Project Grid (2/3) */}
          <div className="xl:col-span-2">
            {isLoading && projects.length === 0 ? (
              <div className="flex justify-center py-20">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#D66853] border-t-transparent" />
              </div>
            ) : projects.length === 0 ? (
              <NoProjects onCreate={() => setShowCreateModal(true)} />
            ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {projects.map((project) => {
                  const deadline = formatDeadline(project.effective_deadline ?? project.deadline ?? null);
                  const total = project.total_tasks || 0;
                  const completed = project.completed_tasks || 0;
                  const progress = total > 0 ? (completed / total) * 100 : 0;
                  const bs = project.tasks_by_status || { backlog: 0, todo: 0, in_progress: 0, done: 0 };
                  const bsTotal = bs.backlog + bs.todo + bs.in_progress + bs.done || 1;
                  const activity = project.daily_activity || [];

                  // Build sparkline path
                  const sparkW = 120;
                  const sparkH = 28;
                  const maxCount = Math.max(...activity.map((a) => a.count), 1);
                  const sparkPoints = activity.map((a, i) => {
                    const x = activity.length > 1 ? (i / (activity.length - 1)) * sparkW : sparkW / 2;
                    const y = sparkH - (a.count / maxCount) * (sparkH - 4) - 2;
                    return `${x},${y}`;
                  });
                  const sparkPath = sparkPoints.length > 1 ? `M${sparkPoints.join(" L")}` : "";
                  const sparkFill = sparkPath ? `${sparkPath} L${sparkW},${sparkH} L0,${sparkH} Z` : "";

                  return (
                    <motion.div
                      key={project.id}
                      variants={cardVariants}
                      whileHover={{ y: -2, transition: { duration: 0.15 } }}
                      onClick={() => navigate(`/admin/pm/${project.id}`)}
                      className="cursor-pointer rounded-[14px] p-5 pl-[22px] transition-all duration-150 ease-out relative overflow-hidden"
                      style={{
                        backgroundColor: "var(--color-pm-bg-secondary)",
                        boxShadow: "var(--pm-shadow-card)",
                        borderLeft: `3px solid ${project.color}`,
                        border: `1px solid ${project.color}14`,
                        borderLeftWidth: "3px",
                        borderLeftColor: project.color,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 8px rgba(0,0,0,0.06), 0 0 20px ${project.color}25`;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.boxShadow = "var(--pm-shadow-card)";
                      }}
                    >
                      {/* Row 1: Icon + Name + Mini stats */}
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                          style={{ backgroundColor: `${project.color}14` }}
                        >
                          <ProjectIcon icon={project.icon} color={project.color} />
                        </div>
                        <h3
                          className="flex-1 text-[15px] font-semibold truncate min-w-0"
                          style={{ color: "var(--color-pm-text-primary)" }}
                        >
                          {project.name}
                        </h3>
                        {/* Inline stat badges */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[11px] font-medium" style={{ color: "var(--color-pm-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                            {total}
                          </span>
                          {/* Mini status bar */}
                          <div className="flex h-[6px] w-[72px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-pm-bg-hover)" }}>
                            {bs.done > 0 && <div style={{ width: `${(bs.done / bsTotal) * 100}%`, backgroundColor: "#3D8B40" }} />}
                            {bs.in_progress > 0 && <div style={{ width: `${(bs.in_progress / bsTotal) * 100}%`, backgroundColor: "#D4920A" }} />}
                            {bs.todo > 0 && <div style={{ width: `${(bs.todo / bsTotal) * 100}%`, backgroundColor: "#5B9BD5" }} />}
                            {bs.backlog > 0 && <div style={{ width: `${(bs.backlog / bsTotal) * 100}%`, backgroundColor: "#5E5850" }} />}
                          </div>
                          <span className="text-[11px] font-medium text-[#3D8B40]" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {bs.done}
                          </span>
                        </div>
                      </div>

                      {/* Row 2: Progress bar */}
                      <div className="mb-3">
                        <div className="flex justify-between text-[12px] mb-1">
                          <span style={{ color: "var(--color-pm-text-secondary)" }}>
                            {completed}/{total} tasks
                          </span>
                          <span style={{ color: "var(--color-pm-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                            {Math.round(progress)}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-pm-bg-hover)" }}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: "#D66853" }}
                          />
                        </div>
                      </div>

                      {/* Row 3: Deadline + Sparkline */}
                      <div className="flex items-center justify-between">
                        <div className="text-[12px]" title={deadline?.tooltip}>
                          {deadline ? (
                            <span className={deadline.colorClass}>
                              Project Deadline: {deadline.text}
                            </span>
                          ) : (
                            <span style={{ color: "var(--color-pm-text-muted)" }}>No deadline</span>
                          )}
                        </div>

                        {/* Sparkline */}
                        <svg width={sparkW} height={sparkH} className="flex-shrink-0 group-hover:opacity-100 opacity-70 transition-opacity duration-150">
                          {sparkFill && (
                            <path d={sparkFill} fill="rgba(214,104,83,0.1)" />
                          )}
                          {sparkPath && (
                            <motion.path
                              d={sparkPath}
                              fill="none"
                              stroke="#D66853"
                              strokeWidth={1.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
                            />
                          )}
                          {activity.length === 0 && (
                            <text x={sparkW / 2} y={sparkH / 2 + 4} textAnchor="middle" fill="var(--color-pm-text-muted)" fontSize={9}>
                              No activity
                            </text>
                          )}
                        </svg>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>

          {/* Activity Timeline (1/3) — compact */}
          <div>
            <ActivityTimeline compact onSeeMore={() => setShowActivityModal(true)} />
          </div>
        </div>
      </div>

      <CreateProjectModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
      <CreateTaskModal isOpen={showCreateTask} onClose={() => setShowCreateTask(false)} />
      <ActivityModal isOpen={showActivityModal} onClose={() => setShowActivityModal(false)} />
      <CrossProjectAISynthModal isOpen={showCrossProjectSynth} onClose={() => setShowCrossProjectSynth(false)} />
      </>}

      {/* Floating Clock — always visible */}
      <div className="fixed bottom-6 right-24 z-30">
        <FloatingClock />
      </div>

      {/* FAB — New Task (overview only) */}
      {activeView === "overview" && (
        <div className="fixed bottom-6 right-6 z-30 group">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCreateTask(true)}
            className="flex h-14 w-14 items-center justify-center rounded-full text-white transition-colors duration-150"
            style={{ backgroundColor: "#D66853", boxShadow: "var(--pm-shadow-fab)" }}
          >
            <Plus className="h-6 w-6" strokeWidth={2} />
          </motion.button>
          <div className="pointer-events-none absolute right-[68px] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <div className="whitespace-nowrap rounded-lg bg-[#1A1715] px-3 py-1.5 text-[12px] font-medium text-white shadow-lg">
              New Task
              <div className="absolute right-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-[#1A1715]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
