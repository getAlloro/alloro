import { BarChart3, Lock, PenLine, ShieldCheck, Sparkles } from "lucide-react";

export type PmsEmptyDashboardStateProps = {
  canUploadPMS: boolean;
  hasProperties: boolean;
  isWizardActive: boolean;
  isHighlighted: boolean;
  isProcessingInsights: boolean;
  onOpenManualEntry: () => void;
  onOpenSettings: () => void;
};

export function PmsEmptyDashboardState({
  canUploadPMS,
  hasProperties,
  isWizardActive,
  isHighlighted,
  isProcessingInsights,
  onOpenManualEntry,
  onOpenSettings,
}: PmsEmptyDashboardStateProps) {
  const needsProperties = !hasProperties && !isWizardActive;
  const primaryCopy = isProcessingInsights
    ? "Your first PMS dataset is being processed. The dashboard will populate automatically when Alloro finishes analysis."
    : "Upload your first PMS dataset and Alloro will turn it into production trends, referral mix, source rankings, and growth actions.";

  return (
    <section
      id="data-ingestion-hub"
      data-wizard-target="pms-upload"
      className={`relative overflow-hidden rounded-2xl bg-white p-8 shadow-premium sm:p-10 ${
        isHighlighted
          ? "border-2 border-alloro-orange ring-8 ring-alloro-orange/30"
          : "border border-slate-200"
      }`}
    >
      <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-alloro-orange/10 blur-3xl" />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] lg:items-center">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-alloro-orange/10 bg-alloro-orange/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-alloro-orange">
            <Sparkles className="h-3.5 w-3.5" />
            Empty Dashboard
          </div>
          <h2 className="font-display text-3xl font-medium tracking-tight text-alloro-navy sm:text-4xl">
            Your PMS intelligence will live here
          </h2>
          <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-slate-500">
            {primaryCopy}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-alloro-orange/10 text-alloro-orange">
            <BarChart3 className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-black text-alloro-navy">
            {isProcessingInsights ? "Processing is underway" : "Start with PMS data"}
          </h3>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
            {needsProperties
              ? "Connect your Google Business Profile before uploading PMS data."
              : "The existing PMS upload and manual entry flow stays unchanged."}
          </p>

          <button
            type="button"
            onClick={needsProperties ? onOpenSettings : onOpenManualEntry}
            disabled={!canUploadPMS && !needsProperties}
            className="mt-5 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-alloro-orange px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-alloro-orange/20 transition-all duration-200 hover:scale-[1.02] hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-alloro-teal/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {needsProperties ? <Lock className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
            {needsProperties ? "Go to settings" : "Upload PMS data"}
          </button>

          <div className="mt-4 flex flex-wrap justify-center gap-4 text-[9px] font-black uppercase tracking-widest text-slate-400">
            <span className="inline-flex items-center gap-2">
              <Lock className="h-3.5 w-3.5" />
              HIPAA secure
            </span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
              Encrypted
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
