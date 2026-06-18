import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  Search,
  Star,
  MousePointer2,
  Activity,
  Lightbulb,
  Globe,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";
import { useGBP } from "../../hooks/useGBP";
import { useClarity } from "../../hooks/useClarity";
import { useLocationContext } from "../../contexts/locationContext";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../contexts/OnboardingWizardContext";
import { logger } from "../../lib/logger";

interface VitalSignsCardsProps {
  className?: string;
}

// Stage configuration
const STAGES = [
  {
    id: "consideration",
    title: "Consideration",
    iconName: "Star",
    description:
      "When patients compare options and evaluate your practice's reputation. Strong social proof and reputation management are crucial.",
    dataSource: "Google Business Profile",
  },
  {
    id: "decision",
    title: "Decision",
    iconName: "MousePointer2",
    description:
      "The critical conversion moment. User experience determines whether ready-to-book patients complete their appointment or abandon.",
    dataSource: "Microsoft Clarity",
  },
];

// Helper to format numbers
const formatNumber = (num: number): string => {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
};

// Icon renderer
const getIcon = (name: string, size = 24, className = "") => {
  switch (name) {
    case "Search":
      return <Search size={size} className={className} />;
    case "Globe":
      return <Globe size={size} className={className} />;
    case "Star":
      return <Star size={size} className={className} />;
    case "MousePointer2":
      return <MousePointer2 size={size} className={className} />;
    default:
      return <Search size={size} className={className} />;
  }
};

export const VitalSignsCards: React.FC<VitalSignsCardsProps> = ({
  className = "",
}) => {

  const [activeTabId, setActiveTabId] = useState("consideration");
  const [isFetchingAIData, setIsFetchingAIData] = useState(false);
  const [aiDataStatus, setAiDataStatus] = useState<{
    gbp: "idle" | "loading" | "success" | "error";
    clarity: "idle" | "loading" | "success" | "error";
  }>({
    gbp: "idle",
    clarity: "idle",
  });

  // Hooks for data
  const {
    gbpData: rawGbpData,
    isLoading: rawGbpLoading,
    error: rawGbpError,
    fetchAIReadyData: fetchGBPAIData,
  } = useGBP();
  const {
    clarityData: rawClarityData,
    isLoading: rawClarityLoading,
    error: rawClarityError,
    fetchAIReadyClarityData: fetchClarityAIData,
  } = useClarity();
  const { selectedLocation } = useLocationContext();
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();

  // When wizard is active, override live data with demo data
  const gbpData = isWizardActive && wizardDemoData?.gbpDemoData ? wizardDemoData.gbpDemoData : rawGbpData;
  const clarityData = isWizardActive && wizardDemoData?.clarityDemoData ? wizardDemoData.clarityDemoData : rawClarityData;
  const gbpLoading = isWizardActive ? false : rawGbpLoading;
  const clarityLoading = isWizardActive ? false : rawClarityLoading;
  const gbpError = isWizardActive ? null : rawGbpError;
  const clarityError = isWizardActive ? null : rawClarityError;

  const activeIndex = STAGES.findIndex((s) => s.id === activeTabId);
  const activeStage = STAGES[activeIndex];

  // Get data status for each integration
  const integrationStatus = useMemo(
    () => ({
      gbp: {
        connected: !gbpError && !gbpLoading,
        loading: gbpLoading,
        error: gbpError,
      },
      clarity: {
        connected: !clarityError && !clarityLoading,
        loading: clarityLoading,
        error: clarityError,
      },
    }),
    [
      gbpLoading,
      gbpError,
      clarityLoading,
      clarityError,
    ]
  );

  // Get metrics for active stage
  const getStageMetrics = () => {
    switch (activeTabId) {
      case "consideration":
        return [
          {
            label: "New Reviews",
            value: gbpLoading ? "..." : gbpData.newReviews.currMonth.toString(),
            subtext: "This month",
          },
          {
            label: "Avg. Rating",
            value: gbpLoading ? "..." : gbpData.avgRating.currMonth.toFixed(1),
            subtext: "Star rating",
          },
          {
            label: "Call Clicks",
            value: gbpLoading
              ? "..."
              : formatNumber(gbpData.callClicks.currMonth),
            subtext: "Phone taps",
          },
        ];
      case "decision":
        return [
          {
            label: "User Sessions",
            value: clarityLoading
              ? "..."
              : formatNumber(clarityData.sessions.currMonth),
            subtext: "Site visits",
          },
          {
            label: "Bounce Rate",
            value: clarityLoading
              ? "..."
              : (clarityData.bounceRate.currMonth * 100).toFixed(1) + "%",
            subtext: "Exit rate",
          },
          {
            label: "Dead Clicks",
            value: clarityLoading
              ? "..."
              : clarityData.deadClicks.currMonth.toString(),
            subtext: "UX issues",
          },
        ];
      default:
        return [];
    }
  };

  // Get insight for active stage
  const getStageInsight = () => {
    switch (activeTabId) {
      case "consideration":
        return gbpLoading
          ? "Loading business profile data..."
          : gbpError
          ? "Error loading reviews. Check GBP integration."
          : `Your practice has ${
              gbpData.newReviews.currMonth
            } new reviews this month with ${gbpData.avgRating.currMonth.toFixed(
              1
            )}-star average rating. ${
              gbpData.callClicks.currMonth
            } call clicks generated.`;
      case "decision":
        return clarityLoading
          ? "Loading user behavior data..."
          : clarityError
          ? "Error loading UX data. Check Clarity integration."
          : `Your site had ${formatNumber(
              clarityData.sessions.currMonth
            )} user sessions with ${(
              clarityData.bounceRate.currMonth * 100
            ).toFixed(1)}% bounce rate. ${
              clarityData.deadClicks.currMonth
            } dead clicks detected this month.`;
      default:
        return "";
    }
  };

  const nextStage = () => {
    if (activeIndex < STAGES.length - 1) {
      setActiveTabId(STAGES[activeIndex + 1].id);
    }
  };

  const prevStage = () => {
    if (activeIndex > 0) {
      setActiveTabId(STAGES[activeIndex - 1].id);
    }
  };

  // Handler for fetching all AI Ready Data
  const handleFetchAIReadyData = async () => {
    setIsFetchingAIData(true);
    setAiDataStatus({
      gbp: "loading",
      clarity: "loading",
    });

    try {
      await Promise.allSettled([
        (async () => {
          try {
            const gbpProp = selectedLocation?.googleProperties?.find(
              (p) => p.type === "gbp"
            );
            if (gbpProp?.account_id && gbpProp?.external_id) {
              await fetchGBPAIData(gbpProp.account_id, gbpProp.external_id);
              setAiDataStatus((prev) => ({ ...prev, gbp: "success" }));
            } else {
              setAiDataStatus((prev) => ({ ...prev, gbp: "error" }));
            }
          } catch (error) {
            logger.error("GBP AI Data Error:", error);
            setAiDataStatus((prev) => ({ ...prev, gbp: "error" }));
          }
        })(),
        (async () => {
          try {
            await fetchClarityAIData();
            setAiDataStatus((prev) => ({ ...prev, clarity: "success" }));
          } catch (error) {
            logger.error("Clarity AI Data Error:", error);
            setAiDataStatus((prev) => ({ ...prev, clarity: "error" }));
          }
        })(),
      ]);
    } catch (error) {
      logger.error("Error fetching AI Ready Data:", error);
    } finally {
      setIsFetchingAIData(false);
    }
  };

  const metrics = getStageMetrics();
  const insight = getStageInsight();

  // Check if current stage has error
  const hasCurrentStageError = () => {
    switch (activeTabId) {
      case "consideration":
        return gbpError;
      case "decision":
        return clarityError;
      default:
        return false;
    }
  };

  return (
    <div
      data-wizard-target="pji-stages"
      className={`min-h-screen bg-alloro-bg flex flex-col pb-24 ${className}`}
    >
      <div className="max-w-[1600px] w-full mx-auto relative flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="max-w-[1200px] mx-auto px-6 sm:px-12 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-medium text-alloro-navy tracking-tight">
                Patient Journey Insights
              </h1>
              <p className="text-slate-400 font-medium text-[11px] uppercase tracking-wider flex items-center gap-2 mt-1">
                <Activity size={14} className="text-alloro-orange" />
                AI-powered practice analytics • {STAGES.length} stages
              </p>
            </div>

            <button
              onClick={handleFetchAIReadyData}
              className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3 bg-alloro-orange text-white rounded-xl text-[11px] font-bold uppercase tracking-widest shadow-lg shadow-blue-900/10 active:scale-95 transition-all hover:bg-alloro-navy disabled:opacity-60"
              disabled={isFetchingAIData}
            >
              {isFetchingAIData ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Analyzing Systems...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Get AI Ready Data
                </>
              )}
            </button>
          </div>
        </header>

        <main className="w-full max-w-[1200px] mx-auto px-6 sm:px-12 py-10 space-y-10">
          {/* Engine Status Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl px-8 py-5 flex flex-wrap items-center gap-x-12 gap-y-3 text-[10px] font-bold text-slate-400 shadow-sm">
            <span className="uppercase tracking-[0.2em] opacity-60">
              Engine Status:
            </span>

            {/* GBP Status */}
            <span
              className={`flex items-center gap-2 ${
                aiDataStatus.gbp === "loading"
                  ? "text-blue-500"
                  : aiDataStatus.gbp === "success" ||
                    integrationStatus.gbp.connected
                  ? "text-green-600"
                  : aiDataStatus.gbp === "error" || integrationStatus.gbp.error
                  ? "text-red-500"
                  : "text-slate-400"
              }`}
            >
              {aiDataStatus.gbp === "loading" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : aiDataStatus.gbp === "success" ||
                integrationStatus.gbp.connected ? (
                <CheckCircle2 size={14} />
              ) : aiDataStatus.gbp === "error" ||
                integrationStatus.gbp.error ? (
                <XCircle size={14} />
              ) : (
                <CheckCircle2 size={14} />
              )}
              GBP
            </span>

            {/* Clarity Status */}
            <span
              className={`flex items-center gap-2 ${
                aiDataStatus.clarity === "loading"
                  ? "text-blue-500"
                  : aiDataStatus.clarity === "success" ||
                    integrationStatus.clarity.connected
                  ? "text-green-600"
                  : aiDataStatus.clarity === "error" ||
                    integrationStatus.clarity.error
                  ? "text-red-500"
                  : "text-slate-400"
              }`}
            >
              {aiDataStatus.clarity === "loading" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : aiDataStatus.clarity === "success" ||
                integrationStatus.clarity.connected ? (
                <CheckCircle2 size={14} />
              ) : aiDataStatus.clarity === "error" ||
                integrationStatus.clarity.error ? (
                <XCircle size={14} />
              ) : (
                <CheckCircle2 size={14} />
              )}
              Clarity
            </span>
          </div>

          {/* Stage Container */}
          <section className="bg-white rounded-[40px] border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden relative">
            <div className="p-10 sm:p-14">
              <div className="flex flex-col lg:flex-row items-start gap-12 mb-14">
                <div
                  className={`w-20 h-20 rounded-3xl flex items-center justify-center bg-white border-2 shadow-sm shrink-0 transition-colors ${
                    activeStage.id === "awareness"
                      ? "border-indigo-100 text-alloro-orange"
                      : "border-slate-100 text-alloro-navy"
                  }`}
                >
                  {getIcon(activeStage.iconName, 36)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <span
                      className={`w-10 h-10 rounded-2xl text-white flex items-center justify-center text-base font-bold font-heading ${
                        activeStage.id === "awareness"
                          ? "bg-alloro-orange shadow-lg shadow-blue-500/20"
                          : "bg-alloro-navy"
                      }`}
                    >
                      {activeIndex + 1}
                    </span>
                    <h3 className="font-black text-alloro-navy text-2xl sm:text-3xl font-heading tracking-tight">
                      {activeStage.title}
                    </h3>
                  </div>
                  <p className="text-base sm:text-lg text-slate-500 leading-relaxed font-medium max-w-3xl">
                    {activeStage.description}
                  </p>
                  {hasCurrentStageError() && (
                    <div className="mt-6 flex items-center gap-2 text-[10px] font-bold text-red-500 bg-red-50 px-4 py-1.5 rounded-full border border-red-100 uppercase tracking-widest w-fit">
                      <TrendingUp size={14} className="rotate-45" /> Error
                      loading {activeStage.dataSource}
                    </div>
                  )}
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-14">
                {metrics.map((metric, idx) => (
                  <motion.div
                    key={idx}
                    className="bg-white rounded-[32px] p-10 text-center border border-slate-100 shadow-sm hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1, duration: 0.3 }}
                  >
                    <div className="text-4xl sm:text-5xl font-black font-heading text-alloro-navy mb-3 tracking-tighter tabular-nums leading-none">
                      {metric.value}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      {metric.label}
                    </div>
                    <div className="text-[11px] text-slate-400 font-bold opacity-70">
                      {metric.subtext}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Insight Box */}
              <div className="bg-alloro-navy rounded-[32px] p-10 flex flex-col sm:flex-row items-center gap-8 border border-white/5 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-48 bg-alloro-orange/5 rounded-full -mr-24 -mt-24 blur-3xl"></div>
                <div className="w-16 h-16 rounded-[20px] bg-alloro-orange flex items-center justify-center text-white shadow-xl shadow-blue-500/20 shrink-0 relative z-10">
                  <Lightbulb size={32} />
                </div>
                <div className="relative z-10">
                  <h4 className="text-alloro-teal font-bold text-[10px] uppercase tracking-[0.25em] mb-2 leading-none">
                    Algorithmic Observation
                  </h4>
                  <p className="text-blue-50/90 text-lg sm:text-xl font-medium leading-relaxed tracking-tight">
                    {insight}
                  </p>
                </div>
              </div>
            </div>

            {/* Stage Navigation Footer */}
            <div className="px-10 py-6 border-t border-slate-100 bg-slate-50/30 flex justify-between items-center">
              <button
                onClick={prevStage}
                disabled={activeIndex === 0}
                className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-alloro-navy disabled:opacity-0 transition-all"
              >
                <ChevronLeft size={16} /> Previous Stage
              </button>
              <button
                onClick={nextStage}
                disabled={activeIndex === STAGES.length - 1}
                className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-alloro-orange hover:text-alloro-navy disabled:opacity-0 transition-all"
              >
                Next Stage <ChevronRight size={16} />
              </button>
            </div>
          </section>

          {/* Stepper Navigation */}
          <div className="relative pt-10 pb-12 max-w-4xl mx-auto">
            <div className="absolute top-[3.75rem] left-0 right-0 h-1.5 bg-slate-100 rounded-full"></div>
            <motion.div
              className="absolute top-[3.75rem] left-0 h-1.5 bg-alloro-orange rounded-full shadow-[0_0_15px_rgba(36,78,230,0.3)]"
              initial={{ width: 0 }}
              animate={{
                width: `${(activeIndex / (STAGES.length - 1)) * 100}%`,
              }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />

            <div className="flex justify-between relative z-10">
              {STAGES.map((stage, idx) => {
                const isActive = activeTabId === stage.id;
                const isPassed = activeIndex > idx;
                return (
                  <button
                    key={stage.id}
                    onClick={() => setActiveTabId(stage.id)}
                    className={`flex flex-col items-center group transition-all duration-300 ${
                      isActive ? "scale-110" : ""
                    }`}
                  >
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center border-4 transition-all shadow-sm ${
                        isActive
                          ? "bg-alloro-orange border-white text-white shadow-lg"
                          : isPassed
                          ? "bg-alloro-navy border-white text-white"
                          : "bg-white border-slate-100 text-slate-300 group-hover:border-slate-200"
                      }`}
                    >
                      {getIcon(stage.iconName, 20)}
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-widest mt-4 transition-colors ${
                        isActive ? "text-alloro-navy" : "text-slate-400"
                      }`}
                    >
                      {stage.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
