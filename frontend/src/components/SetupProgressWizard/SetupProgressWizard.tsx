import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, X, Info } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSetupProgressSafe } from "./SetupProgressContext";
import { useIsWizardActive } from "../../contexts/OnboardingWizardContext";
import { useAuth } from "../../hooks/useAuth";
import { useLabels } from "../../hooks/useLabels";

export function SetupProgressWizard() {
  const context = useSetupProgressSafe();
  const navigate = useNavigate();
  const location = useLocation();
  const isOnboardingWizardActive = useIsWizardActive();
  const { onboardingCompleted } = useAuth();
  const labels = useLabels();
  const [isExpanded, setIsExpanded] = useState(false);

  // Clear the justCompletedStep after confetti fires (confetti is now handled in context)
  useEffect(() => {
    if (context?.justCompletedStep) {
      const timer = setTimeout(() => {
        context.clearJustCompleted();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [context?.justCompletedStep, context?.clearJustCompleted]);

  const handleIconClick = () => {
    setIsExpanded(!isExpanded);
  };

  // Navigate to settings/integrations
  const goToIntegrations = () => {
    setIsExpanded(false);
    navigate("/settings/integrations");
  };

  // Navigate to referrals hub with scroll flag
  const goToReferralsHub = () => {
    setIsExpanded(false);
    sessionStorage.setItem("scrollToUpload", "true");
    navigate("/pmsStatistics");
  };

  // Don't render if context not available or wizard is completed
  if (!context) return null;

  const { progress } = context;

  // Don't show if all steps completed
  if (progress.completed) return null;

  // Don't show while the 22-step onboarding wizard is active
  if (isOnboardingWizardActive) return null;

  // Don't show during the 3-step onboarding flow (when user hasn't completed initial onboarding)
  if (onboardingCompleted === false) return null;

  // Don't show on sign in or onboarding pages
  const hiddenPaths = ["/signin", "/new-account-onboarding", "/admin"];
  if (hiddenPaths.some((path) => location.pathname.startsWith(path))) {
    return null;
  }

  const steps = [
    {
      number: 1,
      title: "Connect Google Business Profile",
      completed: progress.step1_api_connected,
      link: "Go to Settings",
      onClick: goToIntegrations,
    },
    {
      number: 2,
      title: "Upload your PMS data",
      completed: progress.step2_pms_uploaded,
      link: `Go to ${labels.hubReferrals}`,
      onClick: goToReferralsHub,
    },
  ];

  return (
    <>
      {/* Floating Icon - entire container floats together */}
      {/* Mobile: bottom-right, Desktop: top-right */}
      <div className="fixed right-4 bottom-4 md:right-6 md:bottom-auto md:top-6 z-[75] flex items-center gap-3 animate-[float_3s_ease-in-out_infinite]">
        {/* Tooltip - always visible unless dropdown is open */}
        <AnimatePresence>
          {!isExpanded && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="relative bg-white rounded-lg px-3 py-2 border border-slate-200"
            >
              <p className="text-xs text-alloro-orange font-jakarta whitespace-nowrap flex items-center gap-1.5">
                <Info size={12} className="shrink-0" />
                Pick up where you left off
              </p>
              {/* Arrow pointing right */}
              <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[6px] border-l-white"></div>
              <div className="absolute right-[-7px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent border-l-[7px] border-l-slate-200 -z-10"></div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Icon Button Container */}
        <div className="relative">
          <motion.button
            onClick={handleIconClick}
            className="relative w-14 h-14 rounded-full bg-white overflow-hidden focus:outline-none focus:ring-2 focus:ring-alloro-orange focus:ring-offset-2 shadow-[0_10px_25px_-5px_rgba(234,88,12,0.35)]"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <img
              src="/logo.png"
              alt="Alloro"
              className="w-full h-full object-cover"
            />
          </motion.button>
          {/* Progress indicator badge - positioned outside the button */}
          {!progress.completed && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-alloro-orange rounded-full border-2 border-white flex items-center justify-center">
              <span className="text-[10px] font-jakarta text-white">
                {steps.filter((s) => !s.completed).length}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Panel */}
      <AnimatePresence>
        {isExpanded && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 z-[74]"
              onClick={() => setIsExpanded(false)}
            />

            {/* Panel - Mobile: above button at bottom, Desktop: below button at top */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed right-4 bottom-20 md:right-6 md:bottom-auto md:top-24 z-[76] w-[calc(100vw-2rem)] max-w-[320px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-jakarta"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-bold text-alloro-navy uppercase tracking-wider">
                  Setup Progress
                </h3>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={16} className="text-slate-400" />
                </button>
              </div>

              {/* Steps */}
              <div className="p-5 space-y-4">
                {steps.map((step) => (
                  <div key={step.number} className="flex gap-3">
                    {/* Step indicator */}
                    <div className="shrink-0 pt-0.5">
                      {step.completed ? (
                        <CheckCircle2
                          size={20}
                          className="text-green-500"
                          strokeWidth={2.5}
                        />
                      ) : (
                        <Circle
                          size={20}
                          className="text-slate-300"
                          strokeWidth={2}
                        />
                      )}
                    </div>

                    {/* Step content */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium leading-tight ${
                          step.completed
                            ? "text-slate-400 line-through"
                            : "text-alloro-navy"
                        }`}
                      >
                        {step.number}. {step.title}
                      </p>

                      {/* Link */}
                      {step.link && step.onClick && !step.completed && (
                        <button
                          onClick={step.onClick}
                          className="text-xs text-alloro-orange font-medium mt-1.5 underline underline-offset-2 hover:text-alloro-orange/80 transition-colors"
                        >
                          {step.link}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="px-5 pb-5">
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${
                        (steps.filter((s) => s.completed).length /
                          steps.length) *
                        100
                      }%`,
                    }}
                    className="h-full bg-gradient-to-r from-alloro-orange to-orange-400 rounded-full"
                  />
                </div>
                <p className="text-[10px] text-slate-400 font-medium mt-2 text-center">
                  {steps.filter((s) => s.completed).length} of {steps.length}{" "}
                  steps completed
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
