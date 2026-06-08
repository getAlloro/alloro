import { ChevronRight } from "lucide-react";

export type TelemetryBreadcrumbItem = {
  label: string;
  onClick?: () => void;
  ariaLabel?: string;
};

export type TelemetryBreadcrumbProps = {
  items: TelemetryBreadcrumbItem[];
};

export function TelemetryBreadcrumb({ items }: TelemetryBreadcrumbProps) {
  return (
    <nav aria-label="Telemetry breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-xs font-bold">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;

          return (
            <li
              key={`${item.label}-${index}`}
              className="flex min-w-0 items-center gap-1"
            >
              {index > 0 ? (
                <ChevronRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-gray-300"
                />
              ) : null}
              {item.onClick ? (
                <button
                  type="button"
                  onClick={item.onClick}
                  aria-label={item.ariaLabel}
                  className="max-w-[12rem] truncate rounded-lg px-1.5 py-1 text-gray-500 transition-all hover:bg-sky-50 hover:text-alloro-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-teal/40"
                >
                  {item.label}
                </button>
              ) : (
                <span
                  aria-current={isCurrent ? "page" : undefined}
                  className="max-w-[16rem] truncate px-1.5 py-1 text-alloro-navy"
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
