import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Info,
  FileText,
  ShieldCheck,
  UserCheck,
  Sparkles,
} from "lucide-react";
import type { AutomationStatusDetail, StepKey } from "../../api/pms";
import type { LucideIcon } from "lucide-react";
import { usePmsCopy, type PmsCopy } from "./pmsCopy";

/**
 * Client-facing step configuration
 * Maps backend steps to user-friendly labels
 */
interface ClientStep {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  backendSteps: StepKey[]; // Which backend steps this client step represents
}

function buildClientSteps(copy: PmsCopy): ClientStep[] {
  return [
    {
      id: "data_entry",
      label: `Enter your ${copy.dataName}`,
      description: `Upload your ${copy.exportName} or enter data manually`,
      icon: FileText,
      backendSteps: ["file_upload"],
    },
    {
      id: "validation",
      label: "Validating your data",
      description: "Alloro is parsing and reviewing your data for accuracy",
      icon: ShieldCheck,
      backendSteps: ["pms_parser", "admin_approval"],
    },
    {
      id: "confirmation",
      label: "Your confirmation",
      description: "Click to review and confirm",
      icon: UserCheck,
      backendSteps: ["client_approval"],
    },
    {
      id: "agents",
      label: "Alloro Insights",
      description:
        "Alloro is analyzing your data to generate actionable insights",
      icon: Sparkles,
      backendSteps: ["monthly_agents", "task_creation", "complete"],
    },
  ];
}

type StepState = "completed" | "current" | "pending";

function getStepState(
  clientStep: ClientStep,
  automationStatus: AutomationStatusDetail | null,
): StepState {
  if (!automationStatus) {
    // No status yet - first step is current
    return clientStep.id === "data_entry" ? "current" : "pending";
  }

  const { currentStep, steps, status } = automationStatus;

  // Check if all backend steps for this client step are completed
  const allCompleted = clientStep.backendSteps.every((backendStep) => {
    const stepDetail = steps[backendStep];
    return (
      stepDetail?.status === "completed" || stepDetail?.status === "skipped"
    );
  });

  if (allCompleted) {
    return "completed";
  }

  // Check if any backend step is current (processing or awaiting approval)
  const isCurrent = clientStep.backendSteps.some((backendStep) => {
    // Check if this is the current step
    if (currentStep === backendStep) return true;

    // Check step status
    const stepDetail = steps[backendStep];
    return stepDetail?.status === "processing";
  });

  // Special case: awaiting_approval status
  if (status === "awaiting_approval") {
    if (currentStep === "admin_approval" && clientStep.id === "validation") {
      return "current";
    }
    if (currentStep === "client_approval" && clientStep.id === "confirmation") {
      return "current";
    }
  }

  if (isCurrent) {
    return "current";
  }

  return "pending";
}

/**
 * Check if any steps were skipped (indicates manual entry)
 */
function hasSkippedSteps(
  automationStatus: AutomationStatusDetail | null,
): boolean {
  if (!automationStatus) return false;

  const { steps } = automationStatus;

  // Check if pms_parser, admin_approval, or client_approval were skipped
  return (
    steps.pms_parser?.status === "skipped" ||
    steps.admin_approval?.status === "skipped" ||
    steps.client_approval?.status === "skipped"
  );
}

interface ClientProgressTimelineProps {
  automationStatus: AutomationStatusDetail | null;
  className?: string;
  /** When true, all steps show as pending (not started state) */
  showNotStarted?: boolean;
  /** Callback when the "Your confirmation" step is clicked (only active when that step is current) */
  onConfirmationClick?: () => void;
}

export const ClientProgressTimeline: React.FC<ClientProgressTimelineProps> = ({
  automationStatus,
  className = "",
  showNotStarted = false,
  onConfirmationClick,
}) => {
  const copy = usePmsCopy();
  const clientSteps = useMemo(() => buildClientSteps(copy), [copy]);
  const isManualEntry = hasSkippedSteps(automationStatus);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // For "not started" state, all steps should be pending (greyed out)
  const getEffectiveState = (step: ClientStep): StepState => {
    if (showNotStarted) {
      return "pending";
    }
    return getStepState(step, automationStatus);
  };

  // Get current step index for progress calculation
  const getCurrentStepIndex = (): number => {
    for (let i = 0; i < clientSteps.length; i++) {
      const state = getEffectiveState(clientSteps[i]);
      if (state === "current") return i;
      if (state === "pending") return Math.max(0, i - 1);
    }
    return clientSteps.length - 1; // All completed
  };

  const currentStepIndex = getCurrentStepIndex();

  return (
    <div className={`w-full ${className}`}>
      {/* Mobile/Compact View (Vertical) */}
      <div className="md:hidden flex flex-col space-y-3 px-4">
        {clientSteps.map((step, index) => {
          const state = getEffectiveState(step);
          const Icon = step.icon;
          const isClickable =
            step.id === "confirmation" &&
            state === "current" &&
            onConfirmationClick;

          return (
            <motion.div
              key={step.id}
              className={`flex items-start space-x-3 p-3 rounded-2xl transition-all duration-300 ${
                state === "current"
                  ? "bg-white shadow-lg border border-alloro-orange/20 p-4"
                  : ""
              }`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={isClickable ? onConfirmationClick : undefined}
            >
              <div
                className={`
                relative z-10 flex shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300
                ${state === "current" ? "h-10 w-10 border-alloro-orange bg-white text-alloro-orange scale-110" : "h-8 w-8"}
                ${state === "completed" ? "border-alloro-orange bg-alloro-orange text-white" : ""}
                ${state === "pending" ? "border-gray-200 bg-white text-gray-300" : ""}
                ${isClickable ? "cursor-pointer hover:scale-115" : ""}
              `}
              >
                {state === "completed" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon
                    className={state === "current" ? "h-5 w-5" : "h-4 w-4"}
                  />
                )}
              </div>
              <div className="flex flex-col pt-0.5">
                <span
                  className={`transition-colors duration-300 ${
                    state === "current"
                      ? "text-base font-bold text-alloro-navy"
                      : state === "completed"
                        ? "text-sm font-medium text-alloro-orange"
                        : "text-sm font-medium text-gray-400"
                  } ${isClickable ? "cursor-pointer" : ""}`}
                >
                  {step.label}
                </span>
                {state === "current" && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="text-xs text-alloro-orange/80 mt-1"
                  >
                    {step.description}
                  </motion.p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Desktop View (Horizontal) */}
      <div className="hidden md:block relative px-8 pt-12 pb-32">
        {/* Connection Lines Layer */}
        <div className="absolute top-[5.5rem] left-0 w-full -translate-y-1/2 px-16">
          {/* Background Line */}
          <div className="h-1 bg-gray-100 rounded-full w-full" />

          {/* Colored Progress Line */}
          <div className="absolute top-0 left-0 h-1 rounded-full overflow-hidden w-full px-16">
            <motion.div
              className="h-full bg-gradient-to-r from-alloro-orange/60 via-alloro-orange to-alloro-orange"
              initial={{ width: "0%" }}
              animate={{
                width: `${(currentStepIndex / (clientSteps.length - 1)) * 100}%`,
              }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
            />
          </div>
        </div>

        {/* Steps Container */}
        <div className="relative z-10 flex justify-between items-start w-full">
          {clientSteps.map((step, index) => {
            const state = getEffectiveState(step);
            const Icon = step.icon;
            const isHovered = hoveredIndex === index;
            const isExpanded = state === "current" || isHovered;
            const isClickable =
              step.id === "confirmation" &&
              state === "current" &&
              onConfirmationClick;

            return (
              <div
                key={step.id}
                className={`relative flex flex-col items-center group transition-all duration-300 ${isHovered ? "z-20" : "z-10"} ${isClickable ? "cursor-pointer" : ""}`}
                style={{ width: "120px" }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={isClickable ? onConfirmationClick : undefined}
              >
                {/* Node Container */}
                <div className="relative flex items-center justify-center h-20 w-20 shrink-0">
                  {/* Active State Animated Border Overlay */}
                  {state === "current" && (
                    <div className="absolute inset-0 z-0">
                      <svg
                        className="w-full h-full text-alloro-orange drop-shadow-[0_4px_10px_rgba(214,104,83,0.3)]"
                        viewBox="0 0 100 100"
                      >
                        {/* Track Path */}
                        <circle
                          cx="50"
                          cy="50"
                          r="44"
                          fill="none"
                          stroke="currentColor"
                          strokeOpacity="0.1"
                          strokeWidth="3"
                        />
                        {/* Rotating Dash Animation */}
                        <motion.circle
                          cx="50"
                          cy="50"
                          r="44"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray="70 200"
                          initial={{ rotate: -90 }}
                          animate={{ rotate: 270 }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                          style={{ transformOrigin: "center" }}
                        />
                        <motion.circle
                          cx="50"
                          cy="50"
                          r="38"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1"
                          strokeLinecap="round"
                          strokeDasharray="40 200"
                          strokeOpacity="0.5"
                          initial={{ rotate: 90 }}
                          animate={{ rotate: -270 }}
                          transition={{
                            duration: 2.5,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                          style={{ transformOrigin: "center" }}
                        />
                      </svg>
                    </div>
                  )}

                  {/* Hover Ring for non-active items */}
                  {isHovered && state !== "current" && (
                    <motion.div
                      className="absolute inset-2 rounded-full border-2 border-alloro-orange/30"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                    />
                  )}

                  {/* Main Circle Content */}
                  <motion.div
                    animate={{
                      width: isExpanded ? 64 : 44,
                      height: isExpanded ? 64 : 44,
                      backgroundColor:
                        state === "completed" ? "#D66853" : "#ffffff",
                      borderColor:
                        state === "completed"
                          ? "#D66853"
                          : isExpanded
                            ? "#D66853"
                            : "#e2e8f0",
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className={`
                      relative z-10 flex items-center justify-center rounded-full border-2 shadow-sm
                      ${state === "pending" ? "text-gray-300" : ""}
                      ${state === "current" ? "text-alloro-orange shadow-inner" : ""}
                      ${state === "completed" ? "text-white" : ""}
                      ${isHovered && state !== "completed" && state !== "current" ? "text-alloro-orange/60" : ""}
                    `}
                  >
                    {state === "completed" ? (
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: isExpanded ? 1.2 : 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <Check
                          className={`stroke-[3] ${isExpanded ? "h-7 w-7" : "h-5 w-5"}`}
                        />
                      </motion.div>
                    ) : (
                      <Icon
                        className={`
                        transition-all duration-300
                        ${isExpanded ? "w-7 h-7 stroke-[2]" : "w-5 h-5 stroke-2"}
                      `}
                      />
                    )}
                  </motion.div>
                </div>

                {/* Label & Description */}
                <div className="absolute top-20 w-56 flex flex-col items-center text-center pointer-events-none">
                  <motion.span
                    animate={{
                      scale: state === "current" ? 1.05 : 0.9,
                      color:
                        state === "current"
                          ? "#1e3a5f"
                          : state === "completed"
                            ? "#D66853"
                            : "#94a3b8",
                      fontWeight: state === "current" ? 700 : 500,
                      y: state === "current" ? 0 : 4,
                    }}
                    className={`transition-colors mb-2 block ${state === "current" ? "text-sm" : "text-xs"}`}
                  >
                    {step.label}
                  </motion.span>

                  {/* Description - Visible on hover or active */}
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -10 }}
                    animate={{
                      opacity: isExpanded ? 1 : 0,
                      height: isExpanded ? "auto" : 0,
                      y: isExpanded ? 0 : -10,
                    }}
                    className="overflow-hidden px-2"
                  >
                    <p
                      className={`
                      font-medium leading-relaxed py-1 px-3 rounded-lg border backdrop-blur-sm
                      ${state === "current" ? "text-xs bg-white/80 text-alloro-orange/80 border-alloro-orange/20 shadow-sm" : ""}
                      ${state === "completed" ? "text-[10px] bg-alloro-orange/5 text-alloro-orange/70 border-alloro-orange/10" : ""}
                      ${state === "pending" ? "text-[10px] bg-gray-50 text-gray-400 border-gray-100" : ""}
                    `}
                    >
                      {step.description}
                    </p>
                  </motion.div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Skipped steps info message for manual entries */}
      {isManualEntry && !showNotStarted && (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <Info className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span>
            {copy.fileNoun} parsing, validation and admin confirmation are
            skipped for manual entries
          </span>
        </div>
      )}
    </div>
  );
};

export default ClientProgressTimeline;
