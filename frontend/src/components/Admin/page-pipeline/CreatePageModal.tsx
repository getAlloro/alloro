import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Loader2,
  Globe,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Search,
  MapPin,
  FilePlus2,
  Upload,
  Archive,
  FileText,
  Palette,
  PenSquare,
  Check,
  Sparkles,
} from "lucide-react";
import { fetchTemplatePages } from "../../api/templates";
import {
  startPipeline,
  createBlankPage,
  uploadArtifactPage,
  fetchSlotPrefill,
  generateSlotValues,
} from "../../api/websites";
import type { TemplatePage } from "../../api/templates";
import type { DynamicSlotDef } from "../../api/websites";
import { searchPlaces, getPlaceDetails } from "../../api/places";
import type { PlaceSuggestion } from "../../api/places";
import ColorPicker from "./ColorPicker";
import GradientPicker from "./GradientPicker";
import type { GradientValue } from "./GradientPicker";
import DynamicSlotInputs from "./DynamicSlotInputs";
import TemplatePageSelect from "./TemplatePageSelect";
import { getErrorMessage } from "../../lib/errorMessage";

export interface CreatePageModalProps {
  projectId: string;
  templateId?: string;
  gbpData: Record<string, string | number | null> | null;
  defaultPlaceId: string;
  defaultWebsiteUrl: string;
  defaultPrimaryColor?: string;
  defaultAccentColor?: string;
  onSuccess: () => void;
  onBlankPageCreated?: (pageId: string) => void;
  onClose: () => void;
}

type CreateMode = "template" | "blank" | "artifact";

export default function CreatePageModal({
  projectId,
  templateId,
  gbpData,
  defaultPlaceId,
  defaultWebsiteUrl,
  defaultPrimaryColor = "#1E40AF",
  defaultAccentColor = "#F59E0B",
  onSuccess,
  onBlankPageCreated,
  onClose,
}: CreatePageModalProps) {
  const [mode, setMode] = useState<CreateMode>(
    templateId ? "template" : "blank"
  );
  // Wizard step (template mode only): 1 = Page, 2 = Style, 3 = Content
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [templatePages, setTemplatePages] = useState<TemplatePage[]>([]);
  const [loadingPages, setLoadingPages] = useState(true);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [slug, setSlug] = useState("/");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [pageContext, setPageContext] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Color picker state (pre-loaded from project defaults, customizable per page)
  const [pagePrimaryColor, setPagePrimaryColor] = useState(defaultPrimaryColor);
  const [pageAccentColor, setPageAccentColor] = useState(defaultAccentColor);

  // Gradient state (Plan B)
  const [gradient, setGradient] = useState<GradientValue>({
    enabled: false,
    from: defaultPrimaryColor,
    to: defaultAccentColor,
    direction: "to-br",
    text_color: "white",
    preset: "smooth",
  });

  // Dynamic slots for the selected template page (Plan B)
  const [dynamicSlots, setDynamicSlots] = useState<DynamicSlotDef[]>([]);
  const [dynamicSlotValues, setDynamicSlotValues] = useState<Record<string, string>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Override state
  const [showOverrides, setShowOverrides] = useState(false);
  const [overridePlaceId, setOverridePlaceId] = useState(defaultPlaceId);
  const [overrideWebsiteUrl, setOverrideWebsiteUrl] =
    useState(defaultWebsiteUrl);

  // Data source toggle
  const [dataSource, setDataSource] = useState<"website" | "pasted">("website");
  const [scrapedData, setScrapedData] = useState("");

  // GBP search for override
  const [gbpSearchQuery, setGbpSearchQuery] = useState("");
  const [gbpSuggestions, setGbpSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingGbp, setSearchingGbp] = useState(false);
  const [overrideGbpData, setOverrideGbpData] = useState<Record<
    string,
    string | number | null
  > | null>(null);

  // Artifact upload state
  const [artifactFile, setArtifactFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset wizard to first step whenever the user switches mode
  useEffect(() => {
    setStep(1);
  }, [mode]);

  useEffect(() => {
    if (!templateId) {
      setLoadingPages(false);
      return;
    }
    const load = async () => {
      try {
        setLoadingPages(true);
        const response = await fetchTemplatePages(templateId);
        setTemplatePages(response.data);
        if (response.data.length > 0) {
          setSelectedPageId(response.data[0].id);
        }
      } catch (err) {
        setError("Failed to load template pages");
      } finally {
        setLoadingPages(false);
      }
    };
    load();
  }, [templateId]);

  // Fetch dynamic slots + pre-fill values when template page selection changes
  useEffect(() => {
    if (!selectedPageId || !projectId) {
      setDynamicSlots([]);
      setDynamicSlotValues({});
      return;
    }
    const load = async () => {
      try {
        setLoadingSlots(true);
        const res = await fetchSlotPrefill(projectId, { templatePageId: selectedPageId });
        setDynamicSlots(res.data.slots || []);
        setDynamicSlotValues(res.data.values || {});
      } catch {
        // If prefill fails (e.g., project has no identity yet), show empty slots
        setDynamicSlots([]);
        setDynamicSlotValues({});
      } finally {
        setLoadingSlots(false);
      }
    };
    load();
  }, [selectedPageId, projectId]);

  const updateSlotValue = (key: string, value: string) => {
    setDynamicSlotValues((prev) => ({ ...prev, [key]: value }));
  };

  const textSlotCount = dynamicSlots.filter((s) => s.type !== "url").length;
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  const rewriteAllFromIdentity = async () => {
    if (!selectedPageId || !projectId || rewriting) return;
    setRewriting(true);
    setRewriteError(null);
    try {
      const res = await generateSlotValues(
        projectId,
        selectedPageId,
        pageContext.trim() || undefined,
      );
      const generated = res.data?.values || {};
      setDynamicSlotValues((prev) => ({ ...prev, ...generated }));
    } catch (err: unknown) {
      setRewriteError(getErrorMessage(err) || "Failed to generate slot values");
    } finally {
      setRewriting(false);
    }
  };

  const validateSlug = (value: string): boolean => {
    if (!value.startsWith("/")) {
      setSlugError("Slug must start with /");
      return false;
    }
    // Allow bare "/" for homepage
    if (value === "/") {
      setSlugError(null);
      return true;
    }
    if (value.length < 2) {
      setSlugError("Slug is too short");
      return false;
    }
    if (/\s/.test(value)) {
      setSlugError("Slug cannot contain spaces");
      return false;
    }
    if (!/^\/[a-zA-Z0-9\-/]+$/.test(value)) {
      setSlugError("Slug can only contain letters, numbers, hyphens, and /");
      return false;
    }
    setSlugError(null);
    return true;
  };

  const handleSlugChange = (value: string) => {
    setSlug(value);
    if (value.length > 1) validateSlug(value);
    else setSlugError(null);
  };

  const handleGbpSearch = async (query: string) => {
    setGbpSearchQuery(query);
    if (query.trim().length < 2) {
      setGbpSuggestions([]);
      return;
    }
    try {
      setSearchingGbp(true);
      const response = await searchPlaces(query);
      setGbpSuggestions(response.suggestions || []);
    } catch {
      setGbpSuggestions([]);
    } finally {
      setSearchingGbp(false);
    }
  };

  const handleSelectGbpOverride = async (suggestion: PlaceSuggestion) => {
    try {
      const detailsResponse = await getPlaceDetails(suggestion.placeId);
      const place = detailsResponse.place;
      setOverridePlaceId(place.placeId);
      setOverrideWebsiteUrl(place.websiteUri || "");
      setOverrideGbpData({
        name: place.name,
        formattedAddress: place.formattedAddress,
        phone: place.phone || null,
        rating: place.rating || null,
        reviewCount: place.reviewCount || null,
        category: place.category || null,
      });
      setGbpSearchQuery(place.name);
      setGbpSuggestions([]);
    } catch {
      setError("Failed to load business details");
    }
  };

  const handleSubmitTemplate = async () => {
    if (!selectedPageId || !templateId || submitting) return;
    if (!validateSlug(slug)) return;

    try {
      setSubmitting(true);
      setError(null);

      const effectiveGbpData = overrideGbpData || gbpData;
      await startPipeline({
        projectId,
        templateId,
        templatePageId: selectedPageId,
        path: slug,
        placeId: overridePlaceId || undefined,
        websiteUrl:
          dataSource === "website" ? overrideWebsiteUrl || null : null,
        pageContext: pageContext.trim() || undefined,
        businessName: effectiveGbpData?.name
          ? String(effectiveGbpData.name)
          : undefined,
        formattedAddress: effectiveGbpData?.formattedAddress
          ? String(effectiveGbpData.formattedAddress)
          : undefined,
        city: effectiveGbpData?.city
          ? String(effectiveGbpData.city)
          : undefined,
        state: effectiveGbpData?.state
          ? String(effectiveGbpData.state)
          : undefined,
        phone: effectiveGbpData?.phone
          ? String(effectiveGbpData.phone)
          : undefined,
        category: effectiveGbpData?.category
          ? String(effectiveGbpData.category)
          : undefined,
        rating: effectiveGbpData?.rating
          ? Number(effectiveGbpData.rating)
          : undefined,
        reviewCount: effectiveGbpData?.reviewCount
          ? Number(effectiveGbpData.reviewCount)
          : undefined,
        primaryColor: pagePrimaryColor,
        accentColor: pageAccentColor,
        scrapedData:
          dataSource === "pasted" ? scrapedData.trim() || null : null,
        gradient: gradient.enabled ? gradient : undefined,
        dynamicSlotValues: Object.keys(dynamicSlotValues).length > 0 ? dynamicSlotValues : undefined,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? getErrorMessage(err) : "Failed to create page");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitBlank = async () => {
    if (submitting) return;
    if (!validateSlug(slug)) return;

    try {
      setSubmitting(true);
      setError(null);
      const result = await createBlankPage(projectId, {
        path: slug,
        display_name: displayName.trim() || undefined,
      });
      onBlankPageCreated?.(result.data.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? getErrorMessage(err) : "Failed to create page");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitArtifact = async () => {
    if (submitting || !artifactFile) return;
    if (!validateSlug(slug)) return;
    if (slug === "/") {
      setSlugError("Artifact pages cannot use the homepage path");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const result = await uploadArtifactPage(projectId, {
        file: artifactFile,
        path: slug,
        display_name: displayName.trim() || undefined,
      });
      onBlankPageCreated?.(result.data.id);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? getErrorMessage(err) : "Failed to upload artifact page"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit =
    mode === "template"
      ? handleSubmitTemplate
      : mode === "blank"
        ? handleSubmitBlank
        : handleSubmitArtifact;

  const isTemplateDisabled =
    submitting || !selectedPageId || !slug || !!slugError;
  const isBlankDisabled = submitting || !slug || !!slugError;
  const isArtifactDisabled =
    submitting || !artifactFile || !slug || slug === "/" || !!slugError;

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".zip") || file.type === "application/zip")) {
      setArtifactFile(file);
    } else {
      setError("Please upload a .zip file");
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) setArtifactFile(file);
    },
    []
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/40 transition-opacity"
        onClick={() => {
          if (!submitting) onClose();
        }}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-bold text-gray-900">
              Create New Page
            </h2>
            <button
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-5">
            {/* Mode toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setMode("template")}
                disabled={!templateId}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-sm font-medium transition ${
                  mode === "template"
                    ? "bg-alloro-orange text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
                }`}
              >
                <FileText className="w-4 h-4" />
                Template
              </button>
              <button
                type="button"
                onClick={() => setMode("blank")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-sm font-medium transition ${
                  mode === "blank"
                    ? "bg-alloro-orange text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <FilePlus2 className="w-4 h-4" />
                Blank
              </button>
              <button
                type="button"
                onClick={() => setMode("artifact")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-sm font-medium transition ${
                  mode === "artifact"
                    ? "bg-alloro-orange text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Upload className="w-4 h-4" />
                Upload App
              </button>
            </div>

            {mode === "template" ? (
              <>
                {/* Wizard step indicator */}
                <WizardSteps
                  current={step}
                  steps={[
                    { id: 1, label: "Page", icon: <FileText className="w-3.5 h-3.5" /> },
                    { id: 2, label: "Style", icon: <Palette className="w-3.5 h-3.5" /> },
                    { id: 3, label: "Content", icon: <PenSquare className="w-3.5 h-3.5" /> },
                  ]}
                />

                {step === 1 && (
                  <>
                    {/* Template page search-select */}
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-gray-700">
                        Template Page
                      </label>
                      <TemplatePageSelect
                        pages={templatePages}
                        value={selectedPageId}
                        onChange={(id) => setSelectedPageId(id)}
                        loading={loadingPages}
                      />
                      <p className="text-xs text-gray-400">
                        Pick the section layout the AI should fill with your
                        business content.
                      </p>
                    </div>

                    {/* Slug input */}
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-gray-700">
                        Page Slug
                      </label>
                      <input
                        type="text"
                        value={slug}
                        onChange={(e) => handleSlugChange(e.target.value)}
                        placeholder="/services"
                        className={`w-full text-sm px-3 py-2 rounded-lg border focus:ring-2 outline-none transition ${
                          slugError
                            ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                            : "border-gray-200 focus:border-alloro-orange focus:ring-alloro-orange/20"
                        }`}
                      />
                      {slugError && (
                        <p className="text-xs text-red-500">{slugError}</p>
                      )}
                      <p className="text-xs text-gray-400">
                        The URL path for this page (e.g., / for homepage,
                        /services, /about-us).
                      </p>
                    </div>

                    {/* Blank canvas shortcut */}
                    <button
                      type="button"
                      onClick={handleSubmitBlank}
                      disabled={submitting || !slug || !!slugError}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-alloro-orange hover:text-alloro-orange hover:bg-orange-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FilePlus2 className="w-4 h-4" />
                      Or start with a blank canvas
                    </button>
                  </>
                )}

                {step === 2 && (
                  <>
                    {/* Brand colors (per-page override) */}
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-gray-700">
                        Brand Colors
                      </label>
                      <div className="flex items-start gap-4">
                        <ColorPicker
                          label="Primary"
                          value={pagePrimaryColor}
                          onChange={setPagePrimaryColor}
                        />
                        <ColorPicker
                          label="Accent"
                          value={pageAccentColor}
                          onChange={setPageAccentColor}
                        />
                      </div>
                      <p className="text-xs text-gray-400">
                        Pre-loaded from the project. Adjust per-page if needed.
                      </p>
                    </div>

                    {/* Gradient */}
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-gray-700">
                        Gradient
                      </label>
                      <GradientPicker
                        value={gradient}
                        onChange={setGradient}
                        defaultFrom={pagePrimaryColor}
                        defaultTo={pageAccentColor}
                      />
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    {/* Page description (was "Page Context") */}
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-gray-700">
                        Page Description
                        <span className="text-gray-400 font-normal ml-1">
                          optional
                        </span>
                      </label>
                      <textarea
                        value={pageContext}
                        onChange={(e) => setPageContext(e.target.value)}
                        placeholder="What's this page about? e.g. 'Orthodontic services including braces, Invisalign, and retainers for children and adults'"
                        rows={2}
                        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 outline-none resize-none transition"
                      />
                      <p className="text-xs text-gray-400">
                        High-level framing for the whole page. Per-section
                        content is filled in below.
                      </p>
                    </div>

                    {/* Dynamic slots for this template page */}
                    {(dynamicSlots.length > 0 || loadingSlots) && (
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700">
                              Section Content
                              {loadingSlots && (
                                <Loader2 className="inline-block ml-2 h-3 w-3 animate-spin text-gray-400" />
                              )}
                            </label>
                            <p className="text-xs text-gray-500">
                              Pre-filled from your project identity. Edit, let AI
                              generate, or skip sections you don't want.
                            </p>
                          </div>
                          {textSlotCount > 0 && (
                            <button
                              type="button"
                              onClick={rewriteAllFromIdentity}
                              disabled={rewriting}
                              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-alloro-orange/40 bg-alloro-orange/5 px-2 py-1 text-[11px] font-medium text-alloro-orange hover:bg-alloro-orange/10 transition disabled:opacity-60 disabled:cursor-not-allowed"
                              title="Run an LLM pass over every text slot using the project's identity context"
                            >
                              {rewriting ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Rewriting…
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-3 w-3" />
                                  Rewrite all from identity
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        {rewriteError && (
                          <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
                            {rewriteError}
                          </div>
                        )}
                        <DynamicSlotInputs
                          slots={dynamicSlots}
                          values={dynamicSlotValues}
                          onChange={updateSlotValue}
                          projectId={projectId}
                        />
                      </div>
                    )}

                    {/* Overrides section */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowOverrides(!showOverrides)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
                  >
                    <span>Advanced: Override Business Data</span>
                    {showOverrides ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  {showOverrides && (
                    <div className="border-t border-gray-200 px-3 py-3 space-y-3 bg-gray-50/50">
                      <p className="text-xs text-gray-500">
                        Override the business profile and website URL for this
                        page only. These changes are not saved to the project.
                      </p>

                      {/* GBP search */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-gray-500">
                          Business Profile (PlaceId:{" "}
                          {overridePlaceId
                            ? overridePlaceId.slice(0, 12) + "..."
                            : "none"}
                          )
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            {searchingGbp ? (
                              <Loader2 className="h-3.5 w-3.5 text-gray-400 animate-spin" />
                            ) : (
                              <Search className="h-3.5 w-3.5 text-gray-400" />
                            )}
                          </div>
                          <input
                            type="text"
                            value={gbpSearchQuery}
                            onChange={(e) => handleGbpSearch(e.target.value)}
                            placeholder="Search for a different business..."
                            className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 outline-none"
                          />
                        </div>
                        {gbpSuggestions.length > 0 && (
                          <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-h-40 overflow-y-auto">
                            {gbpSuggestions.map((s) => (
                              <button
                                key={s.placeId}
                                onClick={() => handleSelectGbpOverride(s)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100 last:border-0"
                              >
                                <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-800 truncate">
                                    {s.mainText}
                                  </p>
                                  <p className="text-xs text-gray-500 truncate">
                                    {s.secondaryText}
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Content source toggle */}
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-gray-500">
                          Content Source
                        </label>
                        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setDataSource("website")}
                            className={`flex-1 px-3 py-2 text-xs font-medium transition ${
                              dataSource === "website"
                                ? "bg-alloro-orange text-white"
                                : "bg-white text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            Scrape Website
                          </button>
                          <button
                            type="button"
                            onClick={() => setDataSource("pasted")}
                            className={`flex-1 px-3 py-2 text-xs font-medium transition ${
                              dataSource === "pasted"
                                ? "bg-alloro-orange text-white"
                                : "bg-white text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            Paste Data
                          </button>
                        </div>
                        {dataSource === "website" ? (
                          <div className="flex items-center gap-2">
                            <Globe className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <input
                              type="url"
                              value={overrideWebsiteUrl}
                              onChange={(e) =>
                                setOverrideWebsiteUrl(e.target.value)
                              }
                              placeholder="https://example.com"
                              className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 outline-none"
                            />
                          </div>
                        ) : (
                          <textarea
                            value={scrapedData}
                            onChange={(e) => setScrapedData(e.target.value)}
                            placeholder="Paste scraped content, service lists, bios, or any extra info you want the AI to use..."
                            rows={4}
                            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 outline-none resize-none"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
                  </>
                )}
              </>
            ) : mode === "blank" ? (
              <>
                {/* Blank page: slug + display name only */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">
                    Page Slug
                  </label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="/services"
                    className={`w-full text-sm px-3 py-2 rounded-lg border focus:ring-2 outline-none transition ${
                      slugError
                        ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                        : "border-gray-200 focus:border-alloro-orange focus:ring-alloro-orange/20"
                    }`}
                  />
                  {slugError && (
                    <p className="text-xs text-red-500">{slugError}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    The URL path for this page (e.g., / for homepage, /services,
                    /about-us)
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">
                    Display Name
                    <span className="text-gray-400 font-normal ml-1">
                      optional
                    </span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g., Services, About Us, Contact"
                    className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 outline-none transition"
                  />
                  <p className="text-xs text-gray-400">
                    A friendly name shown in the admin. Defaults to the slug if
                    left empty.
                  </p>
                </div>

                <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
                  <p className="text-xs text-gray-500">
                    Creates an empty page with no sections. You can add content
                    manually using the page editor after creation.
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Artifact upload mode */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">
                    Page Slug
                  </label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="/calculator"
                    className={`w-full text-sm px-3 py-2 rounded-lg border focus:ring-2 outline-none transition ${
                      slugError
                        ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                        : "border-gray-200 focus:border-alloro-orange focus:ring-alloro-orange/20"
                    }`}
                  />
                  {slugError && (
                    <p className="text-xs text-red-500">{slugError}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    The endpoint where the app will load (e.g., /calculator,
                    /onboarding)
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">
                    Display Name
                    <span className="text-gray-400 font-normal ml-1">
                      optional
                    </span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g., Savings Calculator, Onboarding Form"
                    className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 outline-none transition"
                  />
                </div>

                {/* Drag and drop zone */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">
                    App Build (zip)
                  </label>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 cursor-pointer transition ${
                      isDragging
                        ? "border-alloro-orange bg-orange-50"
                        : artifactFile
                          ? "border-green-300 bg-green-50"
                          : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".zip"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    {artifactFile ? (
                      <>
                        <Archive className="w-8 h-8 text-green-500 mb-2" />
                        <p className="text-sm font-medium text-gray-800">
                          {artifactFile.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatFileSize(artifactFile.size)}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setArtifactFile(null);
                          }}
                          className="mt-2 text-xs text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-gray-400 mb-2" />
                        <p className="text-sm font-medium text-gray-600">
                          Drop your zip here or click to browse
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          .zip files only, up to 200 MB
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                  <p className="text-xs text-amber-800">
                    <strong>Important:</strong> The app must be built with a base
                    path matching the slug above. For Vite:{" "}
                    <code className="bg-amber-100 px-1 py-0.5 rounded text-[11px]">
                      vite build --base={slug === "/" ? "/your-slug" : slug}/
                    </code>
                  </p>
                  <p className="text-xs text-amber-700 mt-1.5">
                    The site header and footer will be injected around your app.
                    Account for the header height with padding if needed.
                  </p>
                </div>
              </>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between gap-3">
            <div>
              {mode === "template" && step > 1 && !submitting && (
                <button
                  onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition disabled:opacity-50"
              >
                Cancel
              </button>
              {mode === "template" && step < 3 ? (
                <button
                  onClick={() => setStep((s) => (s === 1 ? 2 : 3))}
                  disabled={step === 1 && (!selectedPageId || !slug || !!slugError)}
                  className="inline-flex items-center gap-2 bg-alloro-orange hover:bg-alloro-orange/90 disabled:bg-alloro-orange/50 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={
                    mode === "template"
                      ? isTemplateDisabled
                      : mode === "blank"
                        ? isBlankDisabled
                        : isArtifactDisabled
                  }
                  className="inline-flex items-center gap-2 bg-alloro-orange hover:bg-alloro-orange/90 disabled:bg-alloro-orange/50 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {mode === "template"
                        ? "Generating..."
                        : mode === "blank"
                          ? "Creating..."
                          : "Uploading..."}
                    </>
                  ) : mode === "template" ? (
                    "Generate Page"
                  ) : mode === "blank" ? (
                    "Create Blank Page"
                  ) : (
                    "Upload App"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WizardSteps({
  current,
  steps,
}: {
  current: 1 | 2 | 3;
  steps: { id: 1 | 2 | 3; label: string; icon: React.ReactNode }[];
}) {
  return (
    <div className="flex items-center justify-between px-1">
      {steps.map((s, idx) => {
        const done = current > s.id;
        const active = current === s.id;
        return (
          <div key={s.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition ${
                  done
                    ? "bg-alloro-orange text-white"
                    : active
                      ? "bg-alloro-orange/10 text-alloro-orange ring-2 ring-alloro-orange"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : s.id}
              </div>
              <span
                className={`text-xs font-medium ${
                  active
                    ? "text-gray-900"
                    : done
                      ? "text-gray-600"
                      : "text-gray-400"
                }`}
              >
                {s.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-px mx-3 transition ${
                  done ? "bg-alloro-orange" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
