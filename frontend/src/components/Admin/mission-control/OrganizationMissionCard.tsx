import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  Bell,
  Building2,
  ChevronDown,
  CheckCircle2,
  CreditCard,
  Database,
  FileCode,
  MapPin,
  SearchCheck,
  Users,
} from "lucide-react";
import type { MissionControlOrganization } from "../../../api/admin-mission-control";
import { MissionControlSparkline } from "./MissionControlSparkline";
import { MissionControlPilotMenu } from "./MissionControlPilotMenu";
import { ActiveIntegrationLogos } from "../integrations/ActiveIntegrationLogos";

export type OrganizationMissionCardProps = {
  organization: MissionControlOrganization;
  index: number;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function OrganizationMissionCard({
  organization,
  index,
}: OrganizationMissionCardProps) {
  const navigate = useNavigate();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hasRisk = organization.riskFlags.length > 0;
  const hasConnectedWebsite = Boolean(organization.websiteStatus);
  const sparkTone: "red" | "teal" | "orange" = hasRisk
    ? "red"
    : organization.monthToDatePaid > 0
      ? "teal"
      : "orange";
  const openOrganization = () => navigate(`/admin/organizations/${organization.id}`);
  const openWebsite = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    navigate(`/admin/organizations/${organization.id}?section=website`);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openOrganization();
    }
  };

  return (
    <motion.article
      role="button"
      tabIndex={0}
      onClick={openOrganization}
      onKeyDown={handleKeyDown}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      className="group h-full cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-1 hover:border-alloro-orange/40 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-alloro-teal/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-alloro-navy text-white">
            <Building2 className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-black text-alloro-navy">
              {organization.name}
            </h3>
            <p className="truncate text-xs font-medium text-gray-500">
              {organization.domain || "No domain assigned"}
            </p>
          </div>
        </div>
        <div
          className="shrink-0"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <MissionControlPilotMenu
            users={organization.adminUsers}
            organizationName={organization.name}
          />
        </div>
      </div>
      {(hasConnectedWebsite || (organization.activeIntegrations?.length ?? 0) > 0) && (
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {hasConnectedWebsite && (
            <button
              type="button"
              onClick={openWebsite}
              className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-bold text-green-700 transition-all hover:border-green-300 hover:bg-green-100"
              aria-label={`Open website for ${organization.name}`}
            >
              <FileCode className="h-3.5 w-3.5" />
              Website
            </button>
          )}
          <ActiveIntegrationLogos integrations={organization.activeIntegrations} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MoneyStat label="Expected" value={organization.expectedMonthlyAmount} />
        <MoneyStat label="Lifetime" value={organization.lifetimePaid} />
      </div>

      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Paid Invoices
          </span>
          <span className="text-[11px] font-black tabular-nums text-alloro-navy">
            {currency.format(organization.monthToDatePaid)} MTD
          </span>
        </div>
        <MissionControlSparkline
          data={organization.paymentSparkline}
          tone={sparkTone}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <StatusChip organization={organization} />
        {organization.hasGbpConnection && (
          <Chip label="GBP" tone="green" icon={<CheckCircle2 className="h-3 w-3" />} />
        )}
        {organization.riskFlags.slice(0, 2).map((flag) => (
          <Chip
            key={flag}
            label={formatRiskFlag(flag)}
            tone="red"
            icon={<AlertTriangle className="h-3 w-3" />}
          />
        ))}
      </div>

      <div
        className="mt-4"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          className="flex w-full items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-600 transition-colors hover:border-gray-200 hover:bg-gray-100"
          aria-expanded={detailsOpen}
        >
          Quick details
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${
              detailsOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        {detailsOpen && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
            <Signal icon={<Users className="h-3.5 w-3.5" />} value={countLabel(organization.userCount, "user")} />
            <Signal icon={<MapPin className="h-3.5 w-3.5" />} value={countLabel(organization.locationCount, "location")} />
            <Signal icon={<Bell className="h-3.5 w-3.5" />} value={`${organization.unreadNotificationCount} unread`} />
            <Signal icon={<Database className="h-3.5 w-3.5" />} value={organization.latestPms ? organization.latestPms.status : "No PMS"} />
            <Signal icon={<SearchCheck className="h-3.5 w-3.5" />} value={organization.latestRanking ? organization.latestRanking.status : "No rank"} />
            <Signal icon={<CreditCard className="h-3.5 w-3.5" />} value={paymentMethodLabel(organization)} />
          </div>
        )}
      </div>
    </motion.article>
  );
}

function MoneyStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-base font-black tabular-nums text-alloro-navy">
        {currency.format(value)}
      </p>
    </div>
  );
}

function StatusChip({ organization }: { organization: MissionControlOrganization }) {
  if (organization.archivedAt) {
    return <Chip label="Archived" tone="gray" icon={<Archive className="h-3 w-3" />} />;
  }
  if (organization.stripeStatus === "active") {
    return <Chip label="Stripe active" tone="green" icon={<CheckCircle2 className="h-3 w-3" />} />;
  }
  if (organization.stripeStatus === "admin_granted") {
    return <Chip label="Admin granted" tone="orange" icon={<CreditCard className="h-3 w-3" />} />;
  }
  return <Chip label={formatRiskFlag(organization.stripeStatus)} tone="gray" icon={<CreditCard className="h-3 w-3" />} />;
}

function Chip({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: "green" | "orange" | "red" | "gray";
  icon: ReactNode;
}) {
  const classes = {
    green: "border-green-200 bg-green-50 text-green-700",
    orange: "border-alloro-orange/20 bg-alloro-orange/10 text-alloro-orange",
    red: "border-red-200 bg-red-50 text-red-700",
    gray: "border-gray-200 bg-gray-50 text-gray-600",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${classes}`}>
      {icon}
      {label}
    </span>
  );
}

function Signal({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-gray-50 px-2 py-1.5">
      <span className="shrink-0 text-gray-400">{icon}</span>
      <span className="truncate">{value}</span>
    </span>
  );
}

function paymentMethodLabel(organization: MissionControlOrganization): string {
  if (!organization.paymentMethod) return "No method";
  return `${organization.paymentMethod.brand} ${organization.paymentMethod.last4}`;
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatRiskFlag(value: string): string {
  return value.replace(/_/g, " ");
}
