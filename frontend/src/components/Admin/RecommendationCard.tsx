import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
  AlertTriangle,
  Zap,
  Tag,
  Clock,
  Link as LinkIcon,
  BookOpen,
  Bot,
} from "lucide-react";
import type { AgentRecommendation } from "../../types/agentInsights";
import { AlertModal } from "@/components/ui/AlertModal";
import { adminFetch } from "../../api";

interface Props {
  recommendation: AgentRecommendation;
  onUpdate: () => void;
}

// Status options for the dropdown
const STATUS_OPTIONS = [
  { value: "IGNORE", label: "Ignore", color: "text-gray-600", bg: "bg-gray-100", border: "border-gray-200" },
  { value: "PASS", label: "Pass", color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
  { value: "REJECT", label: "Reject", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
];

// Animated Status Dropdown Component
function StatusDropdown({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = STATUS_OPTIONS.find((opt) => opt.value === value) || STATUS_OPTIONS[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <motion.button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setIsOpen(!isOpen);
        }}
        disabled={disabled}
        className={`flex items-center justify-between gap-2 min-w-[100px] px-3 py-1.5 rounded-lg border ${selectedOption.border} ${selectedOption.bg} text-sm font-medium transition-all ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:shadow-sm cursor-pointer"
        }`}
        whileHover={!disabled ? { scale: 1.02 } : undefined}
        whileTap={!disabled ? { scale: 0.98 } : undefined}
      >
        <span className={selectedOption.color}>{selectedOption.label}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className={`w-4 h-4 ${selectedOption.color}`} />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-1 w-32 bg-white rounded-lg border border-gray-200 shadow-lg z-50 overflow-hidden"
          >
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium ${option.color} hover:${option.bg} transition-colors`}
              >
                <span>{option.label}</span>
                {value === option.value && <Check className="w-4 h-4" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Individual recommendation card with animated status dropdown
 * and "Feed to Fixer agent" button
 */
export default function RecommendationCard({
  recommendation,
  onUpdate,
}: Props) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: "error" | "success" | "info";
  }>({ isOpen: false, title: "", message: "" });

  const handleStatusChange = async (newStatus: string) => {
    if (isUpdating) return;

    setIsUpdating(true);

    try {
      const response = await adminFetch(
        `/api/admin/agent-insights/recommendations/${recommendation.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      const data = await response.json();

      if (data.success) {
        onUpdate(); // Refresh parent data
      } else {
        setAlertModal({ isOpen: true, title: "Status Update Failed", message: "Failed to update status: " + (data.message || "Unknown error"), type: "error" });
      }
    } catch (error) {
      console.error("Failed to update recommendation status:", error);
      setAlertModal({ isOpen: true, title: "Status Update Failed", message: "Failed to update status. Please try again.", type: "error" });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleFixerAgent = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAlertModal({ isOpen: true, title: "Coming Soon", message: "Fixer Agent feature is coming soon!", type: "info" });
  };

  // Get status styling
  const getStatusBadge = () => {
    switch (recommendation.status) {
      case "PASS":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full border border-green-200">
            <Check className="w-3 h-3" />
            Passed
          </span>
        );
      case "REJECT":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full border border-red-200">
            <AlertTriangle className="w-3 h-3" />
            Rejected
          </span>
        );
      default:
        return null;
    }
  };

  // Severity styling
  const getSeverityBadge = () => {
    if (recommendation.severity <= 1) return null;

    const severity = recommendation.severity;
    const bgColor = severity >= 4 ? "bg-red-100" : severity >= 2 ? "bg-yellow-100" : "bg-gray-100";
    const textColor = severity >= 4 ? "text-red-700" : severity >= 2 ? "text-yellow-700" : "text-gray-700";
    const borderColor = severity >= 4 ? "border-red-200" : severity >= 2 ? "border-yellow-200" : "border-gray-200";

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium ${bgColor} ${textColor} rounded-full border ${borderColor}`}>
        <Zap className="w-3 h-3" />
        Severity {severity}
      </span>
    );
  };

  return (
    <motion.div
      className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden hover:shadow-md hover:border-gray-300 transition-all"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -1 }}
    >
      {/* Card Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Title and Status Badge */}
          <div className="flex-1 min-w-0">
            <p className="text-gray-900 font-medium leading-snug line-clamp-2">
              {recommendation.title}
            </p>
            {recommendation.status && (
              <div className="mt-2">
                {getStatusBadge()}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Feed to Fixer Agent Button */}
            <motion.button
              onClick={handleFixerAgent}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap"
              title="Coming soon"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Bot className="w-3.5 h-3.5" />
              Fixer Agent
            </motion.button>

            {/* Animated Status Dropdown */}
            {isUpdating ? (
              <div className="flex items-center justify-center min-w-[100px] px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50">
                <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
              </div>
            ) : (
              <StatusDropdown
                value={recommendation.status || "IGNORE"}
                onChange={handleStatusChange}
                disabled={isUpdating}
              />
            )}
          </div>
        </div>

        {/* Metadata Tags */}
        {(recommendation.urgency || recommendation.category || recommendation.severity > 1) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {recommendation.urgency && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full border border-purple-200">
                <Clock className="w-3 h-3" />
                {recommendation.urgency}
              </span>
            )}
            {recommendation.category && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full border border-gray-200">
                <Tag className="w-3 h-3" />
                {recommendation.category}
              </span>
            )}
            {getSeverityBadge()}
          </div>
        )}

        {/* Expand/Collapse Button */}
        {(recommendation.explanation || recommendation.suggested_action) && (
          <motion.button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-3 flex items-center gap-1.5 text-sm text-alloro-orange hover:text-alloro-orange/80 font-medium transition-colors"
            whileHover={{ x: 2 }}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Hide details
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Show details
              </>
            )}
          </motion.button>
        )}
      </div>

      {/* Expanded Details with Animation */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50/50">
              {/* Explanation */}
              {recommendation.explanation && (
                <div className="mt-4">
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                    <BookOpen className="w-4 h-4 text-gray-500" />
                    Explanation
                  </h4>
                  <p className="text-sm text-gray-600 leading-relaxed pl-5">
                    {recommendation.explanation}
                  </p>
                </div>
              )}

              {/* Suggested Action */}
              {recommendation.suggested_action && (
                <div className="mt-4">
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                    <Zap className="w-4 h-4 text-alloro-orange" />
                    Suggested Action
                  </h4>
                  <p className="text-sm text-gray-600 leading-relaxed pl-5">
                    {recommendation.suggested_action}
                  </p>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {recommendation.verdict && (
                  <div className="bg-white rounded-lg border border-gray-200 p-2">
                    <h4 className="text-xs font-semibold text-gray-500 mb-1">Verdict</h4>
                    <p className={`text-sm font-medium ${
                      recommendation.verdict === "PASS"
                        ? "text-green-600"
                        : recommendation.verdict === "FAIL"
                        ? "text-red-600"
                        : "text-yellow-600"
                    }`}>
                      {recommendation.verdict}
                    </p>
                  </div>
                )}

                {recommendation.confidence !== null && (
                  <div className="bg-white rounded-lg border border-gray-200 p-2">
                    <h4 className="text-xs font-semibold text-gray-500 mb-1">Confidence</h4>
                    <p className="text-sm font-medium text-gray-900">
                      {(recommendation.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                )}

                {recommendation.type && (
                  <div className="bg-white rounded-lg border border-gray-200 p-2">
                    <h4 className="text-xs font-semibold text-gray-500 mb-1">Type</h4>
                    <p className="text-sm font-medium text-gray-900">{recommendation.type}</p>
                  </div>
                )}

                {recommendation.escalation_required && (
                  <div className="bg-red-50 rounded-lg border border-red-200 p-2">
                    <h4 className="text-xs font-semibold text-red-600 mb-1">Escalation</h4>
                    <p className="text-sm font-medium text-red-700">Required</p>
                  </div>
                )}
              </div>

              {/* Evidence Links */}
              {recommendation.evidence_links && recommendation.evidence_links.length > 0 && (
                <div className="mt-4">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
                    <LinkIcon className="w-3.5 h-3.5" />
                    Evidence
                  </h4>
                  <ul className="space-y-1 pl-5">
                    {recommendation.evidence_links.map((link, index) => (
                      <li key={index}>
                        <a
                          href={link.url}
                          className="text-sm text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {link.label || link.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Rule Reference */}
              {recommendation.rule_reference && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">Rule Reference</h4>
                  <p className="text-xs text-gray-500 font-mono bg-white px-2 py-1 rounded border border-gray-200 inline-block">
                    {recommendation.rule_reference}
                  </p>
                </div>
              )}

              {/* Timestamps */}
              <div className="mt-4 pt-3 border-t border-gray-200 flex flex-wrap gap-4 text-xs text-gray-500">
                <p>Created: {new Date(recommendation.created_at).toLocaleString()}</p>
                {recommendation.completed_at && (
                  <p>Completed: {new Date(recommendation.completed_at).toLocaleString()}</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </motion.div>
  );
}
