import { AlertCircle, Lock, PenLine, ShieldCheck } from "lucide-react";

export type PmsIngestionCardProps = {
  canUploadPMS: boolean;
  hasProperties: boolean;
  isWizardActive: boolean;
  isHighlighted: boolean;
  onOpenManualEntry: () => void;
  onOpenSettings: () => void;
};

export function PmsIngestionCard({
  canUploadPMS,
  hasProperties,
  isWizardActive,
  isHighlighted,
  onOpenManualEntry,
  onOpenSettings,
}: PmsIngestionCardProps) {
  const needsProperties = !hasProperties && !isWizardActive;

  return (
    <section
      id="data-ingestion-hub"
      data-wizard-target="pms-upload"
      className={`rounded-2xl bg-white p-6 shadow-premium transition-all duration-300 sm:p-8 lg:p-10 ${
        isHighlighted
          ? "border-2 border-alloro-orange ring-8 ring-alloro-orange/30"
          : "border border-slate-200"
      }`}
    >
      {canUploadPMS ? (
        <div className="flex flex-col items-center justify-between gap-8 text-center lg:flex-row lg:text-left">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-alloro-orange/10 text-alloro-orange">
              <PenLine className="h-6 w-6" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-alloro-orange">
              Data Ingestion
            </p>
            <h2 className="mt-2 font-display text-3xl font-medium tracking-tight text-alloro-navy">
              Update your referral data
            </h2>
            <p className="mt-3 text-base font-medium leading-7 text-slate-500">
              Keep this month’s referral and production numbers current. The
              existing entry flow stays unchanged.
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-3">
            <button
              type="button"
              onClick={onOpenManualEntry}
              className="inline-flex items-center gap-3 rounded-2xl bg-alloro-orange px-8 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-alloro-orange/20 transition-all duration-200 hover:scale-[1.02] hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-alloro-teal/30"
            >
              <PenLine className="h-5 w-5" />
              Upload month&apos;s data
            </button>
            <div className="flex flex-wrap justify-center gap-4 text-[9px] font-black uppercase tracking-widest text-slate-400">
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
      ) : (
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            {needsProperties ? <Lock className="h-7 w-7" /> : <AlertCircle className="h-7 w-7" />}
          </div>
          <div>
            <h2 className="font-display text-2xl font-medium tracking-tight text-alloro-navy">
              {needsProperties ? "Connect properties first" : "Upload restricted"}
            </h2>
            <p className="mt-2 max-w-md text-sm font-medium leading-6 text-slate-500">
              {needsProperties
                ? "Connect your Google Business Profile before updating PMS data."
                : "Only admins and managers can upload PMS data."}
            </p>
          </div>
          {needsProperties && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-xl bg-alloro-orange px-5 py-2.5 text-sm font-bold text-white transition-all hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-alloro-teal/30"
            >
              Go to Settings
            </button>
          )}
        </div>
      )}
    </section>
  );
}
