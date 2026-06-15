import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Sparkles, PartyPopper } from "lucide-react";
import type { WizardStep } from "./wizardConfig";
import { logger } from "../../lib/logger";

interface WizardTooltipProps {
  /** Current step configuration */
  step: WizardStep | null;
  /** Whether the tooltip is visible */
  isVisible: boolean;
  /** Current step index (1-based for display) */
  currentIndex: number;
  /** Total steps */
  totalSteps: number;
  /** Progress percentage */
  progress: number;
  /** Go to next step */
  onNext: () => void;
  /** Go to previous step */
  onPrev: () => void;
  /** Skip the wizard */
  onSkip: () => void;
  /** Whether this is the first step */
  isFirstStep: boolean;
  /** Whether this is the last step */
  isLastStep: boolean;
}

interface TooltipPosition {
  top: number;
  left: number;
  arrowPosition: "top" | "bottom";
}

export function WizardTooltip({
  step,
  isVisible,
  currentIndex,
  totalSteps,
  progress,
  onNext,
  onPrev,
  onSkip,
  isFirstStep,
  isLastStep,
}: WizardTooltipProps) {
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const [isReady, setIsReady] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialDelayRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 30; // 30 * 200ms = 6 seconds max

  // Check if this is the final CTA step
  const isFinalStep = currentIndex >= totalSteps - 1;

  const calculatePosition = useCallback(() => {
    if (!step) {
      setPosition(null);
      setIsReady(false);
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isMobile = viewportWidth < 1024;
    const sidebarWidth = isMobile ? 0 : 280;
    const edgePad = isMobile ? 16 : 20;

    // Use wider width for final steps, clamp to viewport on mobile
    const configuredWidth = isFinalStep ? 480 : 400;
    const tooltipWidth = Math.min(configuredWidth, viewportWidth - sidebarWidth - edgePad * 2);
    const tooltipHeight = 240;
    const padding = 28;

    // For page overview, center in viewport
    if (step.isPageOverview || !step.targetSelector) {
      setPosition({
        top: Math.max(100, (viewportHeight - tooltipHeight) / 2),
        left: sidebarWidth + (viewportWidth - sidebarWidth) / 2,
        arrowPosition: "top",
      });
      setIsReady(true);
      retryCountRef.current = 0;
      return;
    }

    // Find the target element
    const element = document.querySelector(step.targetSelector);
    if (!element) {
      // Element not found, retry if we haven't exceeded max retries
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        retryTimeoutRef.current = setTimeout(calculatePosition, 200);
      } else {
        // Give up after max retries, show tooltip in center as fallback
        logger.warn(`Wizard: Element not found after ${maxRetries} retries: ${step.targetSelector}`);
        setPosition({
          top: Math.max(100, (viewportHeight - tooltipHeight) / 2),
          left: sidebarWidth + (viewportWidth - sidebarWidth) / 2,
          arrowPosition: "top",
        });
        setIsReady(true);
      }
      return;
    }

    // Element found, calculate position
    retryCountRef.current = 0;
    const rect = element.getBoundingClientRect();

    // Calculate horizontal position - center below element, but keep in bounds
    let left = rect.left + rect.width / 2;

    // Keep tooltip within viewport horizontally (account for sidebar on desktop only)
    const minLeft = sidebarWidth + tooltipWidth / 2 + edgePad;
    const maxLeft = viewportWidth - tooltipWidth / 2 - edgePad;
    left = Math.max(minLeft, Math.min(maxLeft, left));

    // Calculate vertical position - prefer below the element
    let top = rect.bottom + padding;
    let arrowPosition: "top" | "bottom" = "top";

    // If tooltip would go below viewport, position it above the element
    if (top + tooltipHeight > viewportHeight - 20) {
      top = rect.top - tooltipHeight - padding;
      arrowPosition = "bottom";
    }

    // Ensure tooltip doesn't go above viewport
    if (top < 20) {
      top = 20;
    }

    setPosition({ top, left, arrowPosition });
    setIsReady(true);
  }, [step, isFinalStep]);

  // Main effect to handle step changes
  useEffect(() => {
    // Clear all timeouts
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (initialDelayRef.current) {
      clearTimeout(initialDelayRef.current);
      initialDelayRef.current = null;
    }

    if (!isVisible || !step) {
      setPosition(null);
      setIsReady(false);
      retryCountRef.current = 0;
      return;
    }

    // Reset state for new step
    setIsReady(false);
    retryCountRef.current = 0;

    // Wait for scroll animation to complete before calculating position
    initialDelayRef.current = setTimeout(() => {
      calculatePosition();
    }, 500);

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (initialDelayRef.current) {
        clearTimeout(initialDelayRef.current);
      }
    };
  }, [step, isVisible, calculatePosition]);

  // Handle scroll/resize updates
  useEffect(() => {
    if (!isVisible || !step || !isReady) return;

    const handleUpdate = () => {
      // Don't retry on scroll, just recalculate if element exists
      const element = step.targetSelector ? document.querySelector(step.targetSelector) : null;
      if (element || step.isPageOverview || !step.targetSelector) {
        calculatePosition();
      }
    };

    window.addEventListener("scroll", handleUpdate, { passive: true });
    window.addEventListener("resize", handleUpdate, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleUpdate);
      window.removeEventListener("resize", handleUpdate);
    };
  }, [step, isVisible, isReady, calculatePosition]);

  // Don't render if not ready
  if (!step || !isVisible || !isReady || !position) {
    return null;
  }

  // Final steps get special orange gradient styling
  if (isFinalStep) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          ref={tooltipRef}
          initial={{ opacity: 0, scale: 0.9, x: "-50%", y: position.arrowPosition === "top" ? -10 : 10 }}
          animate={{ opacity: 1, scale: 1, x: "-50%", y: 0 }}
          exit={{ opacity: 0, scale: 0.9, x: "-50%" }}
          transition={{ type: "spring", duration: 0.4 }}
          className="fixed z-[95] w-[480px] max-w-[calc(100vw-32px)] lg:max-w-[calc(100vw-320px)]"
          style={{
            top: position.top,
            left: position.left,
          }}
        >
          {/* Arrow pointer - orange for final steps */}
          {!step.isPageOverview && position.arrowPosition === "top" && (
            <div
              className="absolute -top-[9px] left-1/2 -translate-x-1/2 w-4 h-4 bg-alloro-orange rotate-45"
              style={{ zIndex: 1 }}
            />
          )}
          {!step.isPageOverview && position.arrowPosition === "bottom" && (
            <div
              className="absolute -bottom-[9px] left-1/2 -translate-x-1/2 w-4 h-4 bg-alloro-orange rotate-45"
              style={{ zIndex: 1 }}
            />
          )}

          {/* Tooltip card - Orange gradient */}
          <div className="bg-gradient-to-br from-alloro-orange via-alloro-orange to-orange-600 rounded-3xl shadow-2xl overflow-hidden relative">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-12 -mb-12 blur-xl" />

            {/* Content */}
            <div className="p-7 relative z-10">
              {/* Header with step indicator */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    {isLastStep ? (
                      <PartyPopper size={20} className="text-white" />
                    ) : (
                      <Sparkles size={20} className="text-white" />
                    )}
                  </div>
                  <span className="text-sm font-bold text-white/80 uppercase tracking-wider">
                    {isLastStep ? "Final Step" : `Step ${currentIndex} of ${totalSteps}`}
                  </span>
                </div>
                <button
                  onClick={onSkip}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                  aria-label="Skip tour"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Title */}
              <h3 className="text-2xl font-black text-white font-heading mb-3">
                {step.title}
              </h3>

              {/* Description */}
              <p className="text-white/90 text-base leading-relaxed mb-6">
                {step.description}
              </p>

              {/* Navigation buttons - wider layout */}
              <div className="flex items-center justify-end gap-4">
                {/* Nav buttons */}
                <div className="flex items-center gap-3">
                  {!isFirstStep && (
                    <button
                      onClick={onPrev}
                      className="flex items-center gap-1.5 px-5 py-3 rounded-xl bg-white/20 text-white hover:bg-white/30 transition-colors text-sm font-bold whitespace-nowrap"
                    >
                      <ChevronLeft size={16} />
                      Back
                    </button>
                  )}

                  <button
                    onClick={onNext}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-alloro-orange hover:bg-white/90 transition-all shadow-lg text-sm font-black whitespace-nowrap"
                  >
                    {isLastStep ? (
                      "Finish Tour"
                    ) : step.promptAction ? (
                      step.promptAction.buttonText
                    ) : (
                      <>
                        Next
                        <ChevronRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Standard tooltip for other steps
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step.id}
        ref={tooltipRef}
        initial={{ opacity: 0, scale: 0.9, x: "-50%", y: position.arrowPosition === "top" ? -10 : 10 }}
        animate={{ opacity: 1, scale: 1, x: "-50%", y: 0 }}
        exit={{ opacity: 0, scale: 0.9, x: "-50%" }}
        transition={{ type: "spring", duration: 0.4 }}
        className="fixed z-[95] w-[400px] max-w-[calc(100vw-32px)] lg:max-w-[calc(100vw-320px)]"
        style={{
          top: position.top,
          left: position.left,
        }}
      >
        {/* Arrow pointer - at top when tooltip is below element */}
        {!step.isPageOverview && position.arrowPosition === "top" && (
          <div
            className="absolute -top-[9px] left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 border-l border-t border-slate-200"
            style={{ zIndex: 1 }}
          />
        )}

        {/* Arrow pointer - at bottom when tooltip is above element */}
        {!step.isPageOverview && position.arrowPosition === "bottom" && (
          <div
            className="absolute -bottom-[9px] left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 border-r border-b border-slate-200"
            style={{ zIndex: 1 }}
          />
        )}

        {/* Tooltip card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 relative">

          {/* Content */}
          <div className="p-6 pb-4">
            {/* Header with step indicator */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-alloro-orange flex items-center justify-center">
                  <Sparkles size={16} className="text-white" />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Step {currentIndex} of {totalSteps}
                </span>
              </div>
              <button
                onClick={onSkip}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Skip tour"
              >
                <X size={18} />
              </button>
            </div>

            {/* Title */}
            <h3 className="text-xl font-black text-alloro-navy font-heading mb-2">
              {step.title}
            </h3>

            {/* Description */}
            <p className="text-slate-600 text-sm leading-relaxed mb-4">
              {step.description}
            </p>

            {/* Progress bar - below description */}
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
                className="h-full bg-alloro-orange rounded-full"
              />
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between">
              {/* Skip button */}
              <button
                onClick={onSkip}
                className="text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors"
              >
                Skip entire tour
              </button>

              {/* Nav buttons */}
              <div className="flex items-center gap-2">
                {!isFirstStep && (
                  <button
                    onClick={onPrev}
                    className="flex items-center gap-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-sm font-semibold"
                  >
                    <ChevronLeft size={16} />
                    Back
                  </button>
                )}

                <button
                  onClick={onNext}
                  className="flex items-center gap-1 px-5 py-2.5 rounded-xl bg-alloro-orange text-white hover:bg-alloro-orange/90 transition-all shadow-lg shadow-alloro-orange/30 text-sm font-bold"
                >
                  {isLastStep ? (
                    "Finish Tour"
                  ) : step.promptAction ? (
                    step.promptAction.buttonText
                  ) : (
                    <>
                      Next
                      <ChevronRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
