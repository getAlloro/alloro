import { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2, Check, Sparkles } from "lucide-react";
import {
  fetchIdentity,
  fetchIdentityStatus,
  startIdentityWarmup,
  updateIdentity,
  testUrl,
  type ScrapeStrategy,
  type WarmupUrlInput,
  cancelGeneration,
  type ProjectIdentity,
  type ManualBusinessInput,
  type ManualLocationInput,
  type WarmupInputs,
  type WarmupStatus,
} from "../../../api/websites";
import { searchPlaces, getPlaceDetails } from "../../../api/places";
import type { PlaceSuggestion } from "../../../api/places";
import RerunWarmupDialog from "./RerunWarmupDialog";
import { getErrorMessage } from "../../../lib/errorMessage";
import type {
  IdentityTab,
  UrlInput,
  TextInput,
  WarmupSourceMode,
} from "./identityModal.types";
import {
  createManualLocation,
  emptyManualBusiness,
  isCompleteManualLocation,
  isCompleteManualIdentity,
  readIdentityLocations,
  extractSourceUrlString,
} from "./identityModal.utils";
import { EmptyWarmupForm } from "./IdentityModal/EmptyWarmupForm";
import { WarmingUpView } from "./IdentityModal/WarmingUpView";
import { ReadyView } from "./IdentityModal/ReadyView";

interface IdentityModalProps {
  projectId: string;
  onClose: () => void;
  onIdentityChanged?: (identity: ProjectIdentity) => void;
}

export default function IdentityModal({
  projectId,
  onClose,
  onIdentityChanged,
}: IdentityModalProps) {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<ProjectIdentity | null>(null);
  const [warmupStatus, setWarmupStatus] = useState<WarmupStatus>(null);
  const [error, setError] = useState<string | null>(null);

  // Warmup form state (empty state)
  const [gbpQuery, setGbpQuery] = useState("");
  const [gbpSuggestions, setGbpSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingGbp, setSearchingGbp] = useState(false);
  const [selectedPlaces, setSelectedPlaces] = useState<
    Array<{ placeId: string; name: string; address: string }>
  >([]);
  const [sourceMode, setSourceMode] = useState<WarmupSourceMode>("gbp");
  const [manualBusiness, setManualBusiness] = useState<ManualBusinessInput>(
    () => emptyManualBusiness(),
  );
  const [manualLocations, setManualLocations] = useState<ManualLocationInput[]>(
    () => [createManualLocation(true)],
  );
  const [urlInputs, setUrlInputs] = useState<UrlInput[]>([]);
  const [textInputs, setTextInputs] = useState<TextInput[]>([]);
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1E40AF");
  const [accentColor, setAccentColor] = useState("#F59E0B");
  const [gradientEnabled, setGradientEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Ready state
  const [activeTab, setActiveTab] = useState<IdentityTab>("summary");
  const [brandEditing, setBrandEditing] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonIsValid, setJsonIsValid] = useState(true);
  const [savingJson, setSavingJson] = useState(false);

  // Transient toast (e.g. after JSON save, slice save).
  const [toast, setToast] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Re-run warmup dialog (3-button replacement for native confirm())
  const [rerunDialogOpen, setRerunDialogOpen] = useState(false);
  // When true, handleGenerate() is auto-invoked once the form view mounts
  // with rehydrated state. Cleared after firing to prevent re-fires.
  const [pendingAutoSubmit, setPendingAutoSubmit] = useState(false);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // Load identity on mount
  useEffect(() => {
    isMountedRef.current = true;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetchIdentity(projectId);
        if (!isMountedRef.current) return;
        setIdentity(res.data);
        setWarmupStatus(res.data?.meta?.warmup_status || null);

        if (res.data?.brand?.primary_color) {
          setPrimaryColor(res.data.brand.primary_color);
        }
        if (res.data?.brand?.accent_color) {
          setAccentColor(res.data.brand.accent_color);
        }
        if (res.data?.brand?.gradient_enabled) {
          setGradientEnabled(true);
        }
      } catch (err: unknown) {
        if (!isMountedRef.current) return;
        setError(getErrorMessage(err) || "Failed to load identity");
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    };
    load();

    return () => {
      isMountedRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [projectId]);

  // Poll while warmup is running/queued
  useEffect(() => {
    if (warmupStatus !== "running" && warmupStatus !== "queued") return;

    const poll = async () => {
      try {
        const statusRes = await fetchIdentityStatus(projectId);
        if (!isMountedRef.current) return;
        const next = statusRes.data.warmup_status;
        setWarmupStatus(next);
        if (next === "ready" || next === "failed") {
          // Reload full identity
          const res = await fetchIdentity(projectId);
          if (!isMountedRef.current) return;
          setIdentity(res.data);
          if (next === "ready" && res.data) {
            onIdentityChanged?.(res.data);
          }
          return;
        }
        pollRef.current = setTimeout(poll, 2000);
      } catch (err) {
        pollRef.current = setTimeout(poll, 3000);
      }
    };

    pollRef.current = setTimeout(poll, 2000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [warmupStatus, projectId, onIdentityChanged]);

  // Debounced GBP search
  useEffect(() => {
    if (!gbpQuery.trim() || gbpQuery.length < 3) {
      setGbpSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setSearchingGbp(true);
        const response = await searchPlaces(gbpQuery);
        if (isMountedRef.current) setGbpSuggestions(response.suggestions || []);
      } finally {
        if (isMountedRef.current) setSearchingGbp(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [gbpQuery]);

  const handleSelectPlace = async (suggestion: PlaceSuggestion) => {
    try {
      const response = await getPlaceDetails(suggestion.placeId);
      const place = response.place;
      const entry = {
        placeId: suggestion.placeId,
        name: String(place?.name || suggestion.mainText || suggestion.description),
        address: String(place?.formattedAddress || suggestion.secondaryText || suggestion.description),
      };
      setSelectedPlaces((prev) =>
        prev.some((p) => p.placeId === entry.placeId) ? prev : [...prev, entry],
      );
      setGbpSuggestions([]);
      setGbpQuery("");
    } catch (err) {
      setError("Failed to load place details");
    }
  };

  const addUrlInput = () => {
    setUrlInputs((prev) => [
      ...prev,
      { id: `url-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, url: "" },
    ]);
  };

  const removeUrlInput = (id: string) => {
    setUrlInputs((prev) => prev.filter((u) => u.id !== id));
  };

  const updateUrlInput = (id: string, url: string) => {
    setUrlInputs((prev) =>
      prev.map((u) =>
        u.id === id ? { ...u, url, testResult: null, strategy: undefined } : u,
      ),
    );
  };

  const setUrlStrategy = (id: string, strategy: ScrapeStrategy) => {
    setUrlInputs((prev) =>
      prev.map((u) => (u.id === id ? { ...u, strategy } : u)),
    );
  };

  const runUrlTest = async (id: string) => {
    const target = urlInputs.find((u) => u.id === id);
    if (!target || !target.url.trim()) return;
    setUrlInputs((prev) =>
      prev.map((u) => (u.id === id ? { ...u, testing: true, testResult: null } : u)),
    );
    try {
      const res = await testUrl(projectId, target.url.trim());
      const result = res.data;
      setUrlInputs((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                testing: false,
                testResult: result,
                strategy: result.ok
                  ? "fetch"
                  : u.strategy || "browser",
              }
            : u,
        ),
      );
    } catch (err: unknown) {
      setUrlInputs((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                testing: false,
                testResult: {
                  ok: false,
                  block_type: "unknown",
                  status: null,
                  detail: getErrorMessage(err) || "Test failed",
                  detected_signals: [],
                },
              }
            : u,
        ),
      );
    }
  };

  const addTextInput = () => {
    setTextInputs((prev) => [
      ...prev,
      {
        id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: "",
        text: "",
      },
    ]);
  };

  const removeTextInput = (id: string) => {
    setTextInputs((prev) => prev.filter((t) => t.id !== id));
  };

  const updateTextInput = (id: string, patch: Partial<Omit<TextInput, "id">>) => {
    setTextInputs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const updateManualBusiness = (patch: Partial<ManualBusinessInput>) => {
    setManualBusiness((prev) => ({ ...prev, ...patch }));
  };

  const addManualLocation = () => {
    setManualLocations((prev) => [...prev, createManualLocation(prev.length === 0)]);
  };

  const updateManualLocation = (
    id: string | undefined,
    patch: Partial<ManualLocationInput>,
  ) => {
    if (!id) return;
    setManualLocations((prev) =>
      prev.map((location) =>
        location.id === id ? { ...location, ...patch } : location,
      ),
    );
  };

  const removeManualLocation = (id: string | undefined) => {
    if (!id) return;
    setManualLocations((prev) => {
      const next = prev.filter((location) => location.id !== id);
      if (next.length === 0) return [createManualLocation(true)];
      if (next.some((location) => location.isPrimary)) return next;
      return next.map((location, index) => ({ ...location, isPrimary: index === 0 }));
    });
  };

  const setPrimaryManualLocation = (id: string | undefined) => {
    if (!id) return;
    setManualLocations((prev) =>
      prev.map((location) => ({ ...location, isPrimary: location.id === id })),
    );
  };

  const handleGenerate = async () => {
    if (submitting) return;

    if (sourceMode === "gbp" && selectedPlaces.length === 0) {
      setError("Select at least one Google Business Profile, or switch to No GBP yet.");
      return;
    }

    if (
      sourceMode === "manual" &&
      !isCompleteManualIdentity(manualBusiness, manualLocations)
    ) {
      setError(
        "No GBP data requires business name, category, phone, and one complete location with hours.",
      );
      return;
    }

    setError(null);
    try {
      setSubmitting(true);
      const manualMode = sourceMode === "manual";
      const inputs: WarmupInputs = {
        placeId: manualMode ? undefined : selectedPlaces[0]?.placeId,
        placeIds:
          !manualMode && selectedPlaces.length > 0
            ? selectedPlaces.map((p) => p.placeId)
            : undefined,
        practiceSearchString: manualMode ? manualBusiness.name.trim() : undefined,
        urls: urlInputs
          .filter((u) => u.url.trim())
          .map((u): WarmupUrlInput | string => {
            const trimmed = u.url.trim();
            if (u.strategy && u.strategy !== "fetch") {
              return { url: trimmed, strategy: u.strategy };
            }
            return trimmed;
          }),
        texts: textInputs
          .filter((t) => t.text.trim())
          .map((t) => ({ label: t.label.trim() || undefined, text: t.text.trim() })),
        manualBusiness: manualMode
          ? {
              name: manualBusiness.name.trim(),
              category: manualBusiness.category.trim(),
              phone: manualBusiness.phone.trim(),
              websiteUrl: manualBusiness.websiteUrl?.trim() || undefined,
            }
          : undefined,
        manualLocations: manualMode
          ? manualLocations
              .filter(isCompleteManualLocation)
              .map((location) => ({
                ...location,
                name: location.name.trim(),
                address: location.address.trim(),
                city: location.city.trim(),
                state: location.state.trim(),
                zip: location.zip.trim(),
                phone: location.phone.trim(),
                websiteUrl: location.websiteUrl?.trim() || undefined,
              }))
          : undefined,
        logoUrl: logoUrl.trim() || undefined,
        primaryColor,
        accentColor,
        gradient: gradientEnabled
          ? { enabled: true, from: primaryColor, to: accentColor, direction: "to-br" }
          : { enabled: false },
      };

      await startIdentityWarmup(projectId, inputs);
      setWarmupStatus("queued");
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to start warmup");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Rehydrate the EmptyWarmupForm state from the current identity so the
   * admin can replay warmup verbatim. Pulled from:
   *   - identity.locations[] (primary source of selected places — there is
   *     no project.selected_place_ids field yet, and locations[] carries
   *     the exact place_id/name/address triple we need).
   *   - identity.sources_used.urls[] (each entry becomes a UrlInput).
   *   - identity.raw_inputs.user_text_inputs[] (full text is stored).
   *
   * Returns true when at least one source was rehydrated — caller uses that
   * to decide whether the auto-submit is safe.
   */
  const rehydrateFromIdentity = useCallback((): boolean => {
    if (!identity) return false;

    // Locations → selectedPlaces (primary first).
    const rawLocations = readIdentityLocations(identity);
    const sortedLocations = [...rawLocations].sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return 0;
    });
    const rehydratedPlaces = sortedLocations
      .filter((loc) => !!loc.place_id && loc.source !== "manual")
      .map((loc) => ({
        placeId: loc.place_id as string,
        name: loc.name || "",
        address: loc.address || "",
      }));

    const rehydratedManualLocations: ManualLocationInput[] = sortedLocations
      .filter((loc) => loc.source === "manual" || !loc.place_id)
      .map((loc, idx) => ({
        id: loc.id || `manual-rehydrated-${Date.now()}-${idx}`,
        name: loc.name || "",
        address: loc.address || "",
        city: loc.city || "",
        state: loc.state || "",
        zip: loc.zip || "",
        phone: loc.phone || "",
        websiteUrl: loc.website_url || "",
        hours:
          loc.hours && typeof loc.hours === "object"
            ? (loc.hours as Record<string, string>)
            : {},
        isPrimary: !!loc.is_primary,
      }));

    // URLs → urlInputs. Historically `sources_used.urls[].url` was a plain
    // string; newer identities wrap it as `{url, strategy}`. Normalize both
    // shapes before trimming.
    const sourceUrls = identity.sources_used?.urls || [];
    const rehydratedUrls: UrlInput[] = sourceUrls
      .map((u) => extractSourceUrlString(u))
      .filter((url) => !!url)
      .map((url, idx) => ({
        id: `rehydrated-url-${Date.now()}-${idx}`,
        url,
        strategy: "fetch" as ScrapeStrategy,
      }));

    // Text inputs → textInputs.
    const rawTexts = identity.raw_inputs?.user_text_inputs || [];
    const rehydratedTexts: TextInput[] = rawTexts
      .filter((t) => t && typeof t.text === "string" && t.text.trim().length > 0)
      .map((t, idx) => ({
        id: `rehydrated-text-${Date.now()}-${idx}`,
        label: t.label || "",
        text: t.text,
      }));

    setSelectedPlaces(rehydratedPlaces);
    setManualBusiness({
      name: identity.business?.name || "",
      category: identity.business?.category || "",
      phone: identity.business?.phone || "",
      websiteUrl: identity.business?.website_url || "",
    });
    setManualLocations(
      rehydratedManualLocations.length > 0
        ? rehydratedManualLocations
        : [createManualLocation(true)],
    );
    setSourceMode(
      rehydratedPlaces.length > 0 || rehydratedManualLocations.length === 0
        ? "gbp"
        : "manual",
    );
    setUrlInputs(rehydratedUrls);
    setTextInputs(rehydratedTexts);
    // Preserve brand colors from the current identity so the replay uses the
    // same palette as before (these aren't wiped on re-run; they're just
    // passed through to the warmup payload).
    if (identity.brand?.primary_color) setPrimaryColor(identity.brand.primary_color);
    if (identity.brand?.accent_color) setAccentColor(identity.brand.accent_color);
    setGradientEnabled(!!identity.brand?.gradient_enabled);
    setLogoUrl(""); // Logo URL re-seeds from the already-hosted s3_url via the backend; don't re-fetch.

    return (
      rehydratedPlaces.length > 0 ||
      rehydratedManualLocations.length > 0 ||
      rehydratedUrls.length > 0 ||
      rehydratedTexts.length > 0
    );
  }, [identity]);

  /**
   * Detect whether the current identity has any source we can rehydrate.
   * Used to disable the "Keep current sources" primary action when there's
   * nothing to replay.
   */
  const canKeepSources = (() => {
    if (!identity) return false;
    const hasLocations = readIdentityLocations(identity).some(
      (loc) => !!loc.place_id,
    );
    const hasManualLocations = readIdentityLocations(identity).some(
      (loc) => loc.source === "manual" || !loc.place_id,
    );
    const hasUrls = (identity.sources_used?.urls || []).some(
      (u) => extractSourceUrlString(u).length > 0,
    );
    const hasTexts = (identity.raw_inputs?.user_text_inputs || []).some(
      (t) => typeof t?.text === "string" && t.text.trim().length > 0,
    );
    return hasLocations || hasManualLocations || hasUrls || hasTexts;
  })();

  const handleRerunRequested = () => {
    setRerunDialogOpen(true);
  };

  const handleRerunKeepSources = () => {
    setRerunDialogOpen(false);
    const rehydrated = rehydrateFromIdentity();
    if (!rehydrated) {
      setError(
        "No prior sources to reuse. Use 'Edit sources' to enter new inputs.",
      );
      return;
    }
    // Drop to the empty form view so EmptyWarmupForm renders with rehydrated
    // state, then auto-submit on the next tick.
    setWarmupStatus(null);
    setIdentity(null);
    setPendingAutoSubmit(true);
  };

  const handleRerunEditSources = () => {
    setRerunDialogOpen(false);
    setWarmupStatus(null);
    setIdentity(null);
  };

  // Auto-submit the warmup form once the EmptyWarmupForm view is mounted
  // with rehydrated state. Runs in a short microtask so setState batches
  // from handleRerunKeepSources have flushed.
  useEffect(() => {
    if (!pendingAutoSubmit) return;
    // Only fire once the modal is actually in the empty/form state.
    if (identity !== null || warmupStatus !== null) return;
    setPendingAutoSubmit(false);
    // Defer so the rehydrated state is visible to the user for a beat.
    const t = setTimeout(() => {
      void handleGenerate();
    }, 0);
    return () => clearTimeout(t);
    // handleGenerate is declared below; we intentionally only depend on the
    // pending flag + view state here to avoid re-running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoSubmit, identity, warmupStatus]);

  const handleCancel = async () => {
    if (!confirm("Cancel the running warmup?")) return;
    try {
      await cancelGeneration(projectId);
      setWarmupStatus("failed");
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to cancel");
    }
  };

  const handleJsonTabOpen = () => {
    if (identity) setJsonDraft(JSON.stringify(identity, null, 2));
    setJsonError(null);
    setJsonIsValid(true);
    setActiveTab("json");
  };

  const handleJsonSave = async () => {
    setJsonError(null);
    if (!jsonIsValid) {
      setJsonError("Fix JSON errors before saving.");
      return;
    }
    let parsed: ProjectIdentity;
    try {
      parsed = JSON.parse(jsonDraft);
    } catch (err) {
      setJsonError("Invalid JSON.");
      return;
    }
    try {
      setSavingJson(true);
      const res = await updateIdentity(projectId, parsed);
      setIdentity(res.data);
      onIdentityChanged?.(res.data);
      setToast({ type: "success", text: "Identity saved." });
    } catch (err: unknown) {
      setJsonError(getErrorMessage(err) || "Save failed");
    } finally {
      setSavingJson(false);
    }
  };

  const handleSaveBrand = async (nextBrand: ProjectIdentity["brand"]) => {
    if (!identity) return;
    const updated: ProjectIdentity = {
      ...identity,
      brand: nextBrand,
      last_updated_at: new Date().toISOString(),
    };
    const res = await updateIdentity(projectId, updated);
    setIdentity(res.data);
    onIdentityChanged?.(res.data);
    setToast({ type: "success", text: "Brand updated." });
  };

  // Auto-dismiss toast after 4s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const isWarming = warmupStatus === "running" || warmupStatus === "queued";
  const isReady = warmupStatus === "ready" && !!identity?.business;
  const isEmpty = !isWarming && !isReady;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={!submitting && !isWarming ? onClose : undefined}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-alloro-orange" />
              <h2 className="text-lg font-bold text-gray-900">Project Identity</h2>
              {isReady && (
                <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                  <Check className="h-3 w-3" /> Ready
                </span>
              )}
              {isWarming && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  <Loader2 className="h-3 w-3 animate-spin" /> Warming up
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="max-h-[75vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : isEmpty ? (
              <EmptyWarmupForm
                sourceMode={sourceMode}
                setSourceMode={setSourceMode}
                gbpQuery={gbpQuery}
                setGbpQuery={setGbpQuery}
                gbpSuggestions={gbpSuggestions}
                searchingGbp={searchingGbp}
                selectedPlaces={selectedPlaces}
                removeSelectedPlace={(pid) =>
                  setSelectedPlaces((prev) => prev.filter((p) => p.placeId !== pid))
                }
                setPrimaryPlace={(pid) =>
                  setSelectedPlaces((prev) => {
                    const target = prev.find((p) => p.placeId === pid);
                    if (!target) return prev;
                    return [target, ...prev.filter((p) => p.placeId !== pid)];
                  })
                }
                onSelectPlace={handleSelectPlace}
                manualBusiness={manualBusiness}
                updateManualBusiness={updateManualBusiness}
                manualLocations={manualLocations}
                addManualLocation={addManualLocation}
                updateManualLocation={updateManualLocation}
                removeManualLocation={removeManualLocation}
                setPrimaryManualLocation={setPrimaryManualLocation}
                urlInputs={urlInputs}
                addUrlInput={addUrlInput}
                removeUrlInput={removeUrlInput}
                updateUrlInput={updateUrlInput}
                runUrlTest={runUrlTest}
                setUrlStrategy={setUrlStrategy}
                textInputs={textInputs}
                addTextInput={addTextInput}
                removeTextInput={removeTextInput}
                updateTextInput={updateTextInput}
                logoUrl={logoUrl}
                setLogoUrl={setLogoUrl}
                primaryColor={primaryColor}
                setPrimaryColor={setPrimaryColor}
                accentColor={accentColor}
                setAccentColor={setAccentColor}
                gradientEnabled={gradientEnabled}
                setGradientEnabled={setGradientEnabled}
                error={error}
                submitting={submitting}
                onGenerate={handleGenerate}
                onCancel={onClose}
              />
            ) : isWarming ? (
              <WarmingUpView
                status={warmupStatus}
                onCancel={handleCancel}
              />
            ) : isReady && identity ? (
              <ReadyView
                projectId={projectId}
                identity={identity}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onJsonTabOpen={handleJsonTabOpen}
                jsonDraft={jsonDraft}
                setJsonDraft={setJsonDraft}
                jsonError={jsonError}
                jsonIsValid={jsonIsValid}
                setJsonIsValid={setJsonIsValid}
                savingJson={savingJson}
                onJsonSave={handleJsonSave}
                toast={toast}
                brandEditing={brandEditing}
                setBrandEditing={setBrandEditing}
                onSaveBrand={handleSaveBrand}
                onIdentityRefresh={(next) => {
                  setIdentity(next);
                  onIdentityChanged?.(next);
                }}
                onRerun={handleRerunRequested}
                onToast={setToast}
              />
            ) : null}
          </div>
        </div>
      </div>

      <RerunWarmupDialog
        open={rerunDialogOpen}
        canKeepSources={canKeepSources}
        onKeepSources={handleRerunKeepSources}
        onEditSources={handleRerunEditSources}
        onCancel={() => setRerunDialogOpen(false)}
      />
    </div>
  );
}
