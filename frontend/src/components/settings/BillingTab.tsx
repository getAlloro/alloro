/**
 * BillingTab Component
 *
 * Displays subscription billing information in the Settings page.
 * Shows current plan, payment details, invoice history, and billing management.
 *
 * Handles four states:
 * 1. Paid subscription (Stripe active) — show plan + details + manage button
 * 2. Cancelling (cancel_at_period_end) — show plan + cancellation warning
 * 3. Admin-granted (no Stripe) — show subscribe CTA
 * 4. Locked out — show urgent payment CTA
 */

import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CreditCard,
  Crown,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Globe,
  BarChart3,
  FileText,
  Users,
  Lock,
  ExternalLink,
  Tag,
  Receipt,
  XCircle,
} from "lucide-react";
import {
  getBillingStatus,
  getBillingDetails,
  createCheckoutSession,
  createPortalSession,
  type BillingStatus,
  type BillingDetails,
} from "../../api/billing";
import { showWarningToast } from "../../lib/toast";

// ─── Plan Details (Single Product) ───

const PLAN = {
  name: "Alloro Intelligence",
  features: [
    { icon: BarChart3, label: "Practice rankings tracking" },
    { icon: FileText, label: "Task management" },
    { icon: Users, label: "Team collaboration" },
    { icon: Zap, label: "AI-powered insights" },
    { icon: Globe, label: "AI-powered website builder" },
    { icon: Crown, label: "Custom domain support" },
  ],
};

// ─── Card brand display names ───

const CARD_BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
};

export const BillingTab: React.FC = () => {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [details, setDetails] = useState<BillingDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();

  // Handle ?cancelled=true → show warning toast + clean URL
  useEffect(() => {
    if (searchParams.get("cancelled") === "true") {
      showWarningToast(
        "Payment interrupted",
        "Your checkout was cancelled. You can try again anytime."
      );
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Handle billing success (legacy param from Stripe success_url)
  useEffect(() => {
    if (searchParams.get("billing") === "success") {
      fetchData();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchData = async () => {
    try {
      const [statusResult, detailsResult] = await Promise.allSettled([
        getBillingStatus(),
        getBillingDetails(),
      ]);

      if (statusResult.status === "fulfilled" && statusResult.value?.success === true) {
        setBilling(statusResult.value);
      }
      if (detailsResult.status === "fulfilled" && detailsResult.value?.success === true) {
        setDetails(detailsResult.value);
      }
    } catch (err) {
      console.error("Failed to fetch billing data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckout = async () => {
    setIsCheckoutLoading(true);
    try {
      const response = await createCheckoutSession("DFY");
      if (response.success && response.url) {
        window.location.href = response.url;
      }
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsPortalLoading(true);
    try {
      const response = await createPortalSession();
      if (response.success && response.url) {
        window.location.href = response.url;
      }
    } catch (err) {
      console.error("Portal error:", err);
    } finally {
      setIsPortalLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-[2rem] border border-black/5 p-4 sm:p-6 lg:p-8 shadow-premium animate-pulse">
          <div className="h-6 w-48 bg-slate-100 rounded mb-4" />
          <div className="h-4 w-72 bg-slate-100 rounded mb-8" />
          <div className="h-48 bg-slate-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  const isAdminGranted = billing?.isAdminGranted ?? false;
  const hasStripe = billing?.hasStripeSubscription ?? false;
  const isLockedOut = billing?.isLockedOut ?? false;
  const isCancelled = billing?.subscriptionStatus === "cancelled";
  const isCancellingAtPeriodEnd =
    hasStripe && (billing?.cancelAtPeriodEnd || details?.cancelAtPeriodEnd);

  return (
    <div className="space-y-8" data-wizard-target="settings-billing">
      {/* Locked Out Banner */}
      {isLockedOut && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 rounded-2xl p-4 sm:p-6 flex items-start gap-4"
        >
          <div className="p-2 bg-red-100 rounded-xl shrink-0">
            <Lock size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="text-red-900 font-bold text-sm">
              Account Locked
            </h3>
            <p className="text-red-700 text-sm mt-1">
              Your account has been locked. Please add a payment method to
              restore full access to the application.
            </p>
          </div>
        </motion.div>
      )}

      {/* Admin-Granted Banner */}
      {isAdminGranted && !isLockedOut && !isCancelled && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-6 flex items-start gap-4"
        >
          <div className="p-2 bg-amber-100 rounded-xl shrink-0">
            <AlertTriangle size={20} className="text-amber-600" />
          </div>
          <div>
            <h3 className="text-amber-900 font-bold text-sm">
              Payment Method Required
            </h3>
            <p className="text-amber-700 text-sm mt-1">
              Add a payment method to ensure uninterrupted access to Alloro.
            </p>
          </div>
        </motion.div>
      )}

      {/* Cancelled — pending period end */}
      {isCancellingAtPeriodEnd && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 rounded-2xl p-4 sm:p-6 flex items-start gap-4"
        >
          <div className="p-2 bg-red-100 rounded-xl shrink-0">
            <XCircle size={20} className="text-red-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-red-900 font-bold text-sm">
              Subscription Cancelled
            </h3>
            <p className="text-red-700 text-sm mt-1">
              Your subscription has been cancelled. You still have access until{" "}
              <strong>
                {billing?.currentPeriodEnd
                  ? new Date(billing.currentPeriodEnd).toLocaleDateString(
                      "en-US",
                      { month: "long", day: "numeric", year: "numeric" }
                    )
                  : "the end of your billing period"}
              </strong>
              .
            </p>
            <button
              onClick={handleManageSubscription}
              disabled={isPortalLoading}
              className="mt-3 px-4 py-2 bg-alloro-orange text-white text-xs font-bold rounded-lg hover:bg-alloro-orange/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {isPortalLoading ? "Opening..." : "Resume Subscription"}
            </button>
          </div>
        </motion.div>
      )}

      {/* Plan Card — subscribed vs cancelled vs unsubscribed */}
      {hasStripe ? (
        /* ── Active Subscription Card ── */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[2rem] border border-black/5 shadow-premium relative overflow-hidden"
        >
          {/* Orange header strip */}
          <div className="bg-alloro-orange px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 bg-white/[0.08] rounded-full blur-3xl -mr-36 -mt-36 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/[0.04] rounded-full blur-2xl -ml-24 -mb-24 pointer-events-none" />

            <div className="relative z-10 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/20 flex items-center justify-center">
                    <Crown size={18} className="text-white" />
                  </div>
                  {isCancellingAtPeriodEnd ? (
                    <div className="px-2.5 py-1 bg-red-500/40 border border-red-300/40 rounded-full flex items-center gap-1.5">
                      <XCircle size={12} className="text-white" />
                      <span className="text-white text-[10px] font-black uppercase tracking-wider">
                        Cancelled
                      </span>
                    </div>
                  ) : (
                    <div className="px-2.5 py-1 bg-white/20 border border-white/25 rounded-full flex items-center gap-1.5">
                      <CheckCircle2 size={12} className="text-white" />
                      <span className="text-white text-[10px] font-black uppercase tracking-wider">
                        Active
                      </span>
                    </div>
                  )}
                </div>
                <h3 className="font-display text-lg sm:text-xl lg:text-2xl font-medium text-white tracking-tight mb-0.5">
                  {PLAN.name}
                </h3>
                <p className="text-white/60 text-sm font-medium">
                  {isCancellingAtPeriodEnd
                    ? `Access until ${billing?.currentPeriodEnd ? new Date(billing.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "end of billing period"}`
                    : "Your active subscription"}
                </p>
              </div>

              {billing?.currentPeriodEnd && (
                <p className="text-white/40 text-xs font-medium mt-1 text-right">
                  {isCancellingAtPeriodEnd ? "Ends" : "Renews"}{" "}
                  {new Date(billing.currentPeriodEnd).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", year: "numeric" }
                  )}
                </p>
              )}
            </div>
          </div>

          {/* White body with details */}
          <div className="bg-white px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 pt-4 sm:pt-6 relative space-y-6">
            {/* Payment method + coupon row */}
            {(details?.paymentMethod || details?.discount) && (
              <div className="flex flex-wrap items-center gap-4">
                {details.paymentMethod && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-black/5">
                    <CreditCard size={14} className="text-slate-400" />
                    <span className="text-sm text-slate-600 font-medium">
                      {CARD_BRANDS[details.paymentMethod.brand] || details.paymentMethod.brand} ending in {details.paymentMethod.last4}
                    </span>
                    <span className="text-xs text-slate-400">
                      {String(details.paymentMethod.expMonth).padStart(2, "0")}/{details.paymentMethod.expYear}
                    </span>
                  </div>
                )}
                {details.discount && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-xl border border-green-200">
                    <Tag size={14} className="text-green-600" />
                    <span className="text-sm text-green-700 font-medium">
                      {details.discount.couponName}
                      {details.discount.percentOff
                        ? ` (${details.discount.percentOff}% off)`
                        : details.discount.amountOff
                          ? ` ($${details.discount.amountOff} off)`
                          : ""}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Features grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {PLAN.features.map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.04 }}
                  className="flex items-center gap-2.5 group"
                >
                  <div className="w-7 h-7 rounded-lg bg-alloro-orange/[0.07] flex items-center justify-center shrink-0 group-hover:bg-alloro-orange/15 transition-colors">
                    <feature.icon
                      size={14}
                      className="text-alloro-orange"
                    />
                  </div>
                  <span className="text-sm text-slate-600 font-medium">
                    {feature.label}
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="pt-4 border-t border-black/5">
              <button
                onClick={handleManageSubscription}
                disabled={isPortalLoading}
                className="px-5 py-2.5 bg-alloro-navy text-white rounded-xl text-sm font-bold hover:bg-alloro-navy/90 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <CreditCard size={16} />
                {isPortalLoading ? "Opening..." : "Manage Subscription"}
              </button>
            </div>
          </div>
        </motion.div>
      ) : isCancelled ? (
        /* ── Cancelled State Card ── */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2rem] border border-black/5 shadow-premium relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-slate-200/30 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />

          <div className="relative z-10 p-4 sm:p-6 lg:p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                <XCircle size={22} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-display text-lg sm:text-xl lg:text-2xl font-medium text-alloro-navy tracking-tight mb-0.5">
                  Subscription Cancelled
                </h3>
                <p className="text-slate-400 text-sm font-medium">
                  {details?.canceledAt
                    ? `Cancelled on ${new Date(details.canceledAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
                    : "Your subscription is no longer active"}
                </p>
              </div>
            </div>

            <p className="text-slate-500 text-sm mb-6">
              Subscribe again to restore full access to {PLAN.name} and all its features.
            </p>

            <button
              onClick={handleCheckout}
              disabled={isCheckoutLoading}
              className="px-6 py-3 bg-gradient-to-r from-alloro-orange to-[#c45a47] text-white rounded-xl text-sm font-bold hover:shadow-xl hover:shadow-alloro-orange/30 hover:-translate-y-0.5 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <CreditCard size={16} />
              {isCheckoutLoading ? "Processing..." : "Subscribe Again"}
            </button>
          </div>
        </motion.div>
      ) : (
        /* ── Subscribe CTA Card ── */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2rem] border border-black/5 shadow-premium relative overflow-hidden group"
        >
          {/* Dual glow orbs */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-alloro-orange/[0.04] rounded-full blur-3xl -mr-36 -mt-36 pointer-events-none group-hover:bg-alloro-orange/[0.08] transition-all duration-700" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-alloro-orange/[0.02] rounded-full blur-2xl -ml-24 -mb-24 pointer-events-none group-hover:bg-alloro-orange/[0.05] transition-all duration-700" />

          <div className="relative z-10 p-4 sm:p-6 lg:p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-alloro-orange to-[#c45a47] flex items-center justify-center shadow-lg shadow-alloro-orange/20 shrink-0">
                <Zap size={22} className="text-white" />
              </div>
              <div>
                <h3 className="font-display text-lg sm:text-xl lg:text-2xl font-medium text-alloro-navy tracking-tight mb-0.5">
                  Get Started with Alloro
                </h3>
                <p className="text-slate-400 text-sm font-medium">
                  Subscribe to unlock the full platform
                </p>
              </div>
            </div>

            <div className="px-3 py-1.5 bg-alloro-orange/[0.07] rounded-lg w-fit mb-6">
              <span className="text-alloro-orange font-black text-[10px] tracking-[0.15em] uppercase">
                {PLAN.name}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-8">
              {PLAN.features.map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.04 }}
                  className="flex items-center gap-2.5"
                >
                  <div className="w-7 h-7 rounded-lg bg-alloro-orange/[0.07] flex items-center justify-center shrink-0">
                    <feature.icon
                      size={14}
                      className="text-alloro-orange"
                    />
                  </div>
                  <span className="text-sm text-slate-600 font-medium">
                    {feature.label}
                  </span>
                </motion.div>
              ))}
            </div>

            <button
              onClick={handleCheckout}
              disabled={isCheckoutLoading}
              className="px-6 py-3 bg-gradient-to-r from-alloro-orange to-[#c45a47] text-white rounded-xl text-sm font-bold hover:shadow-xl hover:shadow-alloro-orange/30 hover:-translate-y-0.5 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <CreditCard size={16} />
              {isCheckoutLoading ? "Processing..." : "Add Payment Method"}
            </button>
          </div>
        </motion.div>
      )}

      {/* Invoice History */}
      {details && details.invoices.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-[2rem] border border-black/5 p-4 sm:p-6 lg:p-8 shadow-premium"
        >
          <div className="flex items-center gap-2.5 mb-5">
            <Receipt size={18} className="text-alloro-navy/40" />
            <h3 className="text-lg font-black text-alloro-navy tracking-tight">
              Payment History
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-black/5">
                  <th className="text-[10px] font-black text-slate-400 uppercase tracking-widest pb-3 pr-4">
                    Date
                  </th>
                  <th className="text-[10px] font-black text-slate-400 uppercase tracking-widest pb-3 pr-4">
                    Amount
                  </th>
                  <th className="text-[10px] font-black text-slate-400 uppercase tracking-widest pb-3 pr-4">
                    Status
                  </th>
                  <th className="text-[10px] font-black text-slate-400 uppercase tracking-widest pb-3 pr-4">
                    Coupon
                  </th>
                  <th className="text-[10px] font-black text-slate-400 uppercase tracking-widest pb-3">
                    Invoice
                  </th>
                </tr>
              </thead>
              <tbody>
                {details.invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-black/[0.03] last:border-0"
                  >
                    <td className="py-3 pr-4 text-sm text-slate-600 font-medium">
                      {new Date(invoice.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 pr-4 text-sm text-alloro-navy font-bold">
                      ${invoice.amount.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          invoice.status === "paid"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : invoice.status === "open"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-sm text-slate-500">
                      {invoice.coupon || "—"}
                    </td>
                    <td className="py-3">
                      {invoice.hostedInvoiceUrl ? (
                        <a
                          href={invoice.hostedInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-alloro-orange hover:text-alloro-orange/80 transition-colors inline-flex items-center gap-1"
                        >
                          <ExternalLink size={12} />
                          <span className="text-xs font-bold">View</span>
                        </a>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
};
