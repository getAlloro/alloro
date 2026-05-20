import { Clock } from "lucide-react";
import type { PageChangelogEntry } from "../types/docs";

interface PageChangelogProps {
  entries: PageChangelogEntry[];
}

export function PageChangelog({ entries }: PageChangelogProps) {
  return (
    <div className="border-t border-alloro-border pt-8">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={14} className="text-alloro-slate" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-alloro-slate">
          Page History
        </h3>
      </div>
      <div className="space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.version}
            className="flex items-start gap-4 p-3 rounded-lg bg-white border border-alloro-border"
          >
            <span className="shrink-0 px-2 py-0.5 bg-alloro-orange-light text-alloro-orange text-[11px] font-bold rounded">
              v{entry.version}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-alloro-navy">{entry.summary}</p>
              <p className="text-[11px] text-alloro-slate mt-0.5">{entry.date}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
