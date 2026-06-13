import type {
  AiSeoCategoryId,
  AiSeoCategorySummary,
  AiSeoCheckResultInput,
  AiSeoConfidence,
  AiSeoHardCap,
  AiSeoScoreSummary,
  UrlAuditSnapshot,
} from "./types";

export const CATEGORY_WEIGHTS: Record<
  AiSeoCategoryId,
  { label: string; weight: number }
> = {
  access_indexability: { label: "Access And Indexability", weight: 25 },
  page_source_readiness: { label: "Page Source Readiness", weight: 20 },
  entity_external_consistency: { label: "Entity And External Consistency", weight: 25 },
  connected_performance: { label: "Connected Performance Signals", weight: 20 },
  authority_market: { label: "Authority And Market Signals", weight: 10 },
};

export function summarizeResults(
  results: AiSeoCheckResultInput[],
  hardCaps: AiSeoHardCap[],
): AiSeoScoreSummary {
  const categories: AiSeoCategorySummary[] = Object.entries(CATEGORY_WEIGHTS).map(
    ([id, config]) => {
      const categoryResults = results.filter((result) => result.category === id);
      const availablePoints = categoryResults
        .filter((result) => !["unavailable", "not_applicable"].includes(result.status))
        .reduce((sum, result) => sum + result.weight, 0);
      const awardedPoints = categoryResults.reduce(
        (sum, result) => sum + result.points_awarded,
        0,
      );
      return {
        id: id as AiSeoCategoryId,
        label: config.label,
        weight: config.weight,
        score: availablePoints > 0 ? round((awardedPoints / availablePoints) * 100) : null,
        availablePoints,
        awardedPoints,
      };
    },
  );

  const availablePoints = categories.reduce(
    (sum, category) => sum + category.availablePoints,
    0,
  );
  const awardedPoints = categories.reduce(
    (sum, category) => sum + category.awardedPoints,
    0,
  );
  const rawScore = availablePoints > 0
    ? round((awardedPoints / availablePoints) * 100)
    : null;
  const cappedScore = rawScore === null
    ? null
    : hardCaps.reduce((score, cap) => Math.min(score, cap.maxScore), rawScore);
  const dataCoverage = round((availablePoints / 100) * 100);

  return {
    score: cappedScore,
    rawScore,
    dataCoverage,
    confidence: confidenceForCoverage(dataCoverage),
    hardCaps,
    categories,
  };
}

export function buildHardCaps(snapshot: UrlAuditSnapshot): AiSeoHardCap[] {
  const caps: AiSeoHardCap[] = [];
  if (!snapshot.ok) {
    caps.push({
      code: "URL_NOT_SUCCESSFUL",
      label: "URL does not resolve to a successful final page",
      maxScore: 30,
      evidence: { status: snapshot.finalStatus },
    });
  }
  if (snapshot.isBlockedByRobots) {
    caps.push({
      code: "BLOCKED_BY_ROBOTS",
      label: "Page is blocked by robots.txt",
      maxScore: 35,
      evidence: { robotsTxtStatus: snapshot.robotsTxtStatus },
    });
  }
  if (/noindex/i.test(snapshot.metaRobots || "")) {
    caps.push({
      code: "NOINDEX",
      label: "Page has noindex",
      maxScore: 40,
      evidence: { metaRobots: snapshot.metaRobots },
    });
  }
  if (snapshot.text.length < 150) {
    caps.push({
      code: "MAIN_CONTENT_NOT_RENDERABLE",
      label: "Main content is not renderable as meaningful text",
      maxScore: 55,
      evidence: { characterCount: snapshot.text.length },
    });
  }
  if (snapshot.canonicalUrl && normalizeUrl(snapshot.canonicalUrl) !== normalizeUrl(snapshot.finalUrl)) {
    caps.push({
      code: "CANONICAL_MISMATCH",
      label: "Canonical points away from the audited URL",
      maxScore: 65,
      evidence: { canonicalUrl: snapshot.canonicalUrl, finalUrl: snapshot.finalUrl },
    });
  }
  // No external-source hard cap: directory/scraped listings are too noisy to
  // cap a score on. External mismatches are surfaced as advisory "worth checking"
  // signals in the UI, not score-capping verdicts.
  return caps;
}

export function dedupeHardCaps(caps: AiSeoHardCap[]): AiSeoHardCap[] {
  const byCode = new Map<string, AiSeoHardCap>();
  const pagesByCode = new Map<string, Set<string>>();
  for (const cap of caps) {
    const existing = byCode.get(cap.code);
    if (!existing || cap.maxScore < existing.maxScore) {
      byCode.set(cap.code, cap);
    }
    const page = cap.evidence?.page;
    if (typeof page === "string" && page) {
      const pages = pagesByCode.get(cap.code) ?? new Set<string>();
      pages.add(page);
      pagesByCode.set(cap.code, pages);
    }
  }
  return Array.from(byCode.values())
    .map((cap) => {
      const pages = Array.from(pagesByCode.get(cap.code) ?? []);
      return {
        ...cap,
        evidence: {
          ...cap.evidence,
          affectedPages: pages.slice(0, 12),
          affectedPageCount: pages.length,
        },
      };
    })
    .sort((a, b) => a.maxScore - b.maxScore);
}

export function check(input: {
  category: AiSeoCategoryId;
  check_id: string;
  status: AiSeoCheckResultInput["status"];
  weight: number;
  points: number;
  method?: AiSeoCheckResultInput["method"];
  data_scope?: AiSeoCheckResultInput["data_scope"];
  remediation: string;
  evidence: AiSeoCheckResultInput["evidence"];
  details?: Record<string, unknown>;
}): AiSeoCheckResultInput {
  return {
    category: input.category,
    check_id: input.check_id,
    status: input.status,
    weight: input.weight,
    points_awarded: input.points,
    method: input.method || "deterministic",
    data_scope: input.data_scope || "url",
    remediation: input.status === "pass" ? null : input.remediation,
    details: input.details || {},
    evidence: input.evidence,
  };
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    // Treat http/https and www/non-www as the same page so a canonical that only
    // differs by host alias (the common case) is not flagged as pointing away.
    parsed.protocol = "https:";
    parsed.hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/$/, "")
      .toLowerCase();
  }
}

function confidenceForCoverage(dataCoverage: number): AiSeoConfidence {
  if (dataCoverage >= 80) return "high";
  if (dataCoverage >= 55) return "medium";
  return "low";
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
