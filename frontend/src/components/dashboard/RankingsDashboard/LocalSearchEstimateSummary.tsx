import { SectionTitle } from "../shared/SectionTitle";
import { InfoTip } from "../shared/InfoTip";
import type { RankingResult } from "../rankingsDashboard.types";
import { StarIcon } from "./StarIcon";
import { Metric } from "./Metric";
import { useLabels } from "../../../hooks/useLabels";

export function LocalSearchEstimateSummary({
  result,
  marketAvgRating,
}: {
  result: RankingResult;
  marketAvgRating: number;
}) {
  const labels = useLabels();
  const status = result.searchStatus ?? "ok";
  const rank = result.searchPosition;
  const accent = "#D66853";
  const rankColor =
    rank !== null && rank <= 3
      ? accent
      : rank !== null && rank <= 10
        ? "#11151C"
        : "rgba(17,21,28,0.45)";

  const clientGbp = result.rawData?.client_gbp ?? null;
  const avgRating = clientGbp?.averageRating ?? null;
  const reviewCount = clientGbp?.totalReviewCount ?? null;
  const reviewsLast30d = clientGbp?.reviewsLast30d ?? 0;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: accent }}
          />
          <SectionTitle>Local Search Estimate</SectionTitle>
          <InfoTip content="This is a sampled Google Maps result gathered through SerpAPI. It can vary by device, prior searches, and the searcher's exact physical location, so use it as a directional read." />
        </div>
      </div>

      {status === "ok" && rank !== null && (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="leading-[0.85]">
              <span
                className="font-display text-[74px] font-medium tracking-tight tabular-nums lg:text-[92px]"
                style={{ color: rankColor, lineHeight: 0.85 }}
              >
                #{rank}
              </span>
            </div>

            <div className="min-w-0 pb-2">
              <p className="text-[13px] font-medium leading-relaxed text-alloro-navy/70">
                for{" "}
                <span className="font-bold text-alloro-navy">
                  {result.searchQuery ?? "your tracked search"}
                </span>
              </p>
              <p className="mt-1 text-[12px] font-semibold leading-relaxed text-alloro-navy/45">
                This is the position {labels.customers} are most likely to notice first.
              </p>
            </div>
          </div>

          <div className="grid max-w-[300px] grid-cols-2 gap-4 border-t border-[#EDE5C0] pt-4 sm:min-w-[270px] lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <Metric
              label="Star rating"
              value={avgRating !== null ? avgRating.toFixed(1) : "-"}
              adornment={<StarIcon size={14} />}
              sub={`Market avg ${marketAvgRating.toFixed(1)}`}
            />
            <Metric
              label="Reviews"
              value={reviewCount !== null ? reviewCount.toLocaleString() : "-"}
              sub={`+${reviewsLast30d} in 30d`}
            />
          </div>
        </div>
      )}

      {status === "not_in_top_20" && (
        <div className="flex flex-col gap-2 py-2">
          <span className="font-display text-3xl font-medium tracking-tight text-alloro-navy/50 lg:text-4xl">
            Not ranked in top 20
          </span>
          <p className="max-w-[48ch] text-sm font-medium leading-relaxed text-alloro-navy/65">
            for{" "}
            <span className="font-bold text-alloro-navy">
              {result.searchQuery ?? "your tracked search"}
            </span>
            . The score details below show which signals need work.
          </p>
        </div>
      )}

      {status === "bias_unavailable" && (
        <div className="flex flex-col gap-2 py-2">
          <span className="font-display text-3xl font-medium tracking-tight text-alloro-navy/50 lg:text-4xl">
            Couldn't locate your {labels.orgNoun} on Google
          </span>
          <p className="max-w-[48ch] text-sm font-medium leading-relaxed text-alloro-navy/65">
            Check that your Google profile is connected and has a valid address.{" "}
            <a
              href="/settings"
              className="font-bold underline underline-offset-4"
              style={{ color: accent }}
            >
              Open settings →
            </a>
          </p>
        </div>
      )}

      {status === "api_error" && (
        <div className="flex flex-col gap-2 py-2">
          <span className="font-display text-3xl font-medium tracking-tight text-alloro-navy/50 lg:text-4xl">
            Google search temporarily unavailable
          </span>
          <p className="max-w-[48ch] text-sm font-medium leading-relaxed text-alloro-navy/65">
            We'll try again on your next refresh.
          </p>
        </div>
      )}
    </div>
  );
}
