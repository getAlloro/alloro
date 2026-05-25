import {
  AlertTriangle,
  CreditCard,
  DollarSign,
  History,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";
import type { MissionControlSummary as Summary } from "../../../api/admin-mission-control";

export type MissionControlSummaryProps = {
  summary: Summary;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function MissionControlSummary({ summary }: MissionControlSummaryProps) {
  const delta = summary.monthToDatePaid - summary.previousMonthPaid;
  const deltaLabel = `${delta >= 0 ? "+" : "-"}${currency.format(Math.abs(delta))}`;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Expected MRR"
        value={currency.format(summary.expectedMrr)}
        hint={`${summary.activeStripeClientCount} active Stripe clients`}
        icon={<DollarSign className="h-4.5 w-4.5" />}
        tone="teal"
      />
      <MetricCard
        label="Received MTD"
        value={currency.format(summary.monthToDatePaid)}
        hint={`${deltaLabel} vs previous month`}
        icon={<TrendingUp className="h-4.5 w-4.5" />}
        tone={delta >= 0 ? "green" : "red"}
      />
      <MetricCard
        label="Lifetime Received"
        value={currency.format(summary.lifetimePaid)}
        hint="Paid Stripe invoices found"
        icon={<History className="h-4.5 w-4.5" />}
        tone="orange"
      />
      <MetricCard
        label="Payment Attention"
        value={summary.noPaymentMethodCount + summary.failedOrPastDueCount}
        hint={`${summary.noPaymentMethodCount} no method, ${summary.failedOrPastDueCount} past due`}
        icon={<AlertTriangle className="h-4.5 w-4.5" />}
        tone="red"
      />

      <div className="rounded-xl border border-gray-200 bg-white p-4 md:col-span-2 xl:col-span-4">
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <MiniStat
            icon={<CreditCard className="h-4 w-4" />}
            label="Admin-granted active"
            value={summary.adminGrantedActiveCount}
          />
          <MiniStat
            icon={<WalletCards className="h-4 w-4" />}
            label="No payment method"
            value={summary.noPaymentMethodCount}
          />
          <MiniStat
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Canceling"
            value={summary.cancelingCount}
          />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: ReactNode;
  tone: "teal" | "orange" | "green" | "red";
}) {
  const toneClass = {
    teal: "bg-alloro-teal/10 text-alloro-teal",
    orange: "bg-alloro-orange/10 text-alloro-orange",
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
  }[tone];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-black tabular-nums text-alloro-navy">
            {value}
          </p>
        </div>
        <div className={`rounded-lg p-2.5 ${toneClass}`}>{icon}</div>
      </div>
      <p className="mt-2 text-xs font-medium text-gray-500">{hint}</p>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
      <span className="inline-flex items-center gap-2 font-semibold text-gray-600">
        {icon}
        {label}
      </span>
      <span className="font-black tabular-nums text-alloro-navy">{value}</span>
    </div>
  );
}
