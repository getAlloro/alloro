import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Loader2,
  MessageSquare,
  Clock,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useConfirm } from "../../ui/ConfirmModal";
import { ActionButton } from "../../ui/DesignSystem";
import { ParentingChat } from "./parenting/ParentingChat";
import { ParentingProposals } from "./parenting/ParentingProposals";
import { ParentingReadingView } from "./parenting/ParentingReadingView";
import { CompileAnimation } from "./wizard/CompileAnimation";
import { getErrorMessage } from "../../../lib/errorMessage";
import {
  createSkillUpgradeSession,
  listSkillUpgradeSessions,
  getSkillUpgradeSession,
  abandonSkillUpgradeSession,
  deleteSkillUpgradeSession,
  getSkillUpgradeCompileStatus,
  updateSkillUpgradeSession,
  sendSkillUpgradeChatStream,
  triggerSkillUpgradeReadingStream,
  getSkillUpgradeProposals,
  updateSkillUpgradeProposal,
  startSkillUpgradeCompile,
  type SkillUpgradeSession,
  type SkillUpgradeMessage,
  type SyncProposal,
  type ParentingMessage,
  type ParentingSession,
} from "../../../api/minds";

interface SkillUpgradeTabProps {
  mindId: string;
  mindName: string;
  skillId: string;
  skillName: string;
}

type View = "list" | "session";

const STATUS_LABELS: Record<SkillUpgradeSession["status"], string> = {
  chatting: "Chatting",
  reading: "Reading",
  proposals: "Reviewing",
  compiling: "Compiling",
  completed: "Completed",
  abandoned: "Abandoned",
};

const DARK_PILL_STYLES: Record<SkillUpgradeSession["status"], string> = {
  chatting: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  reading: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  proposals: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  compiling: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  completed: "bg-green-500/15 text-green-400 border-green-500/25",
  abandoned: "bg-slate-500/15 text-slate-400 border-slate-500/25",
};

function DarkPill({ label, status }: { label: string; status: SkillUpgradeSession["status"] }) {
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${DARK_PILL_STYLES[status]}`}
    >
      {label}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/** Adapt SkillUpgradeMessage to ParentingMessage shape for reused components */
function toParentingMessage(msg: SkillUpgradeMessage): ParentingMessage {
  return {
    id: msg.id,
    session_id: msg.session_id,
    role: msg.role,
    content: msg.content,
    created_at: msg.created_at,
  };
}

export function SkillUpgradeTab({ mindId, skillId, skillName }: SkillUpgradeTabProps) {
  const confirm = useConfirm();
  const [view, setView] = useState<View>("list");
  const [sessions, setSessions] = useState<SkillUpgradeSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [creatingSession, setCreatingSession] = useState(false);

  // Active session state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SkillUpgradeSession | null>(null);
  const [messages, setMessages] = useState<ParentingMessage[]>([]);
  const [proposals, setProposals] = useState<SyncProposal[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);

  // Inline title editing
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");

  // Curried API callbacks that bind skillId for reused parenting components
  const wrappedSendChat = useCallback(
    (_mindId: string, sessionId: string, message: string) =>
      sendSkillUpgradeChatStream(mindId, skillId, sessionId, message),
    [mindId, skillId]
  );

  const wrappedTriggerReading = useCallback(
    (_mindId: string, sessionId: string) =>
      triggerSkillUpgradeReadingStream(mindId, skillId, sessionId),
    [mindId, skillId]
  );

  const wrappedGetProposals = useCallback(
    (_mindId: string, sessionId: string) =>
      getSkillUpgradeProposals(mindId, skillId, sessionId),
    [mindId, skillId]
  );

  const wrappedUpdateProposal = useCallback(
    (_mindId: string, sessionId: string, proposalId: string, status: "approved" | "rejected" | "pending") =>
      updateSkillUpgradeProposal(mindId, skillId, sessionId, proposalId, status),
    [mindId, skillId]
  );

  const wrappedStartCompile = useCallback(
    (_mindId: string, _sessionId: string) =>
      startSkillUpgradeCompile(mindId, skillId, _sessionId),
    [mindId, skillId]
  );

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    const data = await listSkillUpgradeSessions(mindId, skillId);
    setSessions(data);
    setLoadingSessions(false);
  }, [mindId, skillId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleNewSession = async () => {
    setCreatingSession(true);
    try {
      const result = await createSkillUpgradeSession(mindId, skillId);
      if (result) {
        setActiveSessionId(result.session.id);
        setActiveSession(result.session);
        setMessages([
          {
            id: crypto.randomUUID(),
            session_id: result.session.id,
            role: "assistant",
            content: result.greeting,
            created_at: new Date().toISOString(),
          },
        ]);
        setProposals([]);
        setView("session");
      } else {
        toast.error("Failed to create session");
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to create session");
    } finally {
      setCreatingSession(false);
    }
  };

  const handleOpenSession = async (sessionId: string) => {
    setLoadingSession(true);
    setActiveSessionId(sessionId);
    setView("session");
    try {
      const details = await getSkillUpgradeSession(mindId, skillId, sessionId);
      if (details) {
        setActiveSession(details.session);
        setMessages(details.messages.map(toParentingMessage));
        setProposals(details.proposals || []);
      } else {
        toast.error("Session not found");
        setView("list");
      }
    } catch {
      toast.error("Failed to load session");
      setView("list");
    } finally {
      setLoadingSession(false);
    }
  };

  const handleBackToList = () => {
    setView("list");
    setActiveSessionId(null);
    setActiveSession(null);
    setMessages([]);
    setProposals([]);
    fetchSessions();
  };

  const handleAbandon = async () => {
    if (!activeSessionId) return;
    const ok = await confirm({
      title: "Abandon this session?",
      message: "The skill won't learn anything from it.",
      confirmLabel: "Abandon",
      variant: "danger",
    });
    if (!ok) return;
    const abandoned = await abandonSkillUpgradeSession(mindId, skillId, activeSessionId);
    if (abandoned) {
      toast.success("Session abandoned");
      handleBackToList();
    } else {
      toast.error("Failed to abandon session");
    }
  };

  const handleSessionStatusChange = (session: ParentingSession) => {
    // Adapt back to SkillUpgradeSession shape
    setActiveSession((prev) =>
      prev ? { ...prev, status: session.status } : null
    );
  };

  const handleProposalsLoaded = (p: SyncProposal[]) => {
    setProposals(p);
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({ title: "Delete this session?", message: "This cannot be undone.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;
    const deleted = await deleteSkillUpgradeSession(mindId, skillId, sessionId);
    if (deleted) {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      toast.success("Session deleted");
    } else {
      toast.error("Failed to delete session");
    }
  };

  const handleSaveTitle = async (sessionId: string) => {
    if (!editingTitleValue.trim()) {
      setEditingTitleId(null);
      return;
    }
    const ok = await updateSkillUpgradeSession(mindId, skillId, sessionId, {
      title: editingTitleValue.trim(),
    });
    if (ok) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, title: editingTitleValue.trim() } : s
        )
      );
    }
    setEditingTitleId(null);
  };

  const handleNewMessage = (msg: ParentingMessage) => {
    setMessages((prev) => [...prev, msg]);
  };

  // --- Session View ---

  if (view === "session") {
    if (loadingSession) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-[#6a6a75]" />
        </div>
      );
    }

    if (!activeSession) return null;

    const isReadOnly = ["completed", "abandoned"].includes(activeSession.status);
    const showChat = ["chatting", "completed", "abandoned"].includes(activeSession.status);
    const showReading = activeSession.status === "reading";
    const showProposals = activeSession.status === "proposals";
    const showCompiling = activeSession.status === "compiling";

    return (
      <div className="space-y-4">
        {/* Session header */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleBackToList}
            className="flex items-center gap-1.5 text-sm text-[#6a6a75] hover:text-[#eaeaea] transition-colors"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back to sessions
          </button>
          <div className="flex items-center gap-3">
            <DarkPill
              label={STATUS_LABELS[activeSession.status]}
              status={activeSession.status}
            />
            {activeSession.status === "chatting" && (
              <button
                onClick={handleAbandon}
                className="text-xs text-[#6a6a75] hover:text-red-400 transition-colors"
              >
                Abandon
              </button>
            )}
          </div>
        </div>

        {/* Chat view */}
        {showChat && (
          <ParentingChat
            mindId={mindId}
            sessionId={activeSession.id}
            messages={messages}
            onNewMessage={handleNewMessage}
            readOnly={isReadOnly}
            onTriggerReading={() => {
              setActiveSession({ ...activeSession, status: "reading" });
            }}
            sendChatStream={wrappedSendChat}
          />
        )}

        {/* Reading state */}
        {showReading && (
          <ParentingReadingView
            mindId={mindId}
            mindName={skillName}
            sessionId={activeSession.id}
            onComplete={async (proposalCount) => {
              if (proposalCount === 0) {
                toast.success("No new knowledge found — session complete!");
              }
              const details = await getSkillUpgradeSession(mindId, skillId, activeSession.id);
              if (details) {
                setActiveSession(details.session);
                setMessages(details.messages.map(toParentingMessage));
                setProposals(details.proposals || []);
              }
            }}
            onError={(error) => {
              toast.error(error || "Reading failed");
              getSkillUpgradeSession(mindId, skillId, activeSession.id).then((details) => {
                if (details) {
                  setActiveSession(details.session);
                  setMessages(details.messages.map(toParentingMessage));
                }
              });
            }}
            triggerReadingStream={wrappedTriggerReading}
          />
        )}

        {/* Proposals view */}
        {showProposals && (
          <ParentingProposals
            mindId={mindId}
            mindName={skillName}
            sessionId={activeSession.id}
            proposals={proposals}
            onProposalsChange={handleProposalsLoaded}
            onSessionUpdate={handleSessionStatusChange}
            onComplete={handleBackToList}
            apiGetProposals={wrappedGetProposals}
            apiUpdateProposal={wrappedUpdateProposal}
            apiStartCompile={wrappedStartCompile}
          />
        )}

        {/* Compiling view */}
        {showCompiling && (
          <SkillUpgradeCompileView
            mindId={mindId}
            skillId={skillId}
            skillName={skillName}
            sessionId={activeSession.id}
            onComplete={() => {
              setActiveSession({ ...activeSession, status: "completed" });
              toast.success(`${skillName} neuron upgraded!`);
            }}
          />
        )}
      </div>
    );
  }

  // --- Sessions List View ---

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-semibold text-[#eaeaea]">
            Upgrade Sessions
          </h3>
          <p className="text-sm text-[#6a6a75] mt-1">
            Teach {skillName}'s neuron directly through conversation.
          </p>
        </div>
        <ActionButton
          label="New Session"
          icon={<Plus className="h-4 w-4" />}
          onClick={handleNewSession}
          variant="primary"
          loading={creatingSession}
        />
      </div>

      {/* Sessions grid */}
      {loadingSessions ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[#6a6a75]" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="liquid-glass rounded-xl p-12 text-center">
          <MessageSquare className="h-12 w-12 text-[#2a2a2a] mx-auto mb-4" />
          <h3 className="text-sm font-semibold text-[#6a6a75] mb-2">
            No upgrade sessions yet
          </h3>
          <p className="text-xs text-[#6a6a75] mb-6 max-w-sm mx-auto">
            Start an upgrade session to teach {skillName} something new — changes go directly to its neuron.
          </p>
          <ActionButton
            label="Start First Session"
            icon={<Plus className="h-4 w-4" />}
            onClick={handleNewSession}
            variant="primary"
            loading={creatingSession}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {sessions.map((session) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="group liquid-glass rounded-xl p-4 cursor-pointer hover:border-alloro-orange/30 transition-colors border border-transparent"
                onClick={() => handleOpenSession(session.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <DarkPill
                    label={STATUS_LABELS[session.status]}
                    status={session.status}
                  />
                  <span className="text-[10px] text-[#6a6a75]">
                    {timeAgo(session.created_at)}
                  </span>
                </div>

                {/* Title — editable inline */}
                <div className="mb-2 min-h-[1.5rem]">
                  {editingTitleId === session.id ? (
                    <input
                      type="text"
                      value={editingTitleValue}
                      onChange={(e) => setEditingTitleValue(e.target.value)}
                      onBlur={() => handleSaveTitle(session.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveTitle(session.id);
                        if (e.key === "Escape") setEditingTitleId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      maxLength={100}
                      className="w-full bg-transparent border-b border-alloro-orange/40 text-sm font-medium text-[#eaeaea] outline-none placeholder:text-[#6a6a75]"
                      placeholder="Name this session..."
                    />
                  ) : (
                    <p
                      className="text-sm font-medium text-[#eaeaea] truncate hover:text-alloro-orange/80 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTitleId(session.id);
                        setEditingTitleValue(session.title || "");
                      }}
                      title={session.title || "Click to name this session"}
                    >
                      {session.title || (
                        <span className="text-[#6a6a75] italic text-xs">Untitled session</span>
                      )}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-[#6a6a75]">
                  <Clock className="h-3 w-3" />
                  <span>
                    {session.result === "learned"
                      ? "Neuron upgraded"
                      : session.result === "no_changes"
                        ? "No new knowledge"
                        : session.result === "all_rejected"
                          ? "All proposals rejected"
                          : session.status === "abandoned"
                            ? "Session abandoned"
                            : "In progress"}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <button
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="rounded-lg p-1.5 text-[#6a6a75] hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete session"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ChevronRight className="h-4 w-4 text-[#6a6a75]" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// --- Compile View Sub-Component ---

function SkillUpgradeCompileView({
  mindId,
  skillId,
  skillName,
  sessionId,
  onComplete,
}: {
  mindId: string;
  skillId: string;
  skillName: string;
  sessionId: string;
  onComplete: () => void;
}) {
  useEffect(() => {
    const poll = setInterval(async () => {
      if (document.hidden) return;
      try {
        const data = await getSkillUpgradeCompileStatus(mindId, skillId, sessionId);
        if (data?.status === "completed") {
          clearInterval(poll);
          onComplete();
        }
      } catch {
        // Silently retry
      }
    }, 2000);

    return () => clearInterval(poll);
  }, [mindId, skillId, sessionId, onComplete]);

  return (
    <div className="liquid-glass rounded-xl p-8">
      <div className="text-center mb-4">
        <h3 className="text-base font-semibold text-[#eaeaea]">
          Upgrading neuron...
        </h3>
        <p className="text-sm text-[#6a6a75] mt-1">
          {skillName} is absorbing the new knowledge into its neuron.
        </p>
      </div>
      <CompileAnimation />
    </div>
  );
}
