import { Plus, Radar, RefreshCw, Search } from "lucide-react";
import { motion } from "framer-motion";

export type MissionControlFilter =
  | "all"
  | "no-payment-method"
  | "active-stripe"
  | "admin-granted"
  | "archived"
  | "test";

export type MissionControlHeaderProps = {
  organizationCount: number;
  search: string;
  filter: MissionControlFilter;
  isRefreshing: boolean;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: MissionControlFilter) => void;
  onRefresh: () => void;
  onCreate: () => void;
};

const FILTERS: Array<{ value: MissionControlFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "no-payment-method", label: "No Method" },
  { value: "active-stripe", label: "Stripe Active" },
  { value: "admin-granted", label: "Admin Granted" },
  { value: "archived", label: "Archived" },
  { value: "test", label: "Test" },
];

export function MissionControlHeader({
  organizationCount,
  search,
  filter,
  isRefreshing,
  onSearchChange,
  onFilterChange,
  onRefresh,
  onCreate,
}: MissionControlHeaderProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-alloro-navy p-5 text-white shadow-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-alloro-orange/15 text-alloro-orange">
            <Radar className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">
                Mission Control
              </h1>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white/70">
                {organizationCount} Alloro Clients
              </span>
            </div>
            <p className="mt-1.5 max-w-2xl text-xs font-medium leading-5 text-white/65">
              Revenue, payment risk, and organization movement in one admin view.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <motion.button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-bold text-white transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </motion.button>
          <motion.button
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-alloro-orange px-3.5 py-2 text-xs font-bold text-white transition-all hover:brightness-110"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus className="h-4 w-4" />
            Create Org
          </motion.button>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative block flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/35 focus:border-alloro-teal/50 focus:outline-none focus:ring-2 focus:ring-alloro-teal/20"
            placeholder="Search organizations"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              onClick={() => onFilterChange(option.value)}
              className={`rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-all ${
                filter === option.value
                  ? "bg-alloro-teal text-alloro-navy"
                  : "border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
