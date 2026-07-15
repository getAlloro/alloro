import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CreditCard, Loader2, RotateCcw } from "lucide-react";
import { ApiError } from "../../api";
import {
  getLocationAddQuote,
  createPortalSession,
  type AddLocationQuote,
} from "../../api/billing";
import {
  cancelLocation,
  reopenLocation,
  type Location,
} from "../../api/locations";
import { formatCents } from "./billingFormat";
import { showErrorToast, showSuccessToast } from "../../lib/toast";
import { logger } from "../../lib/logger";

/**
 * Cancel / Reopen dialogs for the Properties tab location lifecycle.
 *
 * Cancel: end-of-period semantics with an explicit warning when it is the
 * last active location (that ends the whole subscription — owner decision).
 * Reopen (pending): free undo. Reopen (cancelled): paid re-add — shows the
 * prorated quote and charges on confirm, mirroring the add-location consent.
 */

interface LifecycleDialogProps {
  target: Location | null;
  activeCount: number;
  onClose: () => void;
  onCompleted: () => void | Promise<void>;
}

const modalShell = (children: React.ReactNode, onBackdrop: () => void) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-alloro-navy/50 backdrop-blur-sm"
      onClick={onBackdrop}
    />
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      transition={{ type: "spring", duration: 0.3 }}
      className="relative bg-white rounded-[28px] shadow-2xl w-full max-w-md overflow-hidden"
    >
      {children}
    </motion.div>
  </div>
);

export const CancelLocationDialog: React.FC<LifecycleDialogProps> = ({
  target,
  activeCount,
  onClose,
  onCompleted,
}) => {
  const [quote, setQuote] = useState<AddLocationQuote | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (!target) return;
    setQuote(null);
    getLocationAddQuote()
      .then(setQuote)
      .catch((err) => logger.error("Cancel dialog quote failed:", err));
  }, [target]);

  if (!target) return null;
  const isLast = activeCount <= 1;
  const periodEndLabel = quote?.periodEnd
    ? new Date(quote.periodEnd).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "the end of your current billing period";
  const loweredTotal =
    quote?.mode === "quantity" &&
    quote.unitAmount != null &&
    quote.currentQuantity != null
      ? Math.max(quote.currentQuantity - 1, 0) * quote.unitAmount
      : null;

  const handleConfirm = async () => {
    setIsWorking(true);
    try {
      const result = await cancelLocation(target.id);
      showSuccessToast(
        result.billing.action === "subscription_ending"
          ? "Subscription ending"
          : "Cancellation scheduled",
        result.billing.effectiveAt
          ? `${target.name} stays active until ${new Date(result.billing.effectiveAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. You can reopen it before then at no charge.`
          : `${target.name} has been cancelled. Its data is retained and it can be reopened.`
      );
      await onCompleted();
      onClose();
    } catch (err) {
      showErrorToast(
        "Couldn't cancel location",
        err instanceof Error ? err.message : "Please try again."
      );
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <AnimatePresence>
      {modalShell(
        <div className="p-8">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={18} className="text-amber-500" />
            <h3 className="font-display text-lg font-medium text-alloro-navy tracking-tight">
              Cancel {target.name}?
            </h3>
          </div>
          <div className="text-slate-500 text-sm space-y-3 mt-4">
            <p>
              The location stays fully active until{" "}
              <strong className="text-alloro-navy">{periodEndLabel}</strong>.
              Until then you can reopen it at no charge. After that it is
              marked cancelled — all of its data is kept and it can be
              reopened any time.
            </p>
            {isLast ? (
              <p className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
                This is your <strong>only active location</strong> — cancelling
                it ends your Alloro subscription on {periodEndLabel}.
              </p>
            ) : (
              loweredTotal != null && (
                <p>
                  Your monthly total drops to{" "}
                  <strong className="text-alloro-navy">
                    {formatCents(loweredTotal, quote?.currency ?? null)}/mo
                  </strong>{" "}
                  from the next billing period.
                </p>
              )
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              disabled={isWorking}
              className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
            >
              Keep location
            </button>
            <button
              onClick={handleConfirm}
              disabled={isWorking}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {isWorking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Cancelling...
                </>
              ) : isLast ? (
                "Cancel location & end subscription"
              ) : (
                "Cancel location"
              )}
            </button>
          </div>
        </div>,
        () => !isWorking && onClose()
      )}
    </AnimatePresence>
  );
};

export const ReopenLocationDialog: React.FC<LifecycleDialogProps> = ({
  target,
  onClose,
  onCompleted,
}) => {
  const [quote, setQuote] = useState<AddLocationQuote | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string } | null>(
    null
  );

  const isPaidReopen = target?.status === "cancelled";

  useEffect(() => {
    if (!target) return;
    setError(null);
    setQuote(null);
    if (target.status === "cancelled") {
      setIsQuoteLoading(true);
      getLocationAddQuote()
        .then(setQuote)
        .catch((err) => logger.error("Reopen dialog quote failed:", err))
        .finally(() => setIsQuoteLoading(false));
    }
  }, [target]);

  if (!target) return null;

  const handleOpenPortal = async () => {
    setIsPortalLoading(true);
    try {
      const response = await createPortalSession();
      if (response.success && response.url) {
        window.location.href = response.url;
        return;
      }
    } catch (err) {
      logger.error("Portal error:", err);
    } finally {
      setIsPortalLoading(false);
    }
  };

  const handleConfirm = async () => {
    setIsWorking(true);
    setError(null);
    try {
      const result = await reopenLocation(target.id, {
        expectedNewMonthlyTotal: isPaidReopen
          ? (quote?.newMonthlyTotal ?? null)
          : null,
      });
      const charged = result.billing.chargedNow;
      showSuccessToast(
        "Location reopened",
        charged != null && charged > 0
          ? `${target.name} is active again — ${formatCents(charged, quote?.currency ?? null)} charged for the remainder of this period.`
          : `${target.name} is active again.`
      );
      await onCompleted();
      onClose();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError({
        code,
        message:
          err instanceof Error && err.message
            ? err.message
            : "Something went wrong. Please try again.",
      });
    } finally {
      setIsWorking(false);
    }
  };

  const isPaymentError =
    error?.code === "PAYMENT_FAILED" || error?.code === "NO_PAYMENT_METHOD";

  return (
    <AnimatePresence>
      {modalShell(
        <div className="p-8">
          <div className="flex items-center gap-2 mb-1">
            <RotateCcw size={18} className="text-alloro-orange" />
            <h3 className="font-display text-lg font-medium text-alloro-navy tracking-tight">
              Reopen {target.name}?
            </h3>
          </div>
          <div className="text-slate-500 text-sm space-y-3 mt-4">
            {!isPaidReopen ? (
              <p>
                This cancels the scheduled removal — the location simply stays
                active. You already paid for the current period, so there is{" "}
                <strong className="text-alloro-navy">no charge</strong>.
              </p>
            ) : isQuoteLoading ? (
              <div className="flex items-center justify-center py-6 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : quote?.mode === "quantity" ? (
              <>
                <p>Reopening adds this location back to your subscription:</p>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-slate-500">New monthly total</span>
                    <span className="font-bold text-alloro-navy">
                      {quote.newMonthlyTotal != null
                        ? `${formatCents(quote.newMonthlyTotal, quote.currency)}/mo`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-slate-500">Due today (prorated)</span>
                    <span className="font-bold text-alloro-orange">
                      {quote.proratedChargeNow != null
                        ? formatCents(quote.proratedChargeNow, quote.currency)
                        : "Calculated at payment"}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <p>
                Reopening makes this location active again. No charge applies
                for your account.
              </p>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-2">
                <p className="text-sm text-red-700">{error.message}</p>
                {isPaymentError && (
                  <button
                    onClick={handleOpenPortal}
                    disabled={isPortalLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-alloro-navy rounded-lg hover:bg-alloro-navy/90 transition-colors disabled:opacity-50"
                  >
                    <CreditCard size={12} />
                    {isPortalLoading ? "Opening..." : "Update payment method"}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              disabled={isWorking}
              className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
            >
              Not now
            </button>
            <button
              onClick={handleConfirm}
              disabled={isWorking || (isPaidReopen && isQuoteLoading)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-alloro-orange rounded-xl hover:bg-alloro-orange/90 transition-colors disabled:opacity-50"
            >
              {isWorking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Reopening...
                </>
              ) : isPaidReopen &&
                quote?.mode === "quantity" &&
                quote.proratedChargeNow != null ? (
                `Reopen & Pay ${formatCents(quote.proratedChargeNow, quote.currency)}`
              ) : (
                "Reopen location"
              )}
            </button>
          </div>
        </div>,
        () => !isWorking && onClose()
      )}
    </AnimatePresence>
  );
};
