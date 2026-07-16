import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, UserPlus, X } from "lucide-react";
import type { UserRole } from "../../../api/settingsUsers";
import { UserRoleSelect } from "./UserRoleSelect";

export type InviteMemberModalProps = {
  isOpen: boolean;
  roleOptions: UserRole[];
  isManager: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onInvite: (email: string, role: UserRole) => Promise<void>;
};

export function InviteMemberModal({
  isOpen,
  roleOptions,
  isManager,
  isSubmitting,
  onClose,
  onInvite,
}: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>(roleOptions[0] ?? "viewer");
  const reduceMotion = useReducedMotion();

  const resetAndClose = () => {
    if (isSubmitting) return;
    setEmail("");
    setRole(roleOptions[0] ?? "viewer");
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isSubmitting) return;
      setEmail("");
      setRole(roleOptions[0] ?? "viewer");
      onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, isSubmitting, onClose, roleOptions]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onInvite(email.trim(), role);
      setEmail("");
      setRole(roleOptions[0] ?? "viewer");
    } catch {
      // The owner reports mutation errors through the shared toast.
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label="Close invite member modal"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 cursor-default bg-alloro-navy/60 backdrop-blur-sm"
            onClick={resetAndClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-member-title"
            aria-describedby="invite-member-description"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
            className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-line-soft bg-alloro-surface shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-line-soft px-7 py-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="shrink-0 rounded-xl bg-alloro-orange/10 p-2.5 text-alloro-orange">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3
                    id="invite-member-title"
                    className="font-display text-lg font-medium tracking-tight text-alloro-navy"
                  >
                    Invite Team Member
                  </h3>
                  <p
                    id="invite-member-description"
                    className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-muted"
                  >
                    Send organization access by email
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                aria-label="Close"
                onClick={resetAndClose}
                className="rounded-xl p-2 text-ink-muted transition hover:bg-alloro-navy/5 hover:text-alloro-navy focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="p-7">
              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="invite-member-email"
                    className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-alloro-navy"
                  >
                    Email address
                  </label>
                  <input
                    id="invite-member-email"
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="colleague@example.com"
                    className="w-full rounded-xl border border-line-medium bg-alloro-surface px-4 py-3 text-[13px] font-bold text-alloro-navy outline-none transition placeholder:text-ink-muted/60 focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/10"
                  />
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-alloro-navy">
                    Role
                  </p>
                  <UserRoleSelect
                    value={role}
                    options={roleOptions}
                    onChange={setRole}
                    ariaLabel="Invitation role"
                    placement="invite"
                    fullWidth
                  />
                  {isManager && (
                    <p className="mt-2.5 text-[10px] font-bold text-ink-muted">
                      Managers can invite Viewers and Managers only.
                    </p>
                  )}
                </div>
              </div>

              <footer className="mt-7 flex flex-col-reverse justify-end gap-3 border-t border-line-soft pt-5 sm:flex-row">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={resetAndClose}
                  className="whitespace-nowrap rounded-xl px-5 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-ink-muted transition hover:bg-alloro-navy/5 hover:text-alloro-navy focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || email.trim().length === 0}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-alloro-orange px-5 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-lg transition hover:bg-alloro-orange/90 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? "Sending..." : "Send invitation"}
                </button>
              </footer>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
