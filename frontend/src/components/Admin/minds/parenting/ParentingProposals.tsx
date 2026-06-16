import { useState, useEffect } from "react";
import {
  Check,
  X,
  Loader2,
  Sparkles,
  Undo2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { ActionButton } from "../../../ui/DesignSystem";
import { getErrorMessage } from "../../../../lib/errorMessage";
import {
  getParentingProposals,
  updateParentingProposal,
  startParentingCompile,
  type SyncProposal,
  type ParentingSession,
} from "../../../../api/minds";

interface ParentingProposalsProps {
  mindId: string;
  mindName: string;
  sessionId: string;
  proposals: SyncProposal[];
  onProposalsChange: (proposals: SyncProposal[]) => void;
  onSessionUpdate: (session: ParentingSession) => void;
  onComplete: () => void;
  apiGetProposals?: (mindId: string, sessionId: string) => Promise<SyncProposal[]>;
  apiUpdateProposal?: (mindId: string, sessionId: string, proposalId: string, status: "approved" | "rejected" | "pending") => Promise<boolean>;
  // runId/autoCompleted are optional because this component is reused for skill-upgrade
  // compiles too, whose endpoint returns { success } (no runId). The original `any` hid this.
  apiStartCompile?: (mindId: string, sessionId: string) => Promise<{ runId?: string; autoCompleted?: boolean; success?: boolean } | null>;
}

function ProposalDiff({ proposal }: { proposal: SyncProposal }) {
  const [expanded, setExpanded] = useState(false);

  if (proposal.type === "NEW") {
    return (
      <div className="mt-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-medium text-green-400 hover:text-green-300 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Hide" : "Show"} new content
        </button>
        {expanded && (
          <div className="mt-2 rounded-xl bg-green-500/10 border border-green-500/20 p-4 text-xs text-green-300 font-mono whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
            {proposal.proposed_text}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "Hide" : "Show"} diff
      </button>
      {expanded && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          {proposal.target_excerpt && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-1.5">
                Will Forget
              </p>
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {proposal.target_excerpt}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-green-400 mb-1.5">
              Will Learn
            </p>
            <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3 text-xs text-green-300 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {proposal.proposed_text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ParentingProposals({
  mindId,
  mindName,
  sessionId,
  proposals: initialProposals,
  onProposalsChange,
  onSessionUpdate,
  onComplete,
  apiGetProposals,
  apiUpdateProposal,
  apiStartCompile,
}: ParentingProposalsProps) {
  const [proposals, setProposals] = useState<SyncProposal[]>(initialProposals);
  const [loading, setLoading] = useState(initialProposals.length === 0);
  const [compileStarting, setCompileStarting] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);

  useEffect(() => {
    if (initialProposals.length === 0) {
      fetchProposals();
    }
  }, []);

  const fetchProposals = async () => {
    setLoading(true);
    const doGet = apiGetProposals || getParentingProposals;
    const data = await doGet(mindId, sessionId);
    setProposals(data);
    onProposalsChange(data);
    setLoading(false);
  };

  const handleProposalAction = async (
    proposalId: string,
    action: "approved" | "rejected" | "pending"
  ) => {
    setActioningId(proposalId);
    const doUpdate = apiUpdateProposal || updateParentingProposal;
    const ok = await doUpdate(mindId, sessionId, proposalId, action);
    if (ok) {
      const updated = proposals.map((p) =>
        p.id === proposalId ? { ...p, status: action } : p
      );
      setProposals(updated);
      onProposalsChange(updated);
    } else {
      toast.error("Failed to update proposal");
    }
    setActioningId(null);
  };

  const handleBulkApprove = async () => {
    setBulkApproving(true);
    const doUpdate = apiUpdateProposal || updateParentingProposal;
    const pending = proposals.filter((p) => p.status === "pending");
    for (const p of pending) {
      await doUpdate(mindId, sessionId, p.id, "approved");
    }
    const updated = proposals.map((p) =>
      p.status === "pending" ? { ...p, status: "approved" as const } : p
    );
    setProposals(updated);
    onProposalsChange(updated);
    toast.success(`${pending.length} proposals approved`);
    setBulkApproving(false);
  };

  const handleCompile = async () => {
    setCompileStarting(true);
    try {
      const doCompile = apiStartCompile || startParentingCompile;
      const result = await doCompile(mindId, sessionId);
      if (!result) {
        toast.error("Failed to start compile");
        return;
      }
      if (result.autoCompleted) {
        toast.success("All proposals were rejected — session complete.");
        onComplete();
        return;
      }
      // Transition to compiling
      onSessionUpdate({
        id: sessionId,
        mind_id: mindId,
        status: "compiling",
        result: null,
        title: null,
        knowledge_buffer: "",
        sync_run_id: result.runId ?? null,
        admin_id: null,
        created_at: "",
        updated_at: "",
      });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to start compile");
    } finally {
      setCompileStarting(false);
    }
  };

  const totalCount = proposals.length;
  const pendingCount = proposals.filter((p) => p.status === "pending").length;
  const approvedCount = proposals.filter((p) => p.status === "approved").length;
  const rejectedCount = proposals.filter((p) => p.status === "rejected").length;
  const reviewedCount = approvedCount + rejectedCount;
  const canCompile = pendingCount === 0 && approvedCount > 0;
  const progressPct = totalCount > 0 ? (reviewedCount / totalCount) * 100 : 0;

  if (loading) {
    return (
      <div className="liquid-glass rounded-xl p-8 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#6a6a75]" />
      </div>
    );
  }

  return (
    <div className="liquid-glass rounded-xl p-6">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-base font-semibold text-[#eaeaea]">
          What {mindName} picked up
        </h3>
        <p className="text-sm text-[#6a6a75] mt-1">
          Review what was extracted from your conversation. Approve or reject each item.
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-[#a0a0a8]">
            {reviewedCount} of {totalCount} reviewed
          </span>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-green-400 font-semibold">
              {approvedCount} approved
            </span>
            <span className="text-red-400 font-semibold">
              {rejectedCount} rejected
            </span>
            {pendingCount > 0 && (
              <span className="text-amber-400 font-semibold">
                {pendingCount} pending
              </span>
            )}
          </div>
        </div>
        <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progressPct}%`,
              background:
                progressPct === 100
                  ? "linear-gradient(90deg, #22c55e, #16a34a)"
                  : "linear-gradient(90deg, #D66853, #f59e0b)",
            }}
          />
        </div>
      </div>

      {/* Bulk actions */}
      {pendingCount > 0 && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={handleBulkApprove}
            disabled={bulkApproving}
            className="flex items-center gap-1.5 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
          >
            {bulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {bulkApproving ? "Approving..." : `Approve all ${pendingCount} pending`}
          </button>
        </div>
      )}

      {/* Proposal Cards */}
      <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1 minds-chat-scrollbar">
        {proposals.map((proposal) => (
          <div
            key={proposal.id}
            className={`rounded-2xl border p-5 transition-all ${
              proposal.status === "approved"
                ? "border-green-500/20 bg-green-500/5"
                : proposal.status === "rejected"
                  ? "border-red-500/20 bg-red-500/5 opacity-70"
                  : "border-white/8 bg-white/[0.03]"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                      proposal.type === "NEW"
                        ? "bg-green-500/15 text-green-400"
                        : proposal.type === "UPDATE"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {proposal.type}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-[#eaeaea] leading-snug">
                  {proposal.summary}
                </h4>
                <p className="text-xs text-[#6a6a75] mt-1 leading-relaxed">
                  {proposal.reason}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {proposal.status === "pending" && (
                  <>
                    <button
                      onClick={() => handleProposalAction(proposal.id, "approved")}
                      disabled={actioningId === proposal.id}
                      className="flex items-center gap-1.5 rounded-xl bg-green-500/10 border border-green-500/20 px-3 py-2 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                    >
                      {actioningId === proposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Approve
                    </button>
                    <button
                      onClick={() => handleProposalAction(proposal.id, "rejected")}
                      disabled={actioningId === proposal.id}
                      className="flex items-center gap-1.5 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      {actioningId === proposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      Reject
                    </button>
                  </>
                )}
                {proposal.status === "approved" && (
                  <>
                    <span className="flex items-center gap-1 text-xs font-semibold text-green-400">
                      <Check className="h-3.5 w-3.5" />
                      Approved
                    </span>
                    <button
                      onClick={() => handleProposalAction(proposal.id, "pending")}
                      disabled={actioningId === proposal.id}
                      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-[#6a6a75] hover:text-[#a0a0a8] hover:bg-white/[0.05] transition-colors disabled:opacity-50"
                      title="Undo"
                    >
                      {actioningId === proposal.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                      Undo
                    </button>
                  </>
                )}
                {proposal.status === "rejected" && (
                  <>
                    <span className="flex items-center gap-1 text-xs font-semibold text-red-400">
                      <X className="h-3.5 w-3.5" />
                      Rejected
                    </span>
                    <button
                      onClick={() => handleProposalAction(proposal.id, "pending")}
                      disabled={actioningId === proposal.id}
                      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-[#6a6a75] hover:text-[#a0a0a8] hover:bg-white/[0.05] transition-colors disabled:opacity-50"
                      title="Undo"
                    >
                      {actioningId === proposal.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                      Undo
                    </button>
                  </>
                )}
              </div>
            </div>

            <ProposalDiff proposal={proposal} />
          </div>
        ))}
      </div>

      {/* Submit button */}
      <div className="mt-6 flex items-center justify-between">
        <div />
        <ActionButton
          label="Remember"
          icon={<Sparkles className="h-4 w-4" />}
          onClick={handleCompile}
          variant="primary"
          disabled={!canCompile}
          loading={compileStarting}
        />
      </div>

      {!canCompile && proposals.length > 0 && (
        <p className="mt-2 text-right text-xs text-[#6a6a75]">
          {pendingCount > 0
            ? `${pendingCount} proposals still need review`
            : "Approve at least one proposal to compile"}
        </p>
      )}
    </div>
  );
}
