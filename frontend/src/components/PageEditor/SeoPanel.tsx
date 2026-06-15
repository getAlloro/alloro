import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Loader2,
  Check,
  AlertTriangle,
  Info,
  ExternalLink,
  Search,
  RefreshCw,
} from "lucide-react";
import { type SeoData, updatePageSeo, updatePostSeo, generateSeo, generateAllSeo, analyzeSeo, fetchAllSeoMeta } from "../../api/websites";
import { getBusinessData, type OrgBusinessData } from "../../api/locations";
import { adminGetBusinessData } from "../../api/admin-organizations";
import { logger } from "../../lib/logger";
import { type SeoPanelProps, type LocationOption } from "./seoPanel.types";
import { calculateScores, getScoreColor, getScoreBarColor, getScoreLabel, GENERATABLE_SECTIONS } from "./seoPanel.utils";
import CriticalFields from "./SeoPanel/CriticalFields";
import HighImpactFields from "./SeoPanel/HighImpactFields";
import SchemaFields from "./SeoPanel/SchemaFields";
import SocialFields from "./SeoPanel/SocialFields";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SeoPanel({
  projectId,
  entityId,
  entityType,
  seoData,
  pagePath,
  postTitle,
  pageContent,
  homepageContent,
  headerHtml,
  footerHtml,
  wrapperHtml,
  onSeoDataChange,
  organizationId,
}: SeoPanelProps) {
  const [seo, setSeo] = useState<SeoData>(seoData || {});
  const [activeSection, setActiveSection] = useState("critical");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [analyzingSection, setAnalyzingSection] = useState<string | null>(null);
  const [completedSections, setCompletedSections] = useState<Set<string>>(new Set());
  const [allTitles, setAllTitles] = useState<string[]>([]);
  const [allDescriptions, setAllDescriptions] = useState<string[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [, setOrgData] = useState<{ name: string; business_data: OrgBusinessData | null } | null>(null);
  const [hasBusinessData, setHasBusinessData] = useState(false);
  const [sectionInsights, setSectionInsights] = useState<Record<string, string>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    loadBusinessData();
    loadAllMeta();
  }, [projectId]);

  // Restore persisted insights from seoData
  useEffect(() => {
    if (seoData?.insights) {
      setSectionInsights(seoData.insights);
    }
  }, []);

  const loadBusinessData = async () => {
    try {
      const data = organizationId
        ? await adminGetBusinessData(organizationId)
        : await getBusinessData();
      setOrgData({ name: data.organization.name, business_data: data.organization.business_data });
      const locs: LocationOption[] = data.locations.map((l) => ({
        id: l.id,
        name: l.name,
        is_primary: l.is_primary,
        business_data: l.business_data,
      }));
      setLocations(locs);
      const anyData = locs.some((l) => l.business_data !== null) || data.organization.business_data !== null;
      setHasBusinessData(anyData);
    } catch {
      logger.error("Failed to load business data");
    }
  };

  const loadAllMeta = async () => {
    try {
      const result = await fetchAllSeoMeta(projectId);
      // For pages, exclude by path (all versions of same path are the same page).
      // For posts, exclude by id.
      const titles = [
        ...result.data.pages.filter((p) => entityType === "page" ? p.path !== pagePath : p.id !== entityId).map((p) => p.meta_title).filter(Boolean),
        ...result.data.posts.filter((p) => entityType === "post" ? p.id !== entityId : true).map((p) => p.meta_title).filter(Boolean),
      ] as string[];
      const descs = [
        ...result.data.pages.filter((p) => entityType === "page" ? p.path !== pagePath : p.id !== entityId).map((p) => p.meta_description).filter(Boolean),
        ...result.data.posts.filter((p) => entityType === "post" ? p.id !== entityId : true).map((p) => p.meta_description).filter(Boolean),
      ] as string[];
      setAllTitles(titles);
      setAllDescriptions(descs);
    } catch {
      logger.error("Failed to load all SEO meta");
    }
  };

  const triggerSave = useCallback(
    (data: SeoData) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          if (entityType === "page") {
            await updatePageSeo(projectId, entityId, data);
          } else {
            await updatePostSeo(projectId, entityId, data);
          }
          onSeoDataChange(data);
        } catch (err) {
          logger.error("Failed to save SEO data:", err);
        }
      }, 800);
    },
    [projectId, entityId, entityType, onSeoDataChange]
  );

  const updateField = (field: keyof SeoData, value: unknown) => {
    const updated = { ...seo, [field]: value };
    setSeo(updated);
    triggerSave(updated);
  };

  const buildGenerateBody = (section: string) => ({
    section,
    location_context: seo.location_context || "organization",
    page_content: pageContent,
    homepage_content: homepageContent || "",
    header_html: headerHtml || "",
    footer_html: footerHtml || "",
    wrapper_html: wrapperHtml || "",
    existing_seo_data: seo,
    all_page_titles: allTitles,
    all_page_descriptions: allDescriptions,
    page_path: pagePath,
    post_title: postTitle,
  });

  const buildAnalyzeBody = (section: string) => ({
    section,
    location_context: seo.location_context || "organization",
    page_content: pageContent,
    existing_seo_data: seo,
    page_path: pagePath,
    post_title: postTitle,
  });

  // ── Generate All (single batch request) ──
  const handleGenerateAll = async () => {
    if (!hasBusinessData) return;
    setIsGenerating(true);
    setCompletedSections(new Set());
    setGeneratingSection("critical");
    setActiveSection("critical");

    try {
      const result = await generateAllSeo(projectId, entityId, entityType, {
        location_context: seo.location_context || "organization",
        page_content: pageContent,
        homepage_content: homepageContent || "",
        header_html: headerHtml || "",
        footer_html: footerHtml || "",
        wrapper_html: wrapperHtml || "",
        existing_seo_data: seo,
        all_page_titles: allTitles,
        all_page_descriptions: allDescriptions,
        page_path: pagePath,
        post_title: postTitle,
      });

      let accumulated = { ...seo };
      const newInsights = { ...sectionInsights };

      for (const r of result.results) {
        accumulated = { ...accumulated, ...r.generated };
        if (r.insight) newInsights[r.section] = r.insight;
        setCompletedSections((prev) => new Set([...prev, r.section]));
        setGeneratingSection(r.section);
        setActiveSection(r.section);
      }

      accumulated = { ...accumulated, insights: newInsights };
      setSeo(accumulated);
      setSectionInsights(newInsights);
      triggerSave(accumulated);
    } catch (err) {
      logger.error("Failed to generate all SEO:", err);
    } finally {
      setGeneratingSection(null);
      setIsGenerating(false);
    }
  };

  // ── Generate Single Section ──
  const handleGenerateSection = async (sectionKey: string) => {
    if (!hasBusinessData || isGenerating || isAnalyzing) return;
    setGeneratingSection(sectionKey);
    try {
      const result = await generateSeo(
        projectId, entityId, entityType,
        buildGenerateBody(sectionKey)
      );
      const updated = { ...seo, ...result.generated };
      const newInsights = { ...sectionInsights };
      if (result.insight) {
        newInsights[sectionKey] = result.insight;
      }
      const final = { ...updated, insights: newInsights };
      setSeo(final);
      setSectionInsights(newInsights);
      triggerSave(final);
      setCompletedSections((prev) => new Set([...prev, sectionKey]));
    } catch (err) {
      logger.error(`Failed to generate ${sectionKey}:`, err);
    } finally {
      setGeneratingSection(null);
    }
  };

  // ── Analyze All ──
  const handleAnalyzeAll = async () => {
    if (!hasBusinessData) return;
    setIsAnalyzing(true);
    const newInsights = { ...sectionInsights };

    for (const section of GENERATABLE_SECTIONS) {
      setAnalyzingSection(section);
      setActiveSection(section);
      try {
        const result = await analyzeSeo(
          projectId, entityId, entityType,
          buildAnalyzeBody(section)
        );
        if (result.insight) {
          newInsights[section] = result.insight;
          setSectionInsights({ ...newInsights });
        }
      } catch (err) {
        logger.error(`Failed to analyze ${section}:`, err);
      }
    }

    const updated = { ...seo, insights: newInsights };
    setSeo(updated);
    triggerSave(updated);
    setAnalyzingSection(null);
    setIsAnalyzing(false);
  };

  // ── Analyze Single Section ──
  const handleAnalyzeSection = async (sectionKey: string) => {
    if (!hasBusinessData || isGenerating || isAnalyzing) return;
    setAnalyzingSection(sectionKey);
    try {
      const result = await analyzeSeo(
        projectId, entityId, entityType,
        buildAnalyzeBody(sectionKey)
      );
      const newInsights = { ...sectionInsights };
      if (result.insight) {
        newInsights[sectionKey] = result.insight;
      }
      setSectionInsights(newInsights);
      const updated = { ...seo, insights: newInsights };
      setSeo(updated);
      triggerSave(updated);
    } catch (err) {
      logger.error(`Failed to analyze ${sectionKey}:`, err);
    } finally {
      setAnalyzingSection(null);
    }
  };

  const scores = calculateScores(seo, wrapperHtml || "", allTitles, allDescriptions);
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const totalMax = scores.reduce((sum, s) => sum + s.max, 0);
  const pct = Math.round((totalScore / totalMax) * 100);
  const currentSection = scores.find((s) => s.key === activeSection) || scores[0];
  const isWrapperLevel = activeSection === "low" || activeSection === "negligible";
  const isGeneratable = (GENERATABLE_SECTIONS as string[]).includes(activeSection);
  const currentInsight = sectionInsights[activeSection];
  const isBusy = isGenerating || isAnalyzing;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* ── Header bar ── */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-5 py-3">
        <div className="flex items-center gap-4">
          {/* Score */}
          <div className="flex items-center gap-3 mr-auto">
            <div className="flex items-center gap-2">
              <span className={`text-xl font-black tabular-nums ${getScoreColor(pct)}`}>{totalScore}</span>
              <span className="text-sm text-gray-300 font-semibold">/ {totalMax}</span>
            </div>
            <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${getScoreBarColor(pct)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] font-medium text-gray-400">{getScoreLabel(pct)}</span>
          </div>

          {/* Location selector */}
          <select
            value={seo.location_context || "organization"}
            onChange={(e) => updateField("location_context", e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 bg-white min-w-[140px]"
          >
            <option value="organization">Organization-wide</option>
            {locations.map((loc) => (
              <option key={loc.id} value={String(loc.id)}>
                {loc.name} {loc.is_primary ? "(Primary)" : ""}
              </option>
            ))}
          </select>

          {/* Analyze All button */}
          <button
            onClick={handleAnalyzeAll}
            disabled={isBusy || !hasBusinessData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={!hasBusinessData ? "Business data required" : "Analyze existing SEO data"}
          >
            {isAnalyzing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            {isAnalyzing ? "Analyzing..." : "Analyze All"}
          </button>

          {/* Generate All button */}
          <button
            onClick={handleGenerateAll}
            disabled={isBusy || !hasBusinessData}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-alloro-orange hover:bg-alloro-orange/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            title={!hasBusinessData ? "Refresh business data in Settings first" : undefined}
          >
            {isGenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {isGenerating ? "Generating..." : "Generate All"}
          </button>
        </div>

        {/* Business data warning */}
        {!hasBusinessData && (
          <div className="flex items-center gap-2 mt-2.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <p className="text-[11px] text-amber-700 flex-1">
              Business data required for AI generation.
            </p>
            {organizationId ? (
              <Link
                to={`/admin/organizations/${organizationId}?section=settings`}
                className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-900 transition-colors whitespace-nowrap"
              >
                Manage Business Data
                <ExternalLink className="w-3 h-3" />
              </Link>
            ) : (
              <span className="text-[11px] font-medium text-amber-600 whitespace-nowrap">
                Link an organization first
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Body: sidebar + main ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-52 shrink-0 bg-white border-r border-gray-200 py-2 overflow-y-auto">
          {scores.map((s) => {
            const isActive = s.key === activeSection;
            const sectionPct = s.max > 0 ? Math.round((s.score / s.max) * 100) : 0;
            const isCurrentlyGenerating = generatingSection === s.key;
            const isCurrentlyAnalyzing = analyzingSection === s.key;
            const isDone = completedSections.has(s.key);
            const hasInsight = !!sectionInsights[s.key];

            return (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`w-full text-left px-4 py-2.5 transition-colors border-l-2 ${
                  isActive
                    ? "border-l-alloro-orange bg-orange-50/60"
                    : "border-l-transparent hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${s.dotColor}`} />
                  <span className={`text-xs font-semibold truncate ${isActive ? "text-gray-900" : "text-gray-600"}`}>
                    {s.label}
                  </span>
                  {isCurrentlyGenerating && <Loader2 className="w-3 h-3 animate-spin text-alloro-orange ml-auto shrink-0" />}
                  {isCurrentlyAnalyzing && !isCurrentlyGenerating && <Loader2 className="w-3 h-3 animate-spin text-blue-500 ml-auto shrink-0" />}
                  {isDone && !isCurrentlyGenerating && !isCurrentlyAnalyzing && <Check className="w-3 h-3 text-green-500 ml-auto shrink-0" />}
                  {hasInsight && !isDone && !isCurrentlyGenerating && !isCurrentlyAnalyzing && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 ml-auto shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 pl-4">
                  <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${s.dotColor}`}
                      style={{ width: `${sectionPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums font-medium text-gray-400 w-8 text-right">
                    {s.score}/{s.max}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-xl">
            {/* Section header with action buttons */}
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-2.5 h-2.5 rounded-full ${currentSection.dotColor}`} />
              <h3 className="text-sm font-bold text-gray-900">{currentSection.label}</h3>
              <span className="text-xs font-medium text-gray-400 tabular-nums">
                {currentSection.score} / {currentSection.max} pts
              </span>

              {/* Per-section action buttons */}
              {isGeneratable && hasBusinessData && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    onClick={() => handleAnalyzeSection(activeSection)}
                    disabled={isBusy}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Analyze this section"
                  >
                    {analyzingSection === activeSection ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Search className="w-3 h-3" />
                    )}
                    Analyze
                  </button>
                  <button
                    onClick={() => handleGenerateSection(activeSection)}
                    disabled={isBusy}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-white bg-alloro-orange hover:bg-alloro-orange/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Regenerate this section"
                  >
                    {generatingSection === activeSection ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    Generate
                  </button>
                </div>
              )}
            </div>

            {/* Wrapper-level notice */}
            {isWrapperLevel && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-100 border border-gray-200 mb-4">
                <Info className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-gray-500">
                  Auto-detected from your wrapper HTML. Update via the <strong>Layouts</strong> tab.
                </p>
              </div>
            )}

            {/* Criteria checklist */}
            <div className="space-y-1 mb-5">
              {currentSection.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 py-1.5 px-3 rounded-lg hover:bg-white transition-colors"
                >
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                    item.passed ? "bg-green-100" : "bg-gray-100"
                  }`}>
                    {item.passed ? (
                      <Check className="w-2.5 h-2.5 text-green-600" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                    )}
                  </div>
                  <span className={`text-xs flex-1 ${item.passed ? "text-gray-600" : "text-gray-500"}`}>
                    {item.label}
                  </span>
                  <span className="text-[10px] tabular-nums text-gray-400 font-medium">{item.points}pts</span>
                </div>
              ))}
            </div>

            {/* Editable fields per section */}
            {activeSection === "critical" && (
              <CriticalFields seo={seo} onChange={updateField} />
            )}
            {activeSection === "high_impact" && (
              <HighImpactFields seo={seo} onChange={updateField} />
            )}
            {activeSection === "significant" && (
              <SchemaFields seo={seo} onChange={updateField} />
            )}
            {activeSection === "moderate" && (
              <SocialFields seo={seo} onChange={updateField} />
            )}

            {/* Insight card */}
            {currentInsight && (
              <div className="mt-5 p-3.5 rounded-lg bg-blue-50 border border-blue-200">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-1">AI Insight</p>
                    <p className="text-xs text-blue-800 leading-relaxed">{currentInsight}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
