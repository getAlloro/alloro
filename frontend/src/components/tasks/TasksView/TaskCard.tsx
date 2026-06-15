import { useState } from "react";
import {
  CheckSquare,
  Square,
  Clock,
  CheckCircle2,
  Loader2,
  Zap,
  Layout,
  Users,
  HelpCircle,
  Send,
} from "lucide-react";
import type { ActionItem } from "../../../types/tasks";
import { parseHighlightTags } from "../../../utils/textFormatting";

interface TaskCardProps {
  task: ActionItem;
  isReadOnly: boolean;
  isCompleting?: boolean;
  canEdit: boolean;
  onToggle?: () => void;
  onExpand?: () => void;
  isExpanded?: boolean;
  isClamped?: boolean;
  descriptionRef?: (el: HTMLParagraphElement | null) => void;
  isPulsing?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  isReadOnly,
  isCompleting,
  canEdit,
  onToggle,
  onExpand,
  isExpanded,
  isClamped,
  descriptionRef,
  isPulsing,
}) => {
  const [showHelp, setShowHelp] = useState(false);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const isDone = task.status === "complete";

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getPriority = () => {
    try {
      const metadata =
        typeof task.metadata === "string"
          ? JSON.parse(task.metadata)
          : task.metadata;
      return metadata?.urgency || "Normal";
    } catch {
      return "Normal";
    }
  };

  const priority = getPriority();
  const isHighPriority = priority === "Immediate" || priority === "High";

  // Handle checkbox click - this is the only way to toggle task status
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isReadOnly && canEdit && onToggle) {
      onToggle();
    }
  };

  const handleHelpSubmit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!comment.trim()) return;
    setSent(true);
    setTimeout(() => {
      setShowHelp(false);
      setComment("");
      setSent(false);
    }, 1500);
  };

  return (
    <div
      id={`task-${task.id}`}
      className={`
        group relative bg-white rounded-3xl p-8 border transition-all duration-500 select-none text-left h-full
        ${
          isDone
            ? "border-green-100 bg-green-50/20 opacity-60 shadow-none"
            : "border-black/5 shadow-premium hover:shadow-2xl hover:border-alloro-orange/20 hover:-translate-y-1"
        }
        ${isPulsing ? "task-pulse-animation" : ""}
      `}
    >
      <div className="flex flex-row gap-8 items-start">
        <div className="shrink-0 mt-1">
          {isCompleting ? (
            <div className="w-8 h-8 rounded-xl flex items-center justify-center border-2 border-alloro-orange/20">
              <Loader2 size={18} className="animate-spin text-alloro-orange" />
            </div>
          ) : isDone ? (
            <div
              onClick={handleCheckboxClick}
              className={`w-8 h-8 rounded-xl bg-green-500 text-white flex items-center justify-center shadow-lg shadow-green-500/20 ${
                !isReadOnly && canEdit
                  ? "cursor-pointer hover:bg-green-600"
                  : ""
              }`}
            >
              <CheckSquare size={20} />
            </div>
          ) : (
            <div
              onClick={handleCheckboxClick}
              className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 transition-all duration-300 ${
                isReadOnly
                  ? "bg-alloro-navy/5 text-alloro-navy border-transparent"
                  : "bg-white border-slate-200 hover:border-alloro-orange hover:bg-alloro-orange/5 text-slate-200 hover:text-alloro-orange cursor-pointer"
              }`}
            >
              {isReadOnly ? <Zap size={18} /> : <Square size={18} />}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <h3
                className={`font-black text-xl text-alloro-navy font-heading tracking-tight leading-tight transition-all ${
                  isDone ? "line-through opacity-30" : ""
                }`}
              >
                {parseHighlightTags(task.title, "underline")}
              </h3>
              {isHighPriority && !isDone && (
                <span className="px-3 py-1 bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-100 leading-none">
                  High Priority
                </span>
              )}
            </div>
            {!isDone && !isReadOnly && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHelp(!showHelp);
                }}
                className={`p-2 rounded-xl transition-all duration-300 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest ${
                  showHelp
                    ? "bg-alloro-orange text-white"
                    : "bg-alloro-bg text-slate-400 hover:text-alloro-orange hover:bg-alloro-orange/5"
                }`}
              >
                <HelpCircle size={14} /> {showHelp ? "Close" : "Ask Question"}
              </button>
            )}
          </div>

          {showHelp ? (
            <div
              className="animate-in fade-in slide-in-from-top-2 duration-300 py-4 space-y-4 border-t border-black/5 mt-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative">
                <textarea
                  autoFocus
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Ask your strategist a question..."
                  className="w-full h-24 bg-alloro-bg border border-black/5 rounded-2xl px-5 py-4 text-alloro-navy font-bold text-sm focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/5 transition-all resize-none"
                />
                <button
                  onClick={handleHelpSubmit}
                  disabled={!comment.trim() || sent}
                  className="absolute bottom-4 right-4 p-2.5 bg-alloro-navy text-white rounded-xl shadow-lg hover:bg-black transition-all active:scale-95 disabled:opacity-30"
                >
                  {sent ? <CheckCircle2 size={16} /> : <Send size={16} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-tight">
                We'll get back to you shortly.
              </p>
            </div>
          ) : (
            <>
              {task.description && (
                <div>
                  <p
                    ref={descriptionRef}
                    className={`text-[16px] leading-relaxed font-bold tracking-tight transition-all ${
                      isDone ? "opacity-30" : "text-slate-500"
                    } ${!isExpanded ? "line-clamp-2" : ""} ${
                      isClamped ? "cursor-pointer hover:opacity-80" : ""
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isClamped && onExpand) onExpand();
                    }}
                  >
                    {parseHighlightTags(task.description, "underline")}
                  </p>
                  {isClamped && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onExpand) onExpand();
                      }}
                      className="text-xs text-alloro-orange hover:text-blue-700 font-bold mt-2 uppercase tracking-widest"
                    >
                      {isExpanded ? "Show less" : "Read more"}
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-10 gap-y-3 pt-6 border-t border-black/5 text-[10px] font-black text-alloro-textDark/30 uppercase tracking-[0.2em]">
                <span className="flex items-center gap-2.5">
                  <Clock size={16} className="text-alloro-orange/40" />{" "}
                  {isDone && task.completed_at
                    ? `Done: ${formatDate(task.completed_at)}`
                    : task.due_date
                    ? `Due: ${formatDate(task.due_date)}`
                    : `Due: ${formatDate(task.created_at)}`}
                </span>
                <span className="flex items-center gap-2.5">
                  <Users size={16} className="text-alloro-orange/40" />{" "}
                  {task.agent_type || "User"}
                </span>
                <div className="flex items-center gap-2">
                  <Layout size={14} className="opacity-40" />
                  <span className="text-slate-500">{task.category}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
