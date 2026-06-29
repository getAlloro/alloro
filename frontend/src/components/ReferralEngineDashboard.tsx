import { useEffect, useState, useRef } from "react";
import {
  Upload,
  Download,
  ShieldCheck,
  Calendar,
  BarChart3,
  Lock,
  TrendingDown,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { uploadPMSData } from "../api/pms";
import { adminFetch } from "../api";
import { showUploadToast } from "../lib/toast";
import { useLocationContext } from "../contexts/locationContext";
import { useLabels } from "../hooks/useLabels";
import { useAuth } from "../hooks/useAuth";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../contexts/OnboardingWizardContext";
import { logger } from "../lib/logger";
import { usePmsCopy } from "./PMS/pmsCopy";
import { resolveOrgType } from "../constants/orgLabels";
import { formatGeneratedCopyForOrg } from "../utils/generatedCopy";
import type {
  ReferralEngineData,
  ReferralEngineDashboardProps,
  PMSTrendMonth,
} from "./referralEngineDashboard.types";
import { formatCurrency } from "./referralEngineDashboard.utils";
import { MetricCard } from "./ReferralEngineDashboard/MetricCard";
import { CompactTag } from "./ReferralEngineDashboard/CompactTag";
import { LoadingState } from "./ReferralEngineDashboard/LoadingState";
import { ErrorState } from "./ReferralEngineDashboard/ErrorState";

export function ReferralEngineDashboard(props: ReferralEngineDashboardProps) {
  const labels = useLabels();
  const pmsCopy = usePmsCopy();
  const { userProfile } = useAuth();
  const orgType = resolveOrgType(userProfile?.organizationType);
  const isGeneric = orgType === "generic";
  const { signalContentReady } = useLocationContext();
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();
  const [fetchedData, setFetchedData] = useState<ReferralEngineData | null>(
    null
  );
  const [loading, setLoading] = useState(!isWizardActive);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [isExporting, setIsExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    const fetchReferralEngineData = async () => {
      if (isWizardActive) {
        setLoading(false);
        return;
      }

      if (!props.organizationId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const locParam = props.locationId ? `?locationId=${props.locationId}` : "";
        const response = await adminFetch(
          `/api/agents/getLatestReferralEngineOutput/${props.organizationId}${locParam}`
        );

        if (!response.ok) {
          if (response.status === 404) {
            setFetchedData(null);
            setLoading(false);
            return;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.data) {
          const dataToSet = Array.isArray(result.data)
            ? result.data[0]
            : result.data;
          setFetchedData(dataToSet);
        } else {
          setFetchedData(null);
        }
      } catch (err: unknown) {
        logger.error("Failed to fetch referral engine data:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load referral engine data"
        );
      } finally {
        setLoading(false);
        signalContentReady();
      }
    };

    fetchReferralEngineData();
  }, [props.organizationId, props.locationId, isWizardActive]);

  const data = isWizardActive
    ? (wizardDemoData?.referralEngineData as ReferralEngineData | undefined) ?? props.data ?? fetchedData
    : props.data ?? fetchedData;

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    const validTypes = [".csv", ".xlsx", ".xls", ".txt"];
    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();
    if (!validTypes.includes(fileExtension)) {
      setUploadStatus("error");
      setUploadMessage("Please upload a CSV, Excel, or text file.");
      return;
    }

    setIsUploading(true);
    setUploadStatus("idle");
    setUploadMessage("");

    try {
      const domain = props.organizationId?.toString() || "default-domain";

      const result = await uploadPMSData({
        domain,
        file,
        pmsType: "auto-detect",
      });

      if (result.success) {
        setUploadStatus("success");
        setUploadMessage(
          pmsCopy.processingMessage
        );

        showUploadToast(
          pmsCopy.toastReceivedTitle,
          "We'll notify when ready for checking"
        );

        if (typeof window !== "undefined") {
          const event = new CustomEvent("pms:job-uploaded", {
            detail: { clientId: domain },
          });
          window.dispatchEvent(event);
        }

        setTimeout(() => {
          setUploadStatus("idle");
          setUploadMessage("");
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }, 3000);
      } else {
        throw new Error(result.error || "Upload failed");
      }
    } catch (err) {
      logger.error("PMS Upload error:", err);
      setUploadStatus("error");
      setUploadMessage(
        err instanceof Error ? err.message : "Upload failed. Please try again."
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => setIsExporting(false), 1500);
  };

  const calculateMetrics = () => {
    if (!data) {
      return {
        mktProduction: "$0",
        docProduction: "$0",
        totalStarts: "0",
        confidence: "0%",
        mktTrend: undefined,
        docTrend: undefined,
        startsTrend: undefined,
      };
    }

    const mktProd =
      data.non_doctor_referral_matrix?.reduce(
        (sum, r) => sum + (r.net_production || 0),
        0
      ) || 0;
    const docProd =
      data.doctor_referral_matrix?.reduce(
        (sum, r) => sum + (r.net_production || 0),
        0
      ) || 0;
    const totalStarts =
      (data.non_doctor_referral_matrix?.reduce(
        (sum, r) => sum + (r.referred || 0),
        0
      ) || 0) +
      (data.doctor_referral_matrix?.reduce(
        (sum, r) => sum + (r.referred || 0),
        0
      ) || 0);

    return {
      mktProduction: formatCurrency(mktProd),
      docProduction: formatCurrency(docProd),
      totalStarts: totalStarts.toString(),
      confidence: data.confidence
        ? `${(data.confidence * 100).toFixed(1)}%`
        : "99.4%",
      mktTrend: "+11%",
      docTrend: "+4%",
      startsTrend: "+5%",
    };
  };

  const metrics = calculateMetrics();

  const generateTrendData = (): PMSTrendMonth[] => {
    return [
      {
        month: "Jul",
        year: 2024,
        selfReferrals: 8,
        doctorReferrals: 2,
        total: 10,
      },
      {
        month: "Aug",
        year: 2024,
        selfReferrals: 12,
        doctorReferrals: 3,
        total: 15,
      },
      {
        month: "Sep",
        year: 2024,
        selfReferrals: 15,
        doctorReferrals: 4,
        total: 19,
      },
      {
        month: "Oct",
        year: 2024,
        selfReferrals: 18,
        doctorReferrals: 5,
        total: 23,
      },
      {
        month: "Nov",
        year: 2024,
        selfReferrals: 14,
        doctorReferrals: 4,
        total: 18,
      },
      {
        month: "Dec",
        year: 2024,
        selfReferrals: 21,
        doctorReferrals: 6,
        total: 27,
      },
    ];
  };

  const trendData = generateTrendData();
  const partnerLabel = pmsCopy.partnerLegendLabel;
  const partnerPlural = isGeneric ? "Partners" : "Doctors";
  const avgPerUnitLabel = isGeneric ? "Avg / Record" : "Avg / Ref";
  const velocityTitle = isGeneric
    ? "Record Pace Pipeline"
    : "Referral Velocity Pipeline";
  const displayCategory = (category: string) => {
    if (category === "Doctor") return partnerLabel;
    if (category === "Insurance" && isGeneric) return "Other";
    return category;
  };
  const displayFilter = (filter: string) => {
    if (filter === "Doctor") return partnerLabel;
    return filter;
  };
  const formatGenerated = (value: string) =>
    formatGeneratedCopyForOrg(value, userProfile?.organizationType);

  const getAllSources = () => {
    const sources: Array<{
      id: string;
      name: string;
      category: string;
      count: number;
      avgPerReferral: number | null;
      production: number;
      notes: string;
    }> = [];

    data?.doctor_referral_matrix?.forEach((doc, idx) => {
      sources.push({
        id: `doc-${idx}`,
        name: doc.referrer_name || "Unknown Doctor",
        category: "Doctor",
        count: doc.referred || 0,
        avgPerReferral: doc.avg_production_per_referral ?? null,
        production: doc.net_production || 0,
        notes: formatGenerated(
          doc.notes ||
          (isGeneric
            ? "Partner source requires active follow-up."
            : "Critical peer relationship requires active stewardship.")
        ),
      });
    });

    data?.non_doctor_referral_matrix?.forEach((source, idx) => {
      sources.push({
        id: `mkt-${idx}`,
        name: source.source_label || source.source_key || "Unknown Source",
        category: source.source_type === "digital" ? "Marketing" : "Insurance",
        count: source.referred || 0,
        avgPerReferral: source.avg_production_per_referral ?? null,
        production: source.net_production || 0,
        notes: formatGenerated(
          source.notes ||
          (isGeneric
            ? "Primary source with a useful revenue signal."
            : "Dominant digital channel. High-value intake noted via GMB.")
        ),
      });
    });

    if (activeFilter === "Doctor") {
      return sources.filter((s) => s.category === "Doctor");
    } else if (activeFilter === "Marketing") {
      return sources.filter((s) => s.category === "Marketing");
    }

    return sources;
  };

  const filteredSources = getAllSources();

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32 selection:bg-alloro-orange selection:text-white">
      {!data && (
        <div className="bg-alloro-orange text-white text-[10px] font-black uppercase tracking-widest py-3 px-4 text-center border-b border-white/10 flex items-center justify-center gap-2 shadow-sm relative z-[60]">
          <TrendingDown size={14} className="text-white" />
          <span>
            Revenue attribution analysis has not been run yet. Please upload
            your latest {pmsCopy.exportName} to begin the analysis.
          </span>
        </div>
      )}
      <div className="max-w-[1400px] mx-auto relative flex flex-col">
        <header className="glass-header border-b border-black/5 lg:sticky lg:top-0 z-40">
          <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="w-10 h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg">
                <BarChart3 size={20} />
              </div>
              <div className="flex flex-col text-left">
                <h1 className="text-[11px] font-black font-heading text-alloro-textDark uppercase tracking-[0.25em] leading-none">
                  Revenue Sources
                </h1>
                <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5 hidden sm:inline">
                  Where your revenue comes from
                </span>
              </div>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-3 px-6 py-3.5 bg-white border border-black/5 text-alloro-navy rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:border-alloro-orange/20 transition-all shadow-premium active:scale-95"
            >
              <Download
                size={14}
                className={isExporting ? "animate-bounce" : ""}
              />
              <span className="hidden sm:inline">
                {isExporting ? "Exporting..." : "Export Attribution Hub"}
              </span>
            </button>
          </div>
        </header>

        <main className="w-full max-w-[1100px] mx-auto px-6 lg:px-10 py-10 lg:py-16 space-y-12 lg:space-y-20">
          <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 text-left pt-2">
            <div className="flex items-center gap-4 mb-3">
              <div className="px-3 py-1.5 bg-green-50 rounded-lg text-green-600 text-[10px] font-black uppercase tracking-widest border border-green-100 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Revenue Tracking On
              </div>
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-medium text-alloro-navy tracking-tight leading-tight mb-2">
              Revenue Details.
            </h1>
            <p className="text-base lg:text-lg text-slate-500 font-medium tracking-tight leading-relaxed max-w-3xl">
              See which{" "}
              <span className="text-alloro-orange underline underline-offset-4 font-semibold">
                Marketing or {partnerPlural}
              </span>{" "}
              are sending you the most work.
            </p>
          </section>

          <section className="space-y-6">
            <div className="flex items-center gap-4 px-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-alloro-textDark/40 whitespace-nowrap">
                Monthly Totals
              </h3>
              <div className="h-px w-full bg-black/10"></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              <MetricCard
                label={`Marketing ${pmsCopy.moneyLabel}`}
                value={metrics.mktProduction}
                trend={metrics.mktTrend}
                isHighlighted
              />
              <MetricCard
                label={`${partnerLabel} ${pmsCopy.moneyLabel}`}
                value={metrics.docProduction}
                trend={metrics.docTrend}
              />
              <MetricCard
                label={pmsCopy.countSummaryLabel}
                value={metrics.totalStarts}
                trend={metrics.startsTrend}
              />
              <MetricCard
                label="Confidence Score"
                value={metrics.confidence}
                trend="Stable"
              />
            </div>
          </section>

          <section className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden group">
            <div className="px-10 py-8 border-b border-black/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-alloro-bg flex items-center justify-center text-alloro-orange">
                  <Calendar size={22} />
                </div>
                <div className="text-left">
                  <h2 className="text-xl font-black font-heading text-alloro-navy tracking-tight leading-none">
                    {velocityTitle}
                  </h2>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
                    Trailing 6-month Synced Analysis
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-8 bg-slate-50 px-6 py-3 rounded-2xl border border-black/5">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-alloro-orange"></div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Marketing
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-alloro-navy"></div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    {partnerLabel}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-10 lg:p-14 space-y-10">
              {trendData.map((monthData, index) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-12 group/row"
                >
                  <div className="w-24 sm:text-right shrink-0">
                    <div className="text-sm font-black text-alloro-navy uppercase tracking-widest">
                      {monthData.month}
                    </div>
                    <div className="text-[10px] text-slate-300 font-bold uppercase tracking-widest mt-1">
                      FY {monthData.year}
                    </div>
                  </div>
                  <div className="flex-1 space-y-3.5">
                    <div className="relative h-6 flex items-center gap-5">
                      <div
                        className="h-full bg-alloro-orange rounded-xl shadow-lg shadow-alloro-orange/10 transition-all duration-1000 group-hover/row:brightness-110"
                        style={{
                          width: `${(monthData.selfReferrals / 25) * 100}%`,
                        }}
                      />
                      <span className="text-sm font-black text-alloro-navy tabular-nums font-sans">
                        {monthData.selfReferrals}
                      </span>
                    </div>
                    <div className="relative h-4 flex items-center gap-5">
                      <div
                        className="h-full bg-alloro-navy/80 rounded-xl transition-all duration-1000"
                        style={{
                          width: `${(monthData.doctorReferrals / 25) * 100}%`,
                        }}
                      />
                      <span className="text-[11px] font-black text-slate-400 tabular-nums font-sans">
                        {monthData.doctorReferrals}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section data-wizard-target="re-matrix" className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden">
            <div className="px-10 py-8 border-b border-black/5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
              <div className="text-left">
                <h2 className="text-xl font-black font-heading text-alloro-navy tracking-tight">
                  Attribution Master Matrix
                </h2>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
                  Direct {pmsCopy.moneyLabel} Sync
                </p>
              </div>
              <div className="flex p-1.5 bg-slate-50 border border-black/5 rounded-2xl overflow-x-auto w-full lg:w-auto">
                {["All", "Doctor", "Marketing"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`flex-1 lg:flex-none px-6 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all ${
                      activeFilter === filter
                        ? "bg-white text-alloro-navy shadow-md border border-black/5"
                        : "text-slate-400 hover:text-alloro-navy"
                    }`}
                  >
                    {displayFilter(filter)}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] border-b border-black/5">
                  <tr>
                    <th className="px-10 py-5 w-[25%]">Ledger Source</th>
                    <th className="px-4 py-5 text-center w-[12%]">Volume</th>
                    <th className="px-4 py-5 text-right w-[15%]">{avgPerUnitLabel}</th>
                    <th className="px-4 py-5 text-right w-[18%]">{pmsCopy.moneyLabel}</th>
                    <th className="px-10 py-5 w-[30%]">Intelligence Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSources.length > 0 ? (
                    filteredSources.map((source) => (
                      <tr
                        key={source.id}
                        className="hover:bg-slate-50/30 transition-all group"
                      >
                        <td className="px-10 py-7 text-left">
                          <div className="flex flex-col">
                            <span className="font-black text-alloro-navy text-[15px] leading-tight tracking-tight group-hover:text-alloro-orange transition-colors">
                              {source.name}
                            </span>
                            <CompactTag status={displayCategory(source.category)} />
                          </div>
                        </td>
                        <td className="px-4 py-7 text-center font-black text-alloro-navy text-xl font-sans tabular-nums">
                          {source.count}
                        </td>
                        <td className="px-4 py-7 text-right font-bold text-slate-500 tabular-nums text-base font-sans">
                          {source.avgPerReferral != null
                            ? formatCurrency(source.avgPerReferral)
                            : "N/A"}
                        </td>
                        <td className="px-4 py-7 text-right font-black text-alloro-navy tabular-nums text-xl font-sans">
                          ${source.production.toLocaleString()}
                        </td>
                        <td className="px-10 py-7 text-left">
                          <p className="text-base text-slate-500 font-medium leading-relaxed tracking-tight line-clamp-2">
                            {source.notes}
                          </p>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-10 py-12 text-center text-slate-400"
                      >
                        No sources found for the selected filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white rounded-3xl border border-black/5 shadow-premium p-10 lg:p-16 flex flex-col md:flex-row items-center justify-between gap-12 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-96 h-96 bg-alloro-orange/[0.03] rounded-full blur-3xl -mr-48 -mt-48 pointer-events-none group-hover:bg-alloro-orange/[0.06] transition-all duration-700"></div>

            <div className="space-y-8 flex-1 text-left relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-alloro-navy text-white rounded-2xl flex items-center justify-center shadow-2xl">
                  <Upload size={24} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-black uppercase tracking-[0.3em] text-alloro-orange">
                    Ledger Ingestion
                  </span>
                  <h3 className="text-3xl font-black font-heading text-alloro-navy tracking-tight mt-1">
                    Sync your {labels.orgNoun}.
                  </h3>
                </div>
              </div>
              <p className="text-lg text-slate-500 font-medium tracking-tight leading-relaxed max-w-lg">
                Upload your latest{" "}
                <span className="text-alloro-navy font-black">
                  {pmsCopy.exportName}
                </span>{" "}
                to refresh all intelligence models instantly.
              </p>
              <div className="flex flex-wrap items-center gap-8 pt-4">
                <div className="flex items-center gap-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <ShieldCheck size={16} className="text-green-500" />
                  {pmsCopy.secureBadge}
                </div>
                <div className="flex items-center gap-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <Lock size={16} className="text-alloro-orange" /> AES-256
                  ENCRYPTED
                </div>
              </div>
            </div>

            <label
              className={`w-full md:w-[400px] h-[300px] border-2 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all group/upload shrink-0 relative z-10 ${
                isDragOver
                  ? "border-alloro-orange bg-alloro-orange/5"
                  : uploadStatus === "success"
                  ? "border-green-400 bg-green-50"
                  : uploadStatus === "error"
                  ? "border-red-400 bg-red-50"
                  : "border-slate-200 bg-slate-50/50 hover:border-alloro-orange hover:bg-white"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {isUploading ? (
                <>
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-premium border border-black/5 mb-5">
                    <Loader2
                      size={28}
                      className="animate-spin text-alloro-orange"
                    />
                  </div>
                  <span className="text-base font-black text-alloro-navy font-heading">
                    Uploading...
                  </span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-3">
                    Please wait
                  </span>
                </>
              ) : uploadStatus === "success" ? (
                <>
                  <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center shadow-premium border border-green-200 mb-5">
                    <CheckCircle size={28} className="text-green-600" />
                  </div>
                  <span className="text-base font-black text-green-700 font-heading">
                    Upload Successful!
                  </span>
                  <span className="text-[10px] font-bold text-green-600 mt-3 text-center px-4">
                    {uploadMessage}
                  </span>
                </>
              ) : uploadStatus === "error" ? (
                <>
                  <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center shadow-premium border border-red-200 mb-5">
                    <AlertCircle size={28} className="text-red-600" />
                  </div>
                  <span className="text-base font-black text-red-700 font-heading">
                    Upload Failed
                  </span>
                  <span className="text-[10px] font-bold text-red-600 mt-3 text-center px-4">
                    {uploadMessage}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setUploadStatus("idle");
                      setUploadMessage("");
                    }}
                    className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
                  >
                    Try Again
                  </button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-premium border border-black/5 mb-5 group-hover/upload:scale-110 group-hover/upload:text-alloro-orange transition-all">
                    <Upload size={28} />
                  </div>
                  <span className="text-base font-black text-alloro-navy font-heading">
                    {isDragOver ? "Drop file here" : `Drop ${pmsCopy.exportName}`}
                  </span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-3">
                    Max Ingestion: 50MB
                  </span>
                  <span className="text-[9px] font-bold text-alloro-orange mt-2">
                    Click or drag to upload
                  </span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".csv,.xlsx,.xls,.txt"
                onChange={handleFileInputChange}
              />
            </label>
          </section>
        </main>
      </div>
    </div>
  );
}

export default ReferralEngineDashboard;
