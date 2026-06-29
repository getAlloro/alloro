import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Target,
  Zap,
  Layout,
  Plus,
  ChevronDown,
} from "lucide-react";
import { fetchClientTasks, completeTask } from "../../api/tasks";
import { adminFetch } from "../../api";
import type { GroupedActionItems } from "../../types/tasks";
import { useIsWizardActive, useWizardDemoData } from "../../contexts/OnboardingWizardContext";
import { useLocationContext } from "../../contexts/locationContext";
import { getPriorityItem } from "../../hooks/useLocalStorage";
import { logger } from "../../lib/logger";
import { pulseAnimationStyle } from "./tasksView.utils";
import TaskCard from "./TasksView/TaskCard";
import { useLabels } from "../../hooks/useLabels";

interface TasksViewProps {
  organizationId: number | null;
  locationId?: number | null;
}

export function TasksView({ organizationId, locationId }: TasksViewProps) {
  const location = useLocation();
  const labels = useLabels();
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();
  const { signalContentReady } = useLocationContext();
  const [tasks, setTasks] = useState<GroupedActionItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<number | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [clampedTasks, setClampedTasks] = useState<Set<number>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [completionPct, setCompletionPct] = useState(0);
  const [pulsingTaskId, setPulsingTaskId] = useState<number | null>(null);
  const [showAlloroTasks, setShowAlloroTasks] = useState(false);

  // Auto-expand Alloro tasks when wizard is active and targeting this section
  useEffect(() => {
    if (isWizardActive) {
      setShowAlloroTasks(true);
    }
  }, [isWizardActive]);
  const descriptionRefs = useRef<Map<number, HTMLParagraphElement>>(new Map());
  const hasScrolledToTask = useRef(false);

  // Get scrollToTaskId from navigation state (single task)
  const scrollToTaskId = (location.state as { scrollToTaskId?: number } | null)
    ?.scrollToTaskId;

  // Get highlightTaskIds from navigation state (multiple tasks)
  const highlightTaskIds = (location.state as { highlightTaskIds?: number[] } | null)
    ?.highlightTaskIds;

  // Track if highlight animation was interrupted by user scroll
  const isAnimationInterrupted = useRef(false);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get user role for permission checks (sessionStorage for pilot mode, localStorage for normal)
  const userRole = getPriorityItem("user_role");
  const canEditTasks = userRole === "admin" || userRole === "manager";

  // Scroll to task and pulse when navigated from dashboard (single task)
  useEffect(() => {
    if (scrollToTaskId && tasks && !hasScrolledToTask.current) {
      hasScrolledToTask.current = true;

      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const taskElement = document.getElementById(`task-${scrollToTaskId}`);
        if (taskElement) {
          // Scroll to element with offset for header
          taskElement.scrollIntoView({ behavior: "smooth", block: "center" });

          // Trigger pulse animation
          setPulsingTaskId(scrollToTaskId);

          // Remove pulse after animation completes
          setTimeout(() => {
            setPulsingTaskId(null);
          }, 1700); // 2 pulses * 0.8s + small buffer
        }
      }, 300);
    }
  }, [scrollToTaskId, tasks]);

  // Scroll and highlight multiple tasks one by one (from Important Updates banner)
  useEffect(() => {
    if (!highlightTaskIds || highlightTaskIds.length === 0 || !tasks || hasScrolledToTask.current) {
      return;
    }

    hasScrolledToTask.current = true;
    isAnimationInterrupted.current = false;

    // Detect user scroll to interrupt animation
    const handleUserScroll = () => {
      isAnimationInterrupted.current = true;
      setPulsingTaskId(null);
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
      window.removeEventListener("wheel", handleUserScroll);
      window.removeEventListener("touchmove", handleUserScroll);
    };

    window.addEventListener("wheel", handleUserScroll, { passive: true });
    window.addEventListener("touchmove", handleUserScroll, { passive: true });

    // Animate through tasks one by one
    const animateTasks = async () => {
      // Wait for DOM to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 300));

      for (let i = 0; i < highlightTaskIds.length; i++) {
        if (isAnimationInterrupted.current) break;

        const taskId = highlightTaskIds[i];
        const taskElement = document.getElementById(`task-${taskId}`);

        if (taskElement) {
          taskElement.scrollIntoView({ behavior: "smooth", block: "center" });
          setPulsingTaskId(taskId);

          // Wait for scroll + pulse animation (500ms delay between tasks)
          await new Promise((resolve) => {
            animationTimeoutRef.current = setTimeout(resolve, 500);
          });

          if (isAnimationInterrupted.current) break;

          // Keep pulse for remaining duration then clear
          await new Promise((resolve) => {
            animationTimeoutRef.current = setTimeout(resolve, 1200);
          });

          if (!isAnimationInterrupted.current) {
            setPulsingTaskId(null);
          }
        }
      }

      // Cleanup
      window.removeEventListener("wheel", handleUserScroll);
      window.removeEventListener("touchmove", handleUserScroll);
    };

    animateTasks();

    return () => {
      window.removeEventListener("wheel", handleUserScroll);
      window.removeEventListener("touchmove", handleUserScroll);
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, [highlightTaskIds, tasks]);

  // Check which descriptions are clamped after tasks load
  useEffect(() => {
    if (!tasks) return;

    const checkClamped = () => {
      const newClampedTasks = new Set<number>();
      descriptionRefs.current.forEach((element, taskId) => {
        if (element && element.scrollHeight > element.clientHeight) {
          newClampedTasks.add(taskId);
        }
      });
      setClampedTasks(newClampedTasks);
    };

    // Small delay to ensure DOM is rendered
    setTimeout(checkClamped, 100);
  }, [tasks]);

  // Calculate completion percentage based on USER tasks only
  useEffect(() => {
    if (!tasks) return;
    const userTasksList = tasks.USER || [];
    const total = userTasksList.length;
    const done = userTasksList.filter((t) => t.status === "complete").length;
    setCompletionPct(total > 0 ? Math.round((done / total) * 100) : 0);
  }, [tasks]);

  // Fetch tasks on mount and when organizationId changes
  // Skip during wizard mode - use demo data instead
  useEffect(() => {
    if (isWizardActive) {
      if (wizardDemoData?.tasks) {
        setTasks(wizardDemoData.tasks);
      }
      setLoading(false);
      return;
    }

    if (!organizationId) {
      setLoading(false);
      return;
    }

    loadTasks();
  }, [organizationId, locationId, isWizardActive, wizardDemoData]);

  const loadTasks = async () => {
    if (!organizationId) return;

    try {
      setLoading(true);
      setError(null);
      const response = await fetchClientTasks(organizationId, locationId);
      setTasks(response.tasks);
    } catch (err) {
      logger.error("Failed to fetch tasks:", err);
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
      signalContentReady();
    }
  };

  const handleSync = async () => {
    setIsRefreshing(true);
    await loadTasks();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const handleToggleTask = async (taskId: number, currentStatus: string) => {
    if (!organizationId) return;

    try {
      setCompletingTaskId(taskId);

      // If task is complete, mark as pending (undo). Otherwise, mark as complete.
      if (currentStatus === "complete") {
        // Undo completion - use the update endpoint to set status to pending
        const response = await adminFetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "pending" }),
        });

        if (!response.ok) {
          throw new Error("Failed to undo task completion");
        }
      } else {
        // Mark as complete
        await completeTask(taskId, organizationId);
      }

      // Reload tasks to get updated state
      await loadTasks();

      // Dispatch custom event to notify Sidebar of task changes
      window.dispatchEvent(new CustomEvent("tasks:updated"));
    } catch (err) {
      logger.error("Failed to toggle task:", err);
      alert(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setCompletingTaskId(null);
    }
  };

  if (!organizationId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-center py-16"
      >
        <div className="text-center max-w-md bg-white rounded-2xl border border-slate-200 shadow-premium p-10">
          <div className="p-4 bg-slate-100 rounded-2xl w-fit mx-auto mb-4">
            <AlertCircle className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="font-display text-xl font-medium text-alloro-navy mb-2 tracking-tight">
            No Account Selected
          </h3>
          <p className="text-slate-500 text-sm font-medium">
            Please log in to view your tasks.
          </p>
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-center py-16"
      >
        <div className="text-center max-w-md bg-white rounded-2xl border border-slate-200 shadow-premium p-10">
          <div className="p-4 bg-red-50 rounded-2xl w-fit mx-auto mb-4">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="font-display text-xl font-medium text-alloro-navy mb-2 tracking-tight">
            Unable to Load Tasks
          </h3>
          <p className="text-slate-500 text-sm font-medium mb-6">{error}</p>
          <button
            onClick={loadTasks}
            className="px-6 py-3 bg-alloro-orange text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold text-sm flex items-center gap-2 mx-auto"
          >
            <RotateCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </motion.div>
    );
  }

  const alloroTasks = tasks?.ALLORO || [];
  const userTasks = tasks?.USER || [];
  const teamTasksSubtitle =
    labels.orgNoun === "practice"
      ? "Action items for practice staff"
      : "Action items for your team";

  // Skeleton card component for loading state
  const SkeletonCard = () => (
    <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-premium">
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .skeleton-shimmer {
          background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
          background-size: 200% 100%;
          animation: skeleton-shimmer 1.5s infinite;
        }
      `}</style>
      <div className="flex items-start gap-5">
        <div className="w-7 h-7 bg-slate-200 rounded-lg skeleton-shimmer shrink-0 mt-1"></div>
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-5 w-16 bg-slate-200 rounded-full skeleton-shimmer"></div>
            <div className="h-5 w-20 bg-slate-200 rounded-full skeleton-shimmer"></div>
          </div>
          <div className="h-5 w-3/4 bg-slate-200 rounded skeleton-shimmer"></div>
          <div className="space-y-2">
            <div className="h-3 w-full bg-slate-200 rounded skeleton-shimmer"></div>
            <div className="h-3 w-5/6 bg-slate-200 rounded skeleton-shimmer"></div>
            <div className="h-3 w-2/3 bg-slate-200 rounded skeleton-shimmer"></div>
          </div>
          <div className="h-3 w-24 bg-slate-200 rounded skeleton-shimmer"></div>
        </div>
      </div>
    </div>
  );

  const isLoadingTasks = loading && !tasks;

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32 selection:bg-alloro-orange selection:text-white">
      {/* Inject pulse animation styles */}
      <style>{pulseAnimationStyle}</style>
      <header className="glass-header border-b border-black/5 lg:sticky lg:top-0 z-40">
        <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="w-10 h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg">
              <Target size={20} />
            </div>
            <div className="flex flex-col text-left">
              <h1 className="text-[11px] font-black font-heading text-alloro-textDark uppercase tracking-[0.25em] leading-none">
                To-Do List
              </h1>
              <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5 hidden sm:inline">
                Tasks for your team
              </span>
            </div>
          </div>
          <button
            onClick={handleSync}
            disabled={loading}
            className="flex items-center gap-3 px-5 py-3 bg-white border border-black/5 text-alloro-navy rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:border-alloro-orange/20 transition-all shadow-premium active:scale-95 disabled:opacity-50"
          >
            <RotateCw
              size={14}
              className={isRefreshing ? "animate-spin" : ""}
            />
            <span className="hidden sm:inline">
              {isRefreshing ? "Refreshing..." : "Update To-Do List"}
            </span>
          </button>
        </div>
      </header>

      <main className="w-full max-w-[1100px] mx-auto px-6 lg:px-10 py-10 lg:py-16 space-y-12 lg:space-y-16">

        {/* TEAM TASKS - MAIN VIEW */}
        <section data-wizard-target="tasks-team" className="space-y-10">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 bg-alloro-orange text-white rounded-2xl flex items-center justify-center shadow-xl">
                <Layout size={24} />
              </div>
              <div className="text-left">
                <h2 className="font-display text-2xl md:text-3xl font-medium text-alloro-navy tracking-tight leading-tight">
                  Team Tasks
                </h2>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
                  {teamTasksSubtitle}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end mr-4">
                <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">
                  Total Completion
                </span>
                <span
                  className={`text-base font-black font-sans leading-none ${
                    completionPct === 100
                      ? "text-green-600"
                      : "text-alloro-navy"
                  }`}
                >
                  {completionPct}%
                </span>
              </div>
              <div
                className={`w-12 h-12 rounded-xl border flex items-center justify-center shadow-inner-soft relative transition-all duration-500 ${
                  completionPct === 100
                    ? "bg-green-500 border-green-500"
                    : "bg-white border-black/5"
                }`}
              >
                {completionPct === 100 ? (
                  <CheckCircle2 className="w-6 h-6 text-white" />
                ) : (
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
                      strokeDashoffset={100 - completionPct}
                      strokeLinecap="round"
                      className="text-alloro-orange transition-all duration-700"
                    />
                  </svg>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {isLoadingTasks ? (
              // Loading skeleton cards
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : userTasks.length === 0 ? (
              <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center shadow-premium col-span-2">
                <div className="p-4 bg-green-50 rounded-2xl w-fit mx-auto mb-4">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                <p className="text-slate-500 font-medium">
                  All caught up! No tasks pending.
                </p>
              </div>
            ) : (
              userTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isReadOnly={false}
                  isCompleting={completingTaskId === task.id}
                  canEdit={canEditTasks}
                  onToggle={() => handleToggleTask(task.id, task.status)}
                  isExpanded={expandedTaskId === task.id}
                  isClamped={clampedTasks.has(task.id)}
                  isPulsing={pulsingTaskId === task.id}
                  onExpand={() =>
                    setExpandedTaskId(
                      expandedTaskId === task.id ? null : task.id
                    )
                  }
                  descriptionRef={(el) => {
                    if (el) descriptionRefs.current.set(task.id, el);
                  }}
                />
              ))
            )}
            {!isLoadingTasks && (
              <button className="h-full min-h-[280px] border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center gap-4 text-slate-400 font-black uppercase tracking-[0.4em] text-[9px] hover:border-alloro-orange hover:text-alloro-orange hover:bg-white transition-all group shadow-inner-soft active:scale-[0.99]">
                <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:scale-110 group-hover:shadow-premium transition-all">
                  <Plus size={24} />
                </div>
                Add Task
              </button>
            )}
          </div>
        </section>

        {/* ALLORO TASKS - COLLAPSIBLE */}
        <section data-wizard-target="tasks-alloro" className="pt-8">
          {isLoadingTasks ? (
            <div className="w-full h-24 bg-slate-200 rounded-[2rem] skeleton-shimmer"></div>
          ) : (
          <div className="w-full">
            <button
              onClick={() => setShowAlloroTasks(!showAlloroTasks)}
              className={`w-full flex items-center justify-between p-8 rounded-[2rem] border transition-all duration-500 group shadow-premium ${
                showAlloroTasks
                  ? "bg-alloro-navy border-alloro-navy text-white"
                  : "bg-white border-black/5 text-alloro-navy hover:border-alloro-orange/20 hover:shadow-2xl"
              }`}
            >
              <div className="flex items-center gap-6">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-inner ${
                    showAlloroTasks
                      ? "bg-white/10 text-alloro-orange border border-white/10"
                      : "bg-alloro-navy/5 text-alloro-navy"
                  }`}
                >
                  <Zap
                    size={22}
                    className={showAlloroTasks ? "animate-pulse" : ""}
                  />
                </div>
                <div className="text-left">
                  <h3
                    className={`text-xl font-black font-heading tracking-tight leading-none ${
                      showAlloroTasks ? "text-white" : "text-alloro-navy"
                    }`}
                  >
                    Alloro System Intelligence
                  </h3>
                  <p
                    className={`text-[9px] font-black uppercase tracking-widest mt-1.5 ${
                      showAlloroTasks ? "text-white/40" : "text-slate-300"
                    }`}
                  >
                    {alloroTasks.length} background tasks running
                  </p>
                </div>
              </div>
              <div
                className={`transition-transform duration-700 ${
                  showAlloroTasks
                    ? "rotate-180 text-alloro-orange"
                    : "text-slate-300 group-hover:translate-y-1"
                }`}
              >
                <ChevronDown size={24} />
              </div>
            </button>

            {showAlloroTasks && (
              <div className="mt-8 space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {alloroTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      isReadOnly={true}
                      canEdit={false}
                      isExpanded={expandedTaskId === task.id}
                      isClamped={clampedTasks.has(task.id)}
                      isPulsing={pulsingTaskId === task.id}
                      onExpand={() =>
                        setExpandedTaskId(
                          expandedTaskId === task.id ? null : task.id
                        )
                      }
                      descriptionRef={(el) => {
                        if (el) descriptionRefs.current.set(task.id, el);
                      }}
                    />
                  ))}
                </div>
                <div className="p-8 bg-alloro-navy rounded-3xl text-center border border-white/5 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-alloro-orange/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <p className="text-blue-100/40 text-sm font-bold tracking-tight relative z-10">
                    Alloro is automatically managing{" "}
                    <span className="text-white">
                      Reputation Monitoring, Rank Tracking, and Lead Flow
                      Integrity
                    </span>{" "}
                    in the background. No team interaction required.
                  </p>
                </div>
              </div>
            )}
          </div>
          )}
        </section>

        <footer className="pt-16 pb-12 flex flex-col items-center gap-10 text-center">
          <img
            src="/logo.png"
            alt="Alloro"
            className="w-16 h-16 rounded-2xl shadow-2xl"
          />
          <p className="text-[11px] text-alloro-textDark/20 font-black tracking-[0.4em] uppercase">
            Alloro Roadmap • v2.6.0
          </p>
        </footer>
      </main>
    </div>
  );
}
