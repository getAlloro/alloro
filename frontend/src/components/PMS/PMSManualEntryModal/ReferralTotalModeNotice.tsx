import { AlertCircle } from "lucide-react";

export function ReferralTotalModeNotice() {
  return (
    <div
      className="mt-3 flex items-start gap-2 rounded-xl border border-alloro-orange/30 bg-alloro-orange/5 px-4 py-3 text-xs text-alloro-navy"
      role="status"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-alloro-orange" />
      <p>
        The referral total now uses the source-row sum because source or
        referral data was edited.
      </p>
    </div>
  );
}
