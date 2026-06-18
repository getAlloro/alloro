import {
  Loader2,
  Globe,
  ChevronDown,
  ChevronUp,
  Search,
  MapPin,
  FilePlus2,
  FileText,
  Palette,
  PenSquare,
  Sparkles,
} from "lucide-react";
import type { TemplatePage } from "../../../../api/templates";
import type { DynamicSlotDef } from "../../../../api/websites";
import type { PlaceSuggestion } from "../../../../api/places";
import type { GradientValue } from "../GradientPicker";
import ColorPicker from "../ColorPicker";
import GradientPicker from "../GradientPicker";
import DynamicSlotInputs from "../DynamicSlotInputs";
import TemplatePageSelect from "../TemplatePageSelect";
import WizardSteps from "./WizardSteps";

interface TemplateModeFieldsProps {
  step: 1 | 2 | 3;
  templatePages: TemplatePage[];
  selectedPageId: string | null;
  loadingPages: boolean;
  setSelectedPageId: (id: string | null) => void;
  slug: string;
  slugError: string | null;
  handleSlugChange: (value: string) => void;
  submitting: boolean;
  handleSubmitBlank: () => void;
  pagePrimaryColor: string;
  setPagePrimaryColor: (value: string) => void;
  pageAccentColor: string;
  setPageAccentColor: (value: string) => void;
  gradient: GradientValue;
  setGradient: (value: GradientValue) => void;
  pageContext: string;
  setPageContext: (value: string) => void;
  dynamicSlots: DynamicSlotDef[];
  loadingSlots: boolean;
  textSlotCount: number;
  rewriting: boolean;
  rewriteError: string | null;
  rewriteAllFromIdentity: () => void;
  dynamicSlotValues: Record<string, string>;
  updateSlotValue: (key: string, value: string) => void;
  projectId: string;
  showOverrides: boolean;
  setShowOverrides: (value: boolean) => void;
  overridePlaceId: string;
  searchingGbp: boolean;
  gbpSearchQuery: string;
  handleGbpSearch: (query: string) => void;
  gbpSuggestions: PlaceSuggestion[];
  handleSelectGbpOverride: (suggestion: PlaceSuggestion) => void;
  dataSource: "website" | "pasted";
  setDataSource: (value: "website" | "pasted") => void;
  overrideWebsiteUrl: string;
  setOverrideWebsiteUrl: (value: string) => void;
  scrapedData: string;
  setScrapedData: (value: string) => void;
}

export default function TemplateModeFields({
  step,
  templatePages,
  selectedPageId,
  loadingPages,
  setSelectedPageId,
  slug,
  slugError,
  handleSlugChange,
  submitting,
  handleSubmitBlank,
  pagePrimaryColor,
  setPagePrimaryColor,
  pageAccentColor,
  setPageAccentColor,
  gradient,
  setGradient,
  pageContext,
  setPageContext,
  dynamicSlots,
  loadingSlots,
  textSlotCount,
  rewriting,
  rewriteError,
  rewriteAllFromIdentity,
  dynamicSlotValues,
  updateSlotValue,
  projectId,
  showOverrides,
  setShowOverrides,
  overridePlaceId,
  searchingGbp,
  gbpSearchQuery,
  handleGbpSearch,
  gbpSuggestions,
  handleSelectGbpOverride,
  dataSource,
  setDataSource,
  overrideWebsiteUrl,
  setOverrideWebsiteUrl,
  scrapedData,
  setScrapedData,
}: TemplateModeFieldsProps) {
  return (
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
  );
}
