import React, { useState, useMemo, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Lottie from "lottie-react";
import cogitatingSpinner from "../../assets/cogitating-spinner.json";
import { ClientProgressTimeline } from "./ClientProgressTimeline";
import type { AutomationStatusDetail } from "../../api/pms";
import { usePmsCopy, type PmsCopy } from "./pmsCopy";

function buildCogitatingPhrases(copy: PmsCopy) {
  return [
    `Mapping your ${copy.sourcesLabel.toLowerCase()}`,
    `Ranking top ${copy.sourcesLabel.toLowerCase()}`,
    `Tracing ${copy.moneyLower} per source`,
    "Comparing month over month",
    "Spotting dormant sources",
    "Flagging new sources",
    `Calculating ${copy.moneyLower} per ${copy.countSingular}`,
    `Analyzing ${copy.sourcesLabel.toLowerCase()} trends`,
    "Building your attribution matrix",
    "Detecting duplicate sources",
    "Measuring source concentration",
    "Identifying growth opportunities",
    "Scoring source efficiency",
    `Tracking ${copy.partnerSummaryLabel.toLowerCase()}`,
    "Surfacing declining sources",
    "Prioritizing action items",
    "Grounding insights to your data",
    `Matching sources to ${copy.moneyLower}`,
    "Preparing your action plan",
  ];
}

function CogitatingTitle() {
  const copy = usePmsCopy();
  const cogitatingPhrases = useMemo(() => buildCogitatingPhrases(copy), [copy]);
  const [targetPhrase, setTargetPhrase] = useState(
    () =>
      cogitatingPhrases[Math.floor(Math.random() * cogitatingPhrases.length)],
  );
  const [displayed, setDisplayed] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    if (isTyping) {
      if (displayed.length < targetPhrase.length) {
        const t = setTimeout(
          () => setDisplayed(targetPhrase.slice(0, displayed.length + 1)),
          35,
        );
        return () => clearTimeout(t);
      }
      const hold = setTimeout(() => setIsTyping(false), 1800);
      return () => clearTimeout(hold);
    }
    setTargetPhrase((prev) => {
      let next: string;
      do {
        next =
          cogitatingPhrases[
            Math.floor(Math.random() * cogitatingPhrases.length)
          ];
      } while (next === prev);
      return next;
    });
    setDisplayed("");
    setIsTyping(true);
  }, [cogitatingPhrases, displayed, isTyping, targetPhrase]);

  return (
    <h3 className="text-lg font-bold font-display mb-3">
      <span className="cogitating-gradient">{displayed}</span>
      <span className="inline-flex w-[1.5em] justify-start ml-[1px]">
        <span className="cogitating-dot" style={{ animationDelay: "0s" }}>
          .
        </span>
        <span className="cogitating-dot" style={{ animationDelay: "0.15s" }}>
          .
        </span>
        <span className="cogitating-dot" style={{ animationDelay: "0.3s" }}>
          .
        </span>
      </span>
    </h3>
  );
}

// Types for Referral Engine Data
export interface DoctorReferral {
  referrer_name?: string;
  referred?: number;
  pct_scheduled?: number;
  pct_examined?: number;
  pct_started?: number;
  net_production?: number | null;
  avg_production_per_referral?: number | null;
  trend_label?: "increasing" | "decreasing" | "new" | "dormant" | "stable";
  notes?: string;
  /** @deprecated Legacy field — no longer returned by n8n */
  referrer_id?: string;
}

export interface NonDoctorReferral {
  source_label?: string;
  source_key?: string;
  source_type?: "digital" | "patient" | "other";
  referred?: number;
  pct_scheduled?: number;
  pct_examined?: number;
  pct_started?: number;
  net_production?: number | null;
  avg_production_per_referral?: number | null;
  trend_label?: "increasing" | "decreasing" | "new" | "dormant" | "stable";
  notes?: string;
}

export interface TopFix {
  title: string;
  description: string;
  impact?: string;
}

export interface ReferralAutomationOpportunity {
  title: string;
  description: string;
  priority?: string;
  impact?: string;
  effort?: string;
  category?: string;
  due_date?: string;
}

export interface ReferralPracticeAction {
  title: string;
  description: string;
  priority?: string;
  impact?: string;
  effort?: string;
  category?: string;
  owner?: string;
  due_date?: string;
}

export interface ReferralEngineData {
  executive_summary?: string[];
  growth_opportunity_summary?: {
    top_three_fixes?: (TopFix | string)[];
    estimated_additional_annual_revenue?: number;
  };
  doctor_referral_matrix?: DoctorReferral[];
  non_doctor_referral_matrix?: NonDoctorReferral[];
  alloro_automation_opportunities?: (ReferralAutomationOpportunity | string)[];
  practice_action_plan?: (ReferralPracticeAction | string)[];
  observed_period?: {
    start_date: string;
    end_date: string;
  };
  data_quality_flags?: string[];
  confidence?: number;
}

// Unified row type for combined table
interface UnifiedReferralRow {
  id: string;
  name: string;
  type: "doctor" | "marketing";
  referred: number;
  net_production: number | null;
  avg_production_per_referral: number | null;
  trend_label?: "increasing" | "decreasing" | "new" | "dormant" | "stable";
  notes: string;
}

type FilterType = "all" | "doctor" | "marketing";

// Helper Components
const CompactTag = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    Increasing: "text-green-700 bg-green-50 border-green-100",
    increasing: "text-green-700 bg-green-50 border-green-100",
    Decreasing: "text-red-700 bg-red-50 border-red-100",
    decreasing: "text-red-700 bg-red-50 border-red-100",
    New: "text-indigo-700 bg-indigo-50 border-indigo-100",
    new: "text-indigo-700 bg-indigo-50 border-indigo-100",
    Dormant: "text-alloro-textDark/20 bg-alloro-bg border-black/5",
    dormant: "text-alloro-textDark/20 bg-alloro-bg border-black/5",
    Stable: "text-slate-500 bg-slate-50 border-slate-200",
    stable: "text-slate-500 bg-slate-50 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border leading-none mt-1 w-fit ${
        styles[status] || styles["Stable"]
      }`}
    >
      {status}
    </span>
  );
};

const TypeBadge = ({ type }: { type: "doctor" | "marketing" }) => {
  const copy = usePmsCopy();
  const isDoctor = type === "doctor";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border leading-none ${
        isDoctor
          ? "text-blue-700 bg-blue-50 border-blue-100"
          : "text-orange-700 bg-orange-50 border-orange-100"
      }`}
    >
      {isDoctor ? copy.partnerLegendLabel : copy.directLegendLabel}
    </span>
  );
};

const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "N/A";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

// Empty State Component - Shows "not started" timeline with all steps greyed out
const MatricesEmptyState = () => {
  const copy = usePmsCopy();

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-premium p-8 sm:p-12">
      <div className="text-center mb-8">
        <h3 className="text-lg font-bold text-alloro-navy mb-2">
          No source data available
        </h3>
        <p className="text-sm text-slate-500 font-medium">
          {copy.topSourcesEmpty}
        </p>
      </div>

      {/* Progress Timeline - Not Started State (all greyed out) */}
      <div className="border-t border-slate-100 pt-8">
        <ClientProgressTimeline automationStatus={null} showNotStarted={true} />
      </div>
    </div>
  );
};

// Loading Skeleton - Detailed table skeleton with gradient animation
const MatricesLoadingSkeleton = () => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-premium overflow-hidden">
    {/* Header Skeleton */}
    <div className="px-6 py-6 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white">
      <div className="space-y-2">
        <div className="h-6 w-48 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded-lg animate-shimmer" />
        <div className="h-3 w-64 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer" />
      </div>
      <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
        <div className="h-8 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded-lg animate-shimmer" />
        <div className="h-8 w-20 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded-lg animate-shimmer" />
        <div className="h-8 w-24 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded-lg animate-shimmer" />
      </div>
    </div>

    {/* Table Header Skeleton */}
    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30">
      <div className="flex items-center gap-4">
        <div className="h-3 w-24 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded animate-shimmer" />
        <div className="h-3 w-12 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer" />
        <div className="h-3 w-10 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer" />
        <div className="h-3 w-14 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer" />
        <div className="h-3 w-14 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer" />
        <div className="h-3 w-14 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer" />
        <div className="flex-1" />
        <div className="h-3 w-20 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer" />
        <div className="h-3 w-32 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer" />
      </div>
    </div>

    {/* Table Rows Skeleton */}
    <div className="divide-y divide-slate-100">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="px-6 py-5 flex items-center gap-4"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="w-[20%] space-y-2">
            <div
              className="h-4 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded animate-shimmer"
              style={{ width: `${60 + Math.random() * 40}%` }}
            />
            <div className="h-3 w-16 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer" />
          </div>
          <div className="w-[8%] flex justify-center">
            <div className="h-5 w-14 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer" />
          </div>
          <div className="w-[7%] flex justify-center">
            <div className="h-4 w-8 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded animate-shimmer" />
          </div>
          <div className="w-[9%] flex justify-center">
            <div className="h-4 w-10 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer" />
          </div>
          <div className="w-[9%] flex justify-center">
            <div className="h-4 w-10 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer" />
          </div>
          <div className="w-[9%] flex justify-center">
            <div className="h-4 w-10 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer" />
          </div>
          <div className="w-[13%] flex justify-end">
            <div className="h-4 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded animate-shimmer" />
          </div>
          <div className="w-[25%] space-y-1">
            <div className="h-3 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer" />
            <div
              className="h-3 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-shimmer"
              style={{ width: `${50 + Math.random() * 50}%` }}
            />
          </div>
        </div>
      ))}
    </div>

    {/* Add shimmer animation style */}
    <style>{`
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      .animate-shimmer {
        background-size: 200% 100%;
        animation: shimmer 1.5s ease-in-out infinite;
      }
    `}</style>
  </div>
);

// Processing State Component - Shows when monthly agents are generating new insights
interface MatricesProcessingStateProps {
  automationStatus?: AutomationStatusDetail | null;
  onConfirmationClick?: () => void;
}

const MatricesProcessingState: React.FC<MatricesProcessingStateProps> = ({
  automationStatus,
  onConfirmationClick,
}) => {
  const copy = usePmsCopy();
  const isAwaitingClientApproval =
    automationStatus?.status === "awaiting_approval" &&
    automationStatus?.currentStep === "client_approval";

  if (isAwaitingClientApproval) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-premium p-8 sm:p-12">
        <div className="text-center mb-8">
          <h3 className="text-lg font-bold text-alloro-navy mb-2">
            Your {copy.dataName} is Ready for Review
          </h3>
          <p className="text-sm text-slate-500 font-medium">
            Please review your data and confirm using the banner above
          </p>
        </div>
        <div className="border-t border-slate-100 pt-8">
          <ClientProgressTimeline
            automationStatus={automationStatus ?? null}
            onConfirmationClick={onConfirmationClick}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-premium p-8 sm:p-12">
      <div className="flex flex-col items-center justify-center py-8">
        <div className="relative flex items-center justify-center h-16 w-16 mb-6">
          <div
            className="absolute inset-0 animate-spin rounded-full border-[3px] border-alloro-orange/15 border-t-alloro-orange"
            style={{ animationDuration: "1.2s" }}
          />
          <Lottie
            animationData={cogitatingSpinner}
            loop
            className="relative z-10 w-9 h-9"
          />
        </div>

        <CogitatingTitle />

        <p className="text-sm text-gray-900 mb-4">
          Alloro is analyzing your data to generate actionable insights
        </p>
        <p className="text-xs text-slate-400">Estimated time: ~3–4 minutes</p>
      </div>
    </div>
  );
};

interface ReferralMatricesProps {
  referralData: ReferralEngineData | null;
  isLoading?: boolean;
  isPending?: boolean;
  automationStatus?: AutomationStatusDetail | null;
  onConfirmationClick?: () => void;
}

export const ReferralMatrices: React.FC<ReferralMatricesProps> = ({
  referralData,
  isLoading = false,
  isPending = false,
  automationStatus = null,
  onConfirmationClick,
}) => {
  const copy = usePmsCopy();
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const toggleNoteExpansion = (id: string) => {
    setExpandedNotes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Combine doctor and non-doctor data into unified rows
  const unifiedRows = useMemo((): UnifiedReferralRow[] => {
    if (!referralData) return [];

    const rows: UnifiedReferralRow[] = [];

    // Add doctor referrals
    if (referralData.doctor_referral_matrix) {
      referralData.doctor_referral_matrix.forEach((doc, idx) => {
        rows.push({
          id: doc.referrer_id || `doctor-${idx}`,
          name: doc.referrer_name || "Unknown",
          type: "doctor",
          referred: doc.referred || 0,
          net_production: doc.net_production ?? null,
          avg_production_per_referral: doc.avg_production_per_referral ?? null,
          trend_label: doc.trend_label,
          notes: doc.notes || "No notes available.",
        });
      });
    }

    // Add non-doctor (marketing) referrals
    if (referralData.non_doctor_referral_matrix) {
      referralData.non_doctor_referral_matrix
        .filter((s) => (s.referred || 0) > 0)
        .forEach((source, idx) => {
          rows.push({
            id: source.source_key || `marketing-${idx}`,
            name: source.source_label || source.source_key || "Unknown",
            type: "marketing",
            referred: source.referred || 0,
            net_production: source.net_production ?? null,
            avg_production_per_referral:
              source.avg_production_per_referral ?? null,
            trend_label: source.trend_label,
            notes:
              source.notes ||
              (source.source_type === "digital"
                ? "High-intent digital lead. Focus on GBP visibility."
                : "Key partner source."),
          });
        });
    }

    // Sort by dollar amount (highest first)
    return rows.sort(
      (a, b) => (b.net_production || 0) - (a.net_production || 0),
    );
  }, [referralData]);

  // Filter rows based on active filter
  const filteredRows = useMemo(() => {
    if (activeFilter === "all") return unifiedRows;
    return unifiedRows.filter((row) => row.type === activeFilter);
  }, [unifiedRows, activeFilter]);

  // Count by type for filter badges
  const counts = useMemo(() => {
    const doctor = unifiedRows.filter((r) => r.type === "doctor").length;
    const marketing = unifiedRows.filter((r) => r.type === "marketing").length;
    return { all: unifiedRows.length, doctor, marketing };
  }, [unifiedRows]);

  if (isLoading) {
    return <MatricesLoadingSkeleton />;
  }

  // Show processing state when automation is active (but NOT completed) OR monthly agents are running
  // Don't show processing state if automation has completed - let the matrix display
  const isAutomationActive =
    automationStatus && automationStatus.status !== "completed";

  // If isPending is true but we have no automationStatus, show loading skeleton
  // This happens when we're waiting for referral data after automation completed
  if (isPending && !automationStatus) {
    return <MatricesLoadingSkeleton />;
  }

  if (isPending || isAutomationActive) {
    return (
      <MatricesProcessingState
        automationStatus={automationStatus}
        onConfirmationClick={onConfirmationClick}
      />
    );
  }

  // Only show empty state if there's no data AND no active automation
  if (!referralData || unifiedRows.length === 0) {
    return <MatricesEmptyState />;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-premium overflow-hidden">
      {/* Header with Filter Toggle */}
      <div className="px-6 py-6 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white">
        <div>
          <h2 className="text-xl font-black font-heading text-alloro-navy tracking-tight">
            See Which Sources Are Giving You the Most Value
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            Combined {copy.partnerLegendLabel} & {copy.directLegendLabel}{" "}
            Sources
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Type Filter Toggle */}
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl">
            <button
              onClick={() => setActiveFilter("all")}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                activeFilter === "all"
                  ? "bg-white text-alloro-navy shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              All
              <span className="ml-1.5 text-[9px] opacity-60">
                ({counts.all})
              </span>
            </button>
            <button
              onClick={() => setActiveFilter("doctor")}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                activeFilter === "doctor"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {copy.partnerLegendLabel}
              <span className="ml-1.5 text-[9px] opacity-60">
                ({counts.doctor})
              </span>
            </button>
            <button
              onClick={() => setActiveFilter("marketing")}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                activeFilter === "marketing"
                  ? "bg-white text-orange-700 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {copy.directLegendLabel}
              <span className="ml-1.5 text-[9px] opacity-60">
                ({counts.marketing})
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Combined Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse table-fixed min-w-[1000px]">
          <thead className="bg-slate-50/30 text-[9px] font-black text-slate-400 uppercase tracking-[0.25em] border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 w-[20%]">Source</th>
              <th className="px-2 py-4 text-center w-[8%]">Type</th>
              <th className="px-2 py-4 text-center w-[7%]">
                {copy.countShort}
              </th>
              <th className="px-4 py-4 text-right w-[13%]">
                {copy.moneyLabel}
              </th>
              <th className="px-4 py-4 text-right w-[13%]">
                Avg / {copy.countSingular}
              </th>
              <th className="px-6 py-4 w-[25%]">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-slate-50/50 transition-all group"
              >
                <td className="px-6 py-5">
                  <div className="flex flex-col min-w-0">
                    <span className="font-black text-alloro-navy text-[13px] leading-tight group-hover:text-alloro-orange transition-colors truncate">
                      {row.name}
                    </span>
                    {row.trend_label && <CompactTag status={row.trend_label} />}
                  </div>
                </td>
                <td className="px-2 py-5 text-center">
                  <TypeBadge type={row.type} />
                </td>
                <td className="px-2 py-5 text-center font-black text-alloro-navy text-sm tabular-nums">
                  {row.referred}
                </td>
                <td className="px-4 py-5 text-right font-black text-alloro-navy text-sm tabular-nums">
                  {formatCurrency(row.net_production)}
                </td>
                <td className="px-4 py-5 text-right font-bold text-slate-500 text-sm tabular-nums">
                  {formatCurrency(row.avg_production_per_referral)}
                </td>
                <td className="px-6 py-5">
                  <div className="space-y-1">
                    <p
                      className={`text-sm text-slate-500 font-medium leading-tight tracking-tight ${
                        expandedNotes.has(row.id) ? "" : "line-clamp-2"
                      }`}
                    >
                      {row.notes}
                    </p>
                    {row.notes && row.notes.length > 80 && (
                      <button
                        onClick={() => toggleNoteExpansion(row.id)}
                        className="flex items-center gap-1 text-[10px] font-bold text-alloro-orange hover:text-alloro-navy transition-colors"
                      >
                        {expandedNotes.has(row.id) ? (
                          <>
                            Show less <ChevronUp size={12} />
                          </>
                        ) : (
                          <>
                            Read more <ChevronDown size={12} />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty state for filtered results */}
      {filteredRows.length === 0 && (
        <div className="p-12 text-center">
          <p className="text-slate-400 text-sm font-medium">
            No{" "}
            {activeFilter === "doctor"
              ? copy.partnerLegendLabel.toLowerCase()
              : copy.directLegendLabel.toLowerCase()}{" "}
            {copy.countPlural}
            found.
          </p>
        </div>
      )}
    </div>
  );
};

export default ReferralMatrices;
