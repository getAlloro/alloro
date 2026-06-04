import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { DashboardAlertModel, DashboardAlertVariant } from "./types";

export type DashboardAlertProps = {
  alert: DashboardAlertModel;
  /** Behind-the-stack cards are inert (no focusable controls). */
  interactive?: boolean;
};

const VARIANT_BORDER: Record<DashboardAlertVariant, string> = {
  stale: "border-alloro-orange/45",
  nudge: "border-[#E8E4DD]",
  setup: "border-[#F3D6C4]",
};

const VARIANT_EYEBROW: Record<DashboardAlertVariant, string> = {
  stale: "text-alloro-orange",
  nudge: "text-alloro-orange",
  setup: "text-[#8A4A36]",
};

/**
 * DashboardAlert — one presentational alert card used by DashboardAlertStack on
 * both the main dashboard and the PMS Statistics surface. Light theme to match
 * the focus dashboard. The visual contract follows the legacy PMS upload nudge.
 */
export function DashboardAlert({ alert, interactive = true }: DashboardAlertProps) {
  const { variant, eyebrow, title, body, action, icon } = alert;

  return (
    <section
      className={`flex flex-col gap-4 rounded-[14px] border bg-[#FDFDFD] px-6 py-5 shadow-[0_14px_35px_rgba(17,21,28,0.06)] md:flex-row md:items-center md:justify-between ${VARIANT_BORDER[variant]}`}
    >
      <div className="min-w-0">
        <div
          className={`mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] ${VARIANT_EYEBROW[variant]}`}
        >
          {icon}
          {eyebrow}
        </div>
        <h3 className="font-display text-[22px] font-medium leading-tight tracking-tight text-[#1A1A1A]">
          {title}
        </h3>
        <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-[#6B7280]">
          {body}
        </p>
      </div>
      {action && (
        <AlertAction action={action} interactive={interactive} />
      )}
    </section>
  );
}

function AlertAction({
  action,
  interactive,
}: {
  action: NonNullable<DashboardAlertModel["action"]>;
  interactive: boolean;
}) {
  const className =
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-alloro-orange px-5 py-3 text-[12px] font-bold uppercase tracking-[0.12em] text-white shadow-[0_8px_20px_rgba(214,104,83,0.28)] transition-all hover:-translate-y-px hover:bg-[#B86650] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";

  const content = (
    <>
      {action.loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {action.label}
    </>
  );

  if (action.to) {
    return (
      <Link
        to={action.to}
        tabIndex={interactive ? undefined : -1}
        aria-hidden={interactive ? undefined : true}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={!interactive || action.loading}
      tabIndex={interactive ? undefined : -1}
      aria-hidden={interactive ? undefined : true}
      className={className}
    >
      {content}
    </button>
  );
}
