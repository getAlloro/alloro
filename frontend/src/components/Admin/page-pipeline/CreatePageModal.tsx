import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Upload,
  Archive,
  FileText,
} from "lucide-react";
import { fetchTemplatePages } from "../../../api/templates";
import {
  startPipeline,
  createBlankPage,
  uploadArtifactPage,
  fetchSlotPrefill,
  generateSlotValues,
} from "../../../api/websites";
import type { TemplatePage } from "../../../api/templates";
import type { DynamicSlotDef } from "../../../api/websites";
import { searchPlaces, getPlaceDetails } from "../../../api/places";
import type { PlaceSuggestion } from "../../../api/places";
import type { GradientValue } from "./GradientPicker";
import { getErrorMessage } from "../../../lib/errorMessage";
import { formatFileSize } from "./createPageModal.utils";
import type { CreatePageModalProps, CreateMode } from "./createPageModal.types";
import TemplateModeFields from "./CreatePageModal/TemplateModeFields";

export type { CreatePageModalProps } from "./createPageModal.types";

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
      } catch {
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
              <TemplateModeFields
                step={step}
                templatePages={templatePages}
                selectedPageId={selectedPageId}
                loadingPages={loadingPages}
                setSelectedPageId={setSelectedPageId}
                slug={slug}
                slugError={slugError}
                handleSlugChange={handleSlugChange}
                submitting={submitting}
                handleSubmitBlank={handleSubmitBlank}
                pagePrimaryColor={pagePrimaryColor}
                setPagePrimaryColor={setPagePrimaryColor}
                pageAccentColor={pageAccentColor}
                setPageAccentColor={setPageAccentColor}
                gradient={gradient}
                setGradient={setGradient}
                pageContext={pageContext}
                setPageContext={setPageContext}
                dynamicSlots={dynamicSlots}
                loadingSlots={loadingSlots}
                textSlotCount={textSlotCount}
                rewriting={rewriting}
                rewriteError={rewriteError}
                rewriteAllFromIdentity={rewriteAllFromIdentity}
                dynamicSlotValues={dynamicSlotValues}
                updateSlotValue={updateSlotValue}
                projectId={projectId}
                showOverrides={showOverrides}
                setShowOverrides={setShowOverrides}
                overridePlaceId={overridePlaceId}
                searchingGbp={searchingGbp}
                gbpSearchQuery={gbpSearchQuery}
                handleGbpSearch={handleGbpSearch}
                gbpSuggestions={gbpSuggestions}
                handleSelectGbpOverride={handleSelectGbpOverride}
                dataSource={dataSource}
                setDataSource={setDataSource}
                overrideWebsiteUrl={overrideWebsiteUrl}
                setOverrideWebsiteUrl={setOverrideWebsiteUrl}
                scrapedData={scrapedData}
                setScrapedData={setScrapedData}
              />
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
