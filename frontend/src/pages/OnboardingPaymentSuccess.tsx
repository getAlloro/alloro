/**
 * Onboarding Payment Success Page
 *
 * Users land here after completing Stripe Checkout during onboarding.
 * Polls billing status to confirm the webhook has processed,
 * then marks onboarding as complete and redirects to the dashboard.
 */

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { getBillingStatus } from "../api/billing";
import onboarding from "../api/onboarding";
import { getErrorMessage } from "../lib/errorMessage";

const MAX_POLL_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 2000;

type PageState = "verifying" | "completing" | "success" | "timeout";

export default function OnboardingPaymentSuccess() {
  const [pageState, setPageState] = useState<PageState>("verifying");
  const [error, setError] = useState<string | null>(null);
  const pollCount = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    pollBillingStatus();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const pollBillingStatus = () => {
    timerRef.current = setInterval(async () => {
      pollCount.current += 1;

      try {
        const status = await getBillingStatus();

        if (status.hasStripeSubscription && status.subscriptionStatus === "active") {
          // Webhook has fired, subscription is active
          if (timerRef.current) clearInterval(timerRef.current);
          await completeAndRedirect();
          return;
        }
      } catch {
        // Ignore individual poll failures, keep retrying
      }

      if (pollCount.current >= MAX_POLL_ATTEMPTS) {
        if (timerRef.current) clearInterval(timerRef.current);
        setPageState("timeout");
      }
    }, POLL_INTERVAL_MS);
  };

  const completeAndRedirect = async () => {
    setPageState("completing");

    try {
      await onboarding.completeOnboarding();

      setPageState("success");
      // Brief pause to show success state, then redirect
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1500);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Something went wrong");
      setPageState("timeout");
    }
  };

  const handleRetry = async () => {
    setPageState("verifying");
    setError(null);
    pollCount.current = 0;

    try {
      const status = await getBillingStatus();
      if (status.hasStripeSubscription && status.subscriptionStatus === "active") {
        await completeAndRedirect();
        return;
      }
    } catch {
      // fall through to show timeout again
    }

    setPageState("timeout");
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen font-body relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(214, 104, 83, 0.08) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(214, 104, 83, 0.05) 0%, transparent 40%), #F3F4F6",
      }}
    >
      <div className="text-center space-y-8 max-w-md px-4">
        {/* Verifying / Completing */}
        {(pageState === "verifying" || pageState === "completing") && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="space-y-6"
          >
            <div className="w-20 h-20 mx-auto">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-full h-full rounded-2xl bg-gradient-to-br from-alloro-orange to-[#c45a47] flex items-center justify-center shadow-lg shadow-alloro-orange/30"
              >
                <Loader2 className="w-10 h-10 text-white" />
              </motion.div>
            </div>
            <h1 className="text-3xl font-bold font-heading text-alloro-navy tracking-tight">
              {pageState === "verifying"
                ? "Processing your payment..."
                : "Setting up your account..."}
            </h1>
            <p className="text-slate-500">This will only take a moment</p>
          </motion.div>
        )}

        {/* Success */}
        {pageState === "success" && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="space-y-6"
          >
            <div className="w-20 h-20 mx-auto rounded-2xl bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold font-heading text-alloro-navy tracking-tight">
              You're all set!
            </h1>
            <p className="text-slate-500">Redirecting to your dashboard...</p>
          </motion.div>
        )}

        {/* Timeout / Error */}
        {pageState === "timeout" && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="space-y-6"
          >
            <div className="w-20 h-20 mx-auto rounded-2xl bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-amber-600" />
            </div>
            <h1 className="text-3xl font-bold font-heading text-alloro-navy tracking-tight">
              Payment received
            </h1>
            <p className="text-slate-500">
              {error ||
                "We're still setting up your account. This can take a few moments."}
            </p>
            <button
              onClick={handleRetry}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-alloro-orange to-[#c45a47] text-white font-semibold hover:shadow-lg hover:shadow-alloro-orange/30 hover:-translate-y-0.5 transition-all"
            >
              Continue to Dashboard
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
