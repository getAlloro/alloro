import {
  AlertCircle,
  Database,
  Lock,
  PenLine,
} from "lucide-react";
import { PmsDataTrendGraph } from "./PmsDataTrendGraph";

export type PmsDataAvailabilityMonth = {
  month: string;
  label: string;
  status: "active" | "missing" | "ready";
  isLatest: boolean;
  productionTotal: number | null;
  totalReferrals: number | null;
};

export type PmsIngestionCardProps = {
  canUploadPMS: boolean;
  hasProperties: boolean;
  isWizardActive: boolean;
  isHighlighted: boolean;
  canOpenDataManager?: boolean;
  availabilityMonths?: PmsDataAvailabilityMonth[];
  onOpenManualEntry: () => void;
  onOpenDataManager?: () => void;
  onSelectDataMonth?: (month: string) => void;
  onOpenSettings: () => void;
};

export function PmsIngestionCard({
  canUploadPMS,
  hasProperties,
  isWizardActive,
  isHighlighted,
  canOpenDataManager = false,
  availabilityMonths = [],
  onOpenManualEntry,
  onOpenDataManager,
  onSelectDataMonth,
  onOpenSettings,
}: PmsIngestionCardProps) {
  const needsProperties = !hasProperties && !isWizardActive;

  return (
    <section
      id="data-ingestion-hub"
      data-wizard-target="pms-upload"
      className={`rounded-[14px] bg-white p-6 shadow-premium transition-all duration-300 sm:p-8 lg:p-10 ${
        isHighlighted
          ? "border-2 border-alloro-orange ring-8 ring-alloro-orange/30"
          : "border border-line-soft"
      }`}
    >
      {canUploadPMS ? (
        <div className="grid gap-8 text-center lg:grid-cols-[minmax(0,1fr)_minmax(380px,520px)] lg:items-start lg:text-left">
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
            <p className="mt-3 text-base font-medium leading-7 text-[color:var(--color-pm-text-secondary)]">
              Upload your latest month’s referral and production numbers. Re-upload
              a month you’ve already saved to overwrite its existing entry.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={onOpenManualEntry}
                className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-alloro-orange px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-alloro-orange/20 transition-all duration-200 hover:scale-[1.02] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/30"
              >
                <PenLine className="h-4 w-4" />
                Upload New Data
              </button>
              {canOpenDataManager && onOpenDataManager && (
                <button
                  type="button"
                  onClick={onOpenDataManager}
                  className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-line-soft bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-alloro-navy shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-alloro-orange/40 hover:bg-alloro-orange/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/25"
                >
                  <Database className="h-4 w-4 text-alloro-orange" />
                  Manage Data
                </button>
              )}
            </div>

            {availabilityMonths.length > 0 && (
              <PmsDataTrendGraph
                months={availabilityMonths}
                onSelectMonth={onSelectDataMonth}
              />
            )}
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
            <p className="mt-2 max-w-md text-sm font-medium leading-6 text-[color:var(--color-pm-text-secondary)]">
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
