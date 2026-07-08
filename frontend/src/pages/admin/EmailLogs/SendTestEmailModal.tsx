import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Send, X, Check, AlertCircle, Loader2 } from "lucide-react";
import { backdropVariants, modalVariants } from "../../../lib/animations";
import { adminSendTestEmail } from "../../../api/email-logs";
import { ActionButton } from "../../../components/ui/DesignSystem";

interface SendTestEmailModalProps {
  onClose: () => void;
  onSent: () => void;
}

type ModalState =
  | { phase: "input" }
  | { phase: "sending" }
  | { phase: "success"; transport: string; messageId: string }
  | { phase: "error"; message: string };

export default function SendTestEmailModal({
  onClose,
  onSent,
}: SendTestEmailModalProps) {
  const [recipient, setRecipient] = useState("");
  const [state, setState] = useState<ModalState>({ phase: "input" });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim());

  async function handleSend() {
    if (!isValid) return;
    setState({ phase: "sending" });
    try {
      const result = await adminSendTestEmail(recipient.trim());
      setState({
        phase: "success",
        transport: result.transport,
        messageId: result.messageId,
      });
      onSent();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to send test email";
      setState({ phase: "error", message: msg });
    }
  }

  return (
    <motion.div
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        variants={modalVariants}
        role="dialog"
        aria-modal="true"
        aria-label="Send test email"
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-alloro-navy text-white">
            <Mail className="h-4 w-4" />
          </div>
          <h2 className="flex-1 text-sm font-semibold text-alloro-textDark">
            Send Test Email
          </h2>
          <button
            type="button"
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {state.phase === "success" ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-sm font-medium text-gray-800">
                Test email sent via{" "}
                <span className="font-semibold">{state.transport}</span>
              </p>
              <p className="text-xs text-gray-500">
                Check the Email Logs table for the new row. It should also
                arrive at{" "}
                <span className="font-medium">{recipient.trim()}</span>.
              </p>
              <ActionButton
                label="Close"
                onClick={onClose}
                variant="secondary"
                size="sm"
              />
            </div>
          ) : state.phase === "error" ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <p className="text-sm font-medium text-red-700">
                {state.message}
              </p>
              <ActionButton
                label="Try again"
                onClick={() => setState({ phase: "input" })}
                variant="secondary"
                size="sm"
              />
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-gray-600">
                Send a test email to verify the active transport is working.
                The result will appear in the logs below.
              </p>
              <label
                htmlFor="test-email-recipient"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Recipient
              </label>
              <input
                id="test-email-recipient"
                type="email"
                placeholder="you@example.com"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && isValid) handleSend();
                }}
                disabled={state.phase === "sending"}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-alloro-navy focus:ring-1 focus:ring-alloro-navy disabled:opacity-50"
                autoFocus
              />
              <div className="mt-4 flex justify-end gap-2">
                <ActionButton
                  label="Cancel"
                  onClick={onClose}
                  variant="secondary"
                  size="sm"
                  disabled={state.phase === "sending"}
                />
                <ActionButton
                  label={state.phase === "sending" ? "Sending..." : "Send"}
                  icon={
                    state.phase === "sending" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )
                  }
                  onClick={handleSend}
                  size="sm"
                  disabled={!isValid || state.phase === "sending"}
                />
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
