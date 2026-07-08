import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import AnimatedSelect from "../../../components/ui/AnimatedSelect";
import { ActionButton } from "../../../components/ui/DesignSystem";
import { fadeInUp } from "../../../lib/animations";
import { CATEGORY_OPTIONS, STATUS_OPTIONS } from "./constants";

/**
 * Email Logs — animated filter bar (plans/07082026-email-logs-ui-polish).
 * Category/Status use the shared AnimatedSelect; date + search inputs carry the
 * brand focus ring. Fully controlled by the page container.
 */

export type EmailLogsFiltersProps = {
  category: string;
  status: string;
  from: string;
  to: string;
  search: string;
  onCategoryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onReset: () => void;
};

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange";

const toOptions = (values: readonly string[]) => [
  { value: "", label: "All" },
  ...values.map((v) => ({ value: v, label: v })),
];

function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

export default function EmailLogsFilters(props: EmailLogsFiltersProps) {
  const hasActive =
    !!props.category || !!props.status || !!props.from || !!props.to || !!props.search;

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className="rounded-2xl border border-black/5 bg-white p-4 shadow-premium sm:p-5"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-44">
          <AnimatedSelect
            label="Category"
            value={props.category}
            onChange={props.onCategoryChange}
            options={toOptions(CATEGORY_OPTIONS)}
            placeholder="All"
          />
        </div>
        <div className="w-full sm:w-44">
          <AnimatedSelect
            label="Status"
            value={props.status}
            onChange={props.onStatusChange}
            options={toOptions(STATUS_OPTIONS)}
            placeholder="All"
          />
        </div>
        <FilterField label="From" className="w-full sm:w-40">
          <input
            type="date"
            className={INPUT_CLASS}
            value={props.from}
            onChange={(e) => props.onFromChange(e.target.value)}
          />
        </FilterField>
        <FilterField label="To" className="w-full sm:w-40">
          <input
            type="date"
            className={INPUT_CLASS}
            value={props.to}
            onChange={(e) => props.onToChange(e.target.value)}
          />
        </FilterField>
        <FilterField
          label="Search (subject or recipient)"
          className="min-w-[220px] flex-1"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="e.g. invoice, client@practice.com"
              className={`${INPUT_CLASS} pl-9`}
              value={props.search}
              onChange={(e) => props.onSearchChange(e.target.value)}
            />
          </div>
        </FilterField>
        {hasActive && (
          <ActionButton
            label="Reset"
            icon={<X className="h-4 w-4" />}
            onClick={props.onReset}
            variant="ghost"
            size="sm"
          />
        )}
      </div>
    </motion.div>
  );
}
