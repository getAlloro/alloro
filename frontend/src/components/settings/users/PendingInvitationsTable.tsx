import { motion } from "framer-motion";
import { Clock, RefreshCw } from "lucide-react";
import type { PendingInvitation } from "../../../api/settingsUsers";

export type PendingInvitationsTableProps = {
  invitations: PendingInvitation[];
  canInvite: boolean;
  resendingInvitationId: number | null;
  onResend: (invitationId: number) => void;
};

export function PendingInvitationsTable({
  invitations,
  canInvite,
  resendingInvitationId,
  onResend,
}: PendingInvitationsTableProps) {
  if (invitations.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.16, duration: 0.2 }}
      aria-labelledby="pending-invitations-heading"
      className="overflow-hidden rounded-[2rem] border border-line-soft bg-alloro-surface shadow-premium"
    >
      <div className="flex items-center gap-3 border-b border-line-soft px-5 py-4">
        <div className="rounded-xl bg-amber-soft p-2 text-amber">
          <Clock className="h-4 w-4" />
        </div>
        <div>
          <h3
            id="pending-invitations-heading"
            className="font-display text-lg font-medium tracking-tight text-alloro-navy"
          >
            Pending Invitations
          </h3>
          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-ink-muted">
            Invitations awaiting acceptance
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[40%]" />
            <col className="w-[24%]" />
            <col className="w-[22%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead className="bg-alloro-navy/[0.025]">
            <tr className="border-b border-line-soft">
              {[
                ["Email", "text-left"],
                ["Role", "text-left"],
                ["Expires", "text-left"],
                ["Actions", "text-right"],
              ].map(([label, align]) => (
                <th
                  key={label}
                  scope="col"
                  className={`whitespace-nowrap px-5 py-3 font-mono-display text-[9px] font-black uppercase tracking-[0.18em] text-alloro-navy/40 ${align}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {invitations.map((invitation, index) => {
              const isResending = resendingInvitationId === invitation.id;
              return (
                <tr
                  key={invitation.id}
                  className={`transition-colors hover:bg-accent-soft/45 ${
                    index % 2 === 0 ? "bg-alloro-surface" : "bg-alloro-navy/[0.015]"
                  }`}
                >
                  <td className="px-5 py-4">
                    <div
                      className="truncate whitespace-nowrap text-[12px] font-black text-alloro-navy"
                      title={invitation.email}
                    >
                      {invitation.email}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-amber/20 bg-amber-soft px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.11em] text-alloro-navy/70">
                      <Clock className="h-3 w-3 text-amber" />
                      {invitation.role} pending
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-muted tabular-nums">
                    {new Date(invitation.expires_at).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right">
                    {canInvite && (
                      <button
                        type="button"
                        disabled={isResending}
                        onClick={() => onResend(invitation.id)}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-alloro-orange transition hover:bg-alloro-orange/10 focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3 w-3 ${isResending ? "animate-spin" : ""}`} />
                        {isResending ? "Sending..." : "Resend"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}
