/**
 * Onboarding Payment Cancelled Page
 *
 * Users land here when they cancel/exit Stripe Checkout during onboarding.
 * They can retry the subscription or continue into the app without paying —
 * the dashboard's amber top-bar banner nudges them to subscribe later.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { XCircle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import onboarding from "../api/onboarding";
import { getErrorMessage } from "../lib/errorMessage";
import { isPilotSession } from "../api";

export default function OnboardingPaymentCancelled() {
  const navigate = useNavigate();
  const [isSkipping, setIsSkipping] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);

  const handleTryAgain = () => {
    navigate("/new-account-onboarding");
  };

  const handleLinkLater = async () => {
    setSkipError(null);
    setIsSkipping(true);
    try {
      await onboarding.completeOnboarding();
      if (!isPilotSession()) {
        localStorage.setItem("onboardingCompleted", "true");
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setSkipError(
        getErrorMessage(err) || "Something went wrong. Please try again."
      );
      setIsSkipping(false);
    }
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
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="space-y-6"
        >
          <div className="w-20 h-20 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center">
            <XCircle className="w-10 h-10 text-slate-400" />
          </div>
          <h1 className="text-3xl font-bold font-heading text-alloro-navy tracking-tight">
            Payment Cancelled
          </h1>
          <p className="text-slate-500">
            No worries — you can subscribe whenever you're ready. Head into the
            app now or try again.
          </p>
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={handleTryAgain}
              disabled={isSkipping}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-alloro-orange to-[#c45a47] text-white font-semibold hover:shadow-lg hover:shadow-alloro-orange/30 hover:-translate-y-0.5 transition-all flex items-center gap-2 mx-auto disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              <ArrowLeft size={18} />
              Try Again
            </button>
            <button
              onClick={handleLinkLater}
              disabled={isSkipping}
              className="text-sm text-alloro-orange hover:text-alloro-orange/80 transition-colors disabled:opacity-50"
            >
              {isSkipping ? "Finishing..." : "I'll link my card later"}
            </button>
            {skipError && (
              <p className="text-sm text-red-600">{skipError}</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
