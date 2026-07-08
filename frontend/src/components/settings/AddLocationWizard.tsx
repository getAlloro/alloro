import React, { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  CreditCard,
  Loader2,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { apiGet, ApiError } from "../../api";
import {
  getLocationAddQuote,
  createPortalSession,
  type AddLocationQuote,
} from "../../api/billing";
import { purchaseLocation } from "../../api/locations";
import {
  PropertySelectionModal,
  type PropertyItem,
} from "./PropertySelectionModal";
import { formatCents } from "./PlanLocationSummary";
import { showErrorToast, showSuccessToast } from "../../lib/toast";
import { logger } from "../../lib/logger";

/**
 * AddLocationWizard — the client add-location flow with payment consent:
 *   1. name  → 2. GBP profile (picker excludes already-linked profiles)
 *   → 3. billing review (quote: per-location price, current → new total,
 *        prorated charge today) → confirm → charge → location created.
 *
 * The location is created only after the charge succeeds ("create after
 * paid") — a declined card leaves nothing behind. Flat-rate / admin-managed
 * orgs see a no-charge summary and confirm without payment.
 */

type WizardStep = "name" | "gbp" | "review";

interface PurchaseError {
  code?: string;
  message: string;
}

interface AddLocationWizardProps {
  open: boolean;
  onClose: () => void;
  onCompleted: () => void | Promise<void>;
}

export const AddLocationWizard: React.FC<AddLocationWizardProps> = ({
  open,
  onClose,
  onCompleted,
}) => {
  const [step, setStep] = useState<WizardStep>("name");
  const [name, setName] = useState("");
  const [selectedGbp, setSelectedGbp] = useState<PropertyItem | null>(null);
  const [availableGBP, setAvailableGBP] = useState<PropertyItem[]>([]);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [quote, setQuote] = useState<AddLocationQuote | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [error, setError] = useState<PurchaseError | null>(null);

  const reset = useCallback(() => {
    setStep("name");
    setName("");
    setSelectedGbp(null);
    setQuote(null);
    setError(null);
  }, []);

  const close = useCallback(() => {
    if (isPurchasing) return;
    reset();
    onClose();
  }, [isPurchasing, onClose, reset]);

  const fetchAvailableGBP = useCallback(async () => {
    setIsLoadingAvailable(true);
    setAvailableGBP([]);
    try {
      const data = await apiGet({ path: "/settings/properties/available/gbp" });
      if (data?.success) setAvailableGBP(data.properties);
    } catch (err) {
      logger.error("Failed to fetch available GBP properties:", err);
      showErrorToast(
        "Couldn't load GBP profiles",
        "Please try again in a moment."
      );
    } finally {
      setIsLoadingAvailable(false);
    }
  }, []);

  const loadQuote = useCallback(async () => {
    setIsQuoteLoading(true);
    setError(null);
    try {
      setQuote(await getLocationAddQuote());
    } catch (err) {
      logger.error("Failed to load billing quote:", err);
      setError({
        code: err instanceof ApiError ? err.code : undefined,
        message:
          err instanceof Error && err.message
            ? err.message
            : "Couldn't load the billing summary. Please try again.",
      });
    } finally {
      setIsQuoteLoading(false);
    }
  }, []);

  const handleNameSubmit = async () => {
    if (!name.trim()) return;
    setStep("gbp");
    await fetchAvailableGBP();
  };

  const handleGbpSelected = async (item: PropertyItem) => {
    setSelectedGbp(item);
    setStep("review");
    await loadQuote();
  };

  const handleOpenPortal = async () => {
    setIsPortalLoading(true);
    try {
      const response = await createPortalSession();
      if (response.success && response.url) {
        window.location.href = response.url;
        return;
      }
      showErrorToast("Couldn't open billing portal", response.error || "");
    } catch (err) {
      logger.error("Portal error:", err);
    } finally {
      setIsPortalLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedGbp || isPurchasing) return;
    setIsPurchasing(true);
    setError(null);
    try {
      const result = await purchaseLocation({
        name: name.trim(),
        gbp: {
          accountId: selectedGbp.accountId ?? "",
          locationId: selectedGbp.locationId ?? "",
          displayName: selectedGbp.name,
        },
        expectedNewMonthlyTotal: quote?.newMonthlyTotal ?? null,
      });

      const charged = result.billing.chargedNow;
      showSuccessToast(
        "Location added",
        charged != null && charged > 0
          ? `${formatCents(charged, result.billing.currency)} charged for the remainder of this billing period.`
          : `${name.trim()} is now active.`
      );
      await onCompleted();
      reset();
      onClose();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Please try again.";
      logger.error("Purchase location failed:", err);

      if (code === "QUOTE_STALE") {
        showErrorToast(
          "Billing amounts changed",
          "Review the updated summary and confirm again."
        );
        await loadQuote();
      } else if (code === "GBP_ALREADY_LINKED") {
        setError({ code, message });
        setStep("gbp");
        await fetchAvailableGBP();
      } else {
        setError({ code, message });
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const isPaymentError =
    error?.code === "PAYMENT_FAILED" || error?.code === "NO_PAYMENT_METHOD";
  const confirmLabel =
    quote?.mode === "quantity"
      ? quote.proratedChargeNow != null && quote.proratedChargeNow > 0
        ? `Confirm & Pay ${formatCents(quote.proratedChargeNow, quote.currency)}`
        : "Confirm & Pay"
      : "Confirm & Add Location";

  return (
    <>
      {/* Step 1 — location name */}
      <AnimatePresence>
        {open && step === "name" && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-alloro-navy/50 backdrop-blur-sm"
              onClick={close}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative bg-white rounded-[28px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-8">
                <h3 className="font-display text-lg font-medium text-alloro-navy tracking-tight mb-1">
                  Add New Location
                </h3>
                <p className="text-slate-400 text-sm mb-6">
                  Enter the name for your new location
                </p>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleNameSubmit();
                  }}
                  placeholder="e.g. Downtown Office"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-alloro-navy font-semibold focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange"
                />
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={close}
                    className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleNameSubmit}
                    disabled={!name.trim()}
                    className="px-5 py-2.5 text-sm font-bold text-white bg-alloro-orange rounded-xl hover:bg-alloro-orange/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next: Select GBP
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Step 2 — GBP profile (already-linked profiles are excluded server-side) */}
      <PropertySelectionModal
        isOpen={open && step === "gbp"}
        onClose={close}
        title={`Select GBP for "${name}"`}
        items={availableGBP}
        onSelect={handleGbpSelected}
        isLoading={isLoadingAvailable}
        isSaving={false}
        type="gbp"
        multiSelect={false}
      />

      {/* Step 3 — billing review + confirm */}
      <AnimatePresence>
        {open && step === "review" && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-alloro-navy/50 backdrop-blur-sm"
              onClick={close}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative bg-white rounded-[28px] shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-8">
                <h3 className="font-display text-lg font-medium text-alloro-navy tracking-tight mb-1">
                  Review & Confirm
                </h3>
                <p className="text-slate-400 text-sm mb-6">
                  Check the billing summary before your new location goes live
                </p>

                {isQuoteLoading ? (
                  <div className="flex items-center justify-center py-10 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* What's being added */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-alloro-orange" />
                        <p className="text-sm font-bold text-alloro-navy">
                          {name}
                        </p>
                      </div>
                      {selectedGbp && (
                        <p className="text-xs text-slate-500 pl-6">
                          GBP: {selectedGbp.name}
                        </p>
                      )}
                    </div>

                    {/* Billing summary by mode */}
                    {quote?.mode === "quantity" ? (
                      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                        <div className="flex justify-between px-4 py-2.5 text-sm">
                          <span className="text-slate-500">Per location</span>
                          <span className="font-semibold text-alloro-navy">
                            {quote.unitAmount != null
                              ? `${formatCents(quote.unitAmount, quote.currency)}/mo`
                              : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between px-4 py-2.5 text-sm">
                          <span className="text-slate-500">
                            Current ({quote.currentQuantity}{" "}
                            {quote.currentQuantity === 1
                              ? "location"
                              : "locations"}
                            )
                          </span>
                          <span className="font-semibold text-alloro-navy">
                            {quote.currentMonthlyTotal != null
                              ? `${formatCents(quote.currentMonthlyTotal, quote.currency)}/mo`
                              : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between px-4 py-2.5 text-sm bg-alloro-orange/[0.04]">
                          <span className="font-bold text-alloro-navy">
                            New total ({quote.newQuantity}{" "}
                            {quote.newQuantity === 1 ? "location" : "locations"})
                          </span>
                          <span className="font-bold text-alloro-navy">
                            {quote.newMonthlyTotal != null
                              ? `${formatCents(quote.newMonthlyTotal, quote.currency)}/mo`
                              : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between px-4 py-2.5 text-sm">
                          <span className="text-slate-500">Due today (prorated)</span>
                          <span className="font-bold text-alloro-orange">
                            {quote.proratedChargeNow != null
                              ? formatCents(
                                  quote.proratedChargeNow,
                                  quote.currency
                                )
                              : "Calculated at payment"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-600">
                        {quote?.mode === "flat_rate"
                          ? "Your plan is flat-rate — adding this location doesn't change your monthly bill."
                          : quote?.mode === "unavailable"
                            ? "Billing for this account is managed outside this environment. The location will be added without a charge."
                            : "Your billing is managed by Alloro — no charge will be made today."}
                      </div>
                    )}

                    {quote?.mode === "quantity" && (
                      <p className="text-xs text-slate-400 flex items-start gap-1.5">
                        <ShieldCheck size={14} className="shrink-0 mt-0.5" />
                        Today's charge covers the remainder of the current
                        billing period on your card on file.
                        {quote.periodEnd
                          ? ` Your new monthly total starts ${new Date(quote.periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
                          : ""}
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
                            {isPortalLoading
                              ? "Opening..."
                              : "Update payment method"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 mt-6">
                  <button
                    onClick={() => setStep("gbp")}
                    disabled={isPurchasing}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <ArrowLeft size={14} />
                    Back
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={close}
                      disabled={isPurchasing}
                      className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirm}
                      disabled={isPurchasing || isQuoteLoading || !quote}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-alloro-orange rounded-xl hover:bg-alloro-orange/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isPurchasing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        confirmLabel
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
