import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, ArrowUpDown } from "lucide-react";
import { SectionTitle } from "../shared/SectionTitle";
import { InfoTip } from "../shared/InfoTip";
import { CompetitorComparisonSortMenu } from "../rankings/CompetitorComparisonSortMenu";
import { CompetitorComparisonTable } from "../rankings/CompetitorComparisonTable";
import {
  buildCompetitorComparisonRows,
  getComparisonInsight,
  sortComparisonRows,
  type ComparisonSortKey,
} from "../rankings/competitorComparison";
import type { RankingResult } from "../rankingsDashboard.types";
import { useLabels } from "../../../hooks/useLabels";
import { useAuth } from "../../../hooks/useAuth";
import { formatGeneratedCopyForOrg } from "../../../utils/generatedCopy";

export function SearchPositionSection({ result }: { result: RankingResult }) {
  const navigate = useNavigate();
  const labels = useLabels();
  const { userProfile } = useAuth();
  const [sortKey, setSortKey] = useState<ComparisonSortKey>("mapsPosition");
  const rows = useMemo(() => buildCompetitorComparisonRows(result), [result]);
  const sortedRows = useMemo(
    () => sortComparisonRows(rows, sortKey),
    [rows, sortKey],
  );
  const insight = useMemo(
    () =>
      formatGeneratedCopyForOrg(
        getComparisonInsight(rows, sortKey),
        userProfile?.organizationType,
      ),
    [rows, sortKey, userProfile?.organizationType],
  );
  const accent = "#D66853";

  return (
    <section
      data-wizard-target="rankings-competitors"
      className="bg-white border border-line-soft rounded-[14px] shadow-premium overflow-hidden"
    >
      <header className="px-6 lg:px-7 py-4 flex items-center justify-between border-b border-line-soft gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: accent }}
          />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <SectionTitle>
                Your competitors on Local Search
              </SectionTitle>
              <InfoTip
                content={`These are the competitors in your saved comparison set, shown with their latest sampled local search position when available. Your ${labels.orgNoun} is included so the table can be sorted against the same metrics.`}
              />
            </div>
          </div>
        </div>
      </header>
      <div className="px-6 py-5 lg:px-7">
        <div className="mb-4 flex flex-col gap-3 rounded-[12px] border border-line-soft bg-[#F7F5F1] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-alloro-orange/10 text-alloro-orange">
              <ArrowUpDown size={18} />
            </div>
            <p className="text-[13px] font-semibold leading-relaxed text-alloro-navy/70">
              {insight}
            </p>
          </div>
          <CompetitorComparisonSortMenu value={sortKey} onChange={setSortKey} />
        </div>
        <div className="overflow-hidden rounded-[12px] border border-line-soft bg-white">
          <CompetitorComparisonTable
            rows={sortedRows}
            sortKey={sortKey}
            onSort={setSortKey}
          />
        </div>
        {result.locationId && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/dashboard/competitors/${result.locationId}/onboarding?mode=reselect`,
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-alloro-navy px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-alloro-navy/90 focus:outline-none focus:ring-2 focus:ring-alloro-orange/35"
            >
              <Settings size={13} />
              Manage competitors
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
