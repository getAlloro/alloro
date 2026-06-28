import type {
  PatientJourneyConversion,
  PatientJourneyPeriod,
  PatientJourneyStage,
} from "../../../types/patientJourney";
import {
  formatPrecisePct,
  formatStageValue,
  stageGateLabel,
} from "./patientJourney.utils";

export type GateDetailMetric = {
  label: string;
  value: string;
  tooltip?: string;
};

export type GateDetailInsight = {
  label: string;
  value?: string;
};

export type GateDetailContent = {
  title: string;
  description: string;
  summary: GateDetailMetric[];
  insightsTitle: string;
  insights: GateDetailInsight[];
  footer: string;
};

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSeconds(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return "—";
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes <= 0) return `${remainingSeconds}s`;
  return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
}

function topTrackedKeywords(stage: PatientJourneyStage): GateDetailInsight[] {
  return (stage.metadata?.topKeywords ?? [])
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10)
    .map((keyword) => ({
      label: keyword.keyword,
      value: `${keyword.volume.toLocaleString()} est./mo`,
    }));
}

function topGscQueries(stage: PatientJourneyStage): GateDetailInsight[] {
  return (stage.metadata?.gsc?.topQueries ?? []).slice(0, 3).map((query) => ({
    label: titleCase(query.key),
    value: `${query.impressions.toLocaleString()} appearances`,
  }));
}

function metric(
  label: string,
  value: string | number | null | undefined,
  tooltip?: string,
): GateDetailMetric {
  const metricValue =
    value === null || value === undefined
      ? "—"
      : typeof value === "number"
        ? value.toLocaleString()
        : value;
  return {
    label,
    value: metricValue,
    ...(tooltip ? { tooltip } : {}),
  };
}

export function buildGateDetailContent(
  stage: PatientJourneyStage,
  period: PatientJourneyPeriod,
  inbound: PatientJourneyConversion | null,
): GateDetailContent {
  const title = stageGateLabel(stage);

  switch (stage.key) {
    case "market_demand": {
      const insights = topTrackedKeywords(stage);
      return {
        title,
        description:
          "Estimated monthly searches for the services you offer in your local market.",
        summary: [
          metric(
            "Estimated monthly searches",
            formatStageValue(stage.value),
            "A rounded monthly search-volume estimate for tracked service keywords. It is not an exact people count.",
          ),
          metric(
            "Tracked keywords",
            stage.metadata?.keywordCount,
            "Approved keywords Alloro uses to estimate local search demand.",
          ),
        ],
        insightsTitle: "Top tracked keyword estimates",
        insights,
        footer:
          "Keyword numbers are rounded monthly search-volume estimates, not exact people counts.",
      };
    }
    case "impressions": {
      return {
        title,
        description:
          "How often your website appeared in Google Search during the selected period.",
        summary: [],
        insightsTitle: "Top Google searches",
        insights: topGscQueries(stage),
        footer: "From Google Search Console for the selected period.",
      };
    }
    case "visits": {
      const rybbit = stage.metadata?.rybbit;
      return {
        title,
        description: "Visits to your website during the selected period.",
        summary: [
          metric(
            "Website visitors",
            formatStageValue(stage.value),
            "Recorded by site analytics after the page loads. Google clicks may not match if tracking is blocked or the visit does not fully load.",
          ),
          metric(
            "Website sessions",
            rybbit?.sessions,
            "Visits to the site. One visitor can start more than one session.",
          ),
          metric(
            "Average visit length",
            formatSeconds(rybbit?.sessionDuration),
            "Average time spent during a recorded website session.",
          ),
          metric(
            "Page views",
            rybbit?.pageviews,
            "Total pages loaded during recorded visits. One session can include several page views.",
          ),
        ],
        insightsTitle: "",
        insights: [],
        footer: "From Rybbit Analytics for the selected period.",
      };
    }
    case "leads":
      return {
        title,
        description:
          "Verified website form submissions during the selected period.",
        summary: [
          metric(
            "Website leads",
            formatStageValue(stage.value),
            "Verified form submissions from the website.",
          ),
          metric(
            "Visitor-to-lead rate",
            formatPrecisePct(inbound?.pct ?? null),
            "Website leads divided by recorded website visitors for the selected period.",
          ),
        ],
        insightsTitle: "",
        insights: [],
        footer: "Measured from verified website form submissions.",
      };
    default:
      return {
        title,
        description: `${stage.metaLabel} for ${period.label}.`,
        summary: [metric(stage.metaLabel, formatStageValue(stage.value))],
        insightsTitle: "",
        insights: [],
        footer: stage.source,
      };
  }
}
