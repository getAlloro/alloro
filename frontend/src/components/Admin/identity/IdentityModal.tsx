import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Plus,
  Trash2,
  Loader2,
  Check,
  Search,
  MapPin,
  Star,
  Sparkles,
  RefreshCw,
  Code,
  Layout,
  Globe,
  FileText,
  Image as ImageIcon,
  Stethoscope,
  Briefcase,
  ExternalLink,
  AlertTriangle,
  Pencil,
  FileJson,
} from "lucide-react";
import {
  fetchIdentity,
  fetchIdentityStatus,
  startIdentityWarmup,
  updateIdentity,
  patchIdentitySlice,
  testUrl,
  type BlockCheckResult,
  type ScrapeStrategy,
  type WarmupUrlInput,
  cancelGeneration,
  type ProjectIdentity,
  type ProjectIdentityListEntry,
  type ProjectIdentityLocation,
  type IdentityListName,
  type ManualBusinessInput,
  type ManualLocationInput,
  type WarmupInputs,
  type WarmupStatus,
  resyncProjectIdentityList,
  setPrimaryLocation,
  removeProjectLocation,
  resyncProjectLocation,
} from "../../../api/websites";
import { searchPlaces, getPlaceDetails } from "../../../api/places";
import type { PlaceSuggestion } from "../../../api/places";
import ColorPicker from "../page-pipeline/ColorPicker";
import GradientPicker from "../page-pipeline/GradientPicker";
import type { GradientValue } from "../page-pipeline/GradientPicker";
import AddLocationModal from "../org/AddLocationModal";
import IdentityImagesTab from "./IdentityImagesTab";
import IdentitySliceEditor from "./IdentitySliceEditor";
import MonacoJsonEditor from "../MonacoJsonEditor";
import RerunWarmupDialog from "./RerunWarmupDialog";
import { useConfirm } from "../../ui/ConfirmModal";
import { showSuccessToast, showErrorToast } from "../../../lib/toast";
import { getErrorMessage } from "../../../lib/errorMessage";

type IdentityTab =
  | "summary"
  | "json"
  | "doctors"
  | "services"
  | "locations"
  | "images";

interface IdentityModalProps {
  projectId: string;
  onClose: () => void;
  onIdentityChanged?: (identity: ProjectIdentity) => void;
}

interface UrlInput {
  id: string;
  url: string;
  testing?: boolean;
  testResult?: BlockCheckResult | null;
  strategy?: ScrapeStrategy;
}

interface TextInput {
  id: string;
  label: string;
  text: string;
}

type WarmupSourceMode = "gbp" | "manual";

const MANUAL_HOUR_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function createManualLocation(isPrimary = false): ManualLocationInput {
  return {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    websiteUrl: "",
    hours: {},
    isPrimary,
  };
}

function emptyManualBusiness(): ManualBusinessInput {
  return {
    name: "",
    category: "",
    phone: "",
    websiteUrl: "",
  };
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasManualHours(hours: ManualLocationInput["hours"]): boolean {
  return Object.values(hours || {}).some((value) => hasText(value));
}

function isCompleteManualLocation(location: ManualLocationInput): boolean {
  return (
    hasText(location.name) &&
    hasText(location.address) &&
    hasText(location.city) &&
    hasText(location.state) &&
    hasText(location.zip) &&
    hasText(location.phone) &&
    hasManualHours(location.hours)
  );
}

function isCompleteManualIdentity(
  business: ManualBusinessInput,
  locations: ManualLocationInput[],
): boolean {
  return (
    hasText(business.name) &&
    hasText(business.category) &&
    hasText(business.phone) &&
    locations.some(isCompleteManualLocation)
  );
}

/**
 * `identity.locations[]` isn't declared on ProjectIdentity yet (it's a JSONB
 * extension shipped in the identity-enrichments plan) — this helper narrows
 * the untyped lookup in one place so consumers don't reach for `as any`.
 */
function readIdentityLocations(
  identity: ProjectIdentity,
): ProjectIdentityLocation[] {
  const raw = (identity as unknown as { locations?: unknown }).locations;
  return Array.isArray(raw) ? (raw as ProjectIdentityLocation[]) : [];
}

function isManualIdentityLocation(location: ProjectIdentityLocation): boolean {
  return location.source === "manual" || !location.place_id;
}

function getIdentityLocationKey(location: ProjectIdentityLocation): string {
  return (
    location.place_id ||
    location.id ||
    `${location.source || "location"}-${location.name}-${location.address || ""}`
  );
}

function buildBusinessFromLocation(
  location: ProjectIdentityLocation,
  fallback?: ProjectIdentity["business"],
): ProjectIdentity["business"] {
  return {
    name: location.name || fallback?.name || null,
    category: location.category || fallback?.category || null,
    phone: location.phone || fallback?.phone || null,
    address: location.address || fallback?.address || null,
    city: location.city || fallback?.city || null,
    state: location.state || fallback?.state || null,
    zip: location.zip || fallback?.zip || null,
    hours: location.hours ?? fallback?.hours ?? null,
    rating: location.rating ?? null,
    review_count: location.review_count ?? null,
    website_url: location.website_url || fallback?.website_url || null,
    place_id: location.place_id || null,
  };
}

/**
 * `sources_used.urls[].url` shape drift: older identities store a bare
 * string, newer ones wrap it as `{url: string, strategy: string}`. Narrow
 * to a trimmed string either way.
 */
function extractSourceUrlString(entry: unknown): string {
  if (!entry || typeof entry !== "object") return "";
  const raw = (entry as { url?: unknown }).url;
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    const inner = (raw as { url?: unknown }).url;
    if (typeof inner === "string") return inner.trim();
  }
  return "";
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

// ---------------------------------------------------------------------------
// EmptyWarmupForm — the warmup inputs form
// ---------------------------------------------------------------------------

interface EmptyFormProps {
  sourceMode: WarmupSourceMode;
  setSourceMode: (mode: WarmupSourceMode) => void;
  gbpQuery: string;
  setGbpQuery: (v: string) => void;
  gbpSuggestions: PlaceSuggestion[];
  searchingGbp: boolean;
  selectedPlaces: Array<{ placeId: string; name: string; address: string }>;
  removeSelectedPlace: (placeId: string) => void;
  setPrimaryPlace: (placeId: string) => void;
  onSelectPlace: (s: PlaceSuggestion) => void;
  manualBusiness: ManualBusinessInput;
  updateManualBusiness: (patch: Partial<ManualBusinessInput>) => void;
  manualLocations: ManualLocationInput[];
  addManualLocation: () => void;
  updateManualLocation: (
    id: string | undefined,
    patch: Partial<ManualLocationInput>,
  ) => void;
  removeManualLocation: (id: string | undefined) => void;
  setPrimaryManualLocation: (id: string | undefined) => void;
  urlInputs: UrlInput[];
  addUrlInput: () => void;
  removeUrlInput: (id: string) => void;
  updateUrlInput: (id: string, url: string) => void;
  runUrlTest: (id: string) => void;
  setUrlStrategy: (id: string, strategy: ScrapeStrategy) => void;
  textInputs: TextInput[];
  addTextInput: () => void;
  removeTextInput: (id: string) => void;
  updateTextInput: (id: string, patch: Partial<Omit<TextInput, "id">>) => void;
  logoUrl: string;
  setLogoUrl: (v: string) => void;
  primaryColor: string;
  setPrimaryColor: (v: string) => void;
  accentColor: string;
  setAccentColor: (v: string) => void;
  gradientEnabled: boolean;
  setGradientEnabled: (v: boolean) => void;
  error: string | null;
  submitting: boolean;
  onGenerate: () => void;
  onCancel: () => void;
}

function EmptyWarmupForm(props: EmptyFormProps) {
  return (
    <div className="px-6 py-5 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          Tell us about this practice
        </h3>
        <p className="text-xs text-gray-500">
          Start with Google Business Profile when available. If not, use No GBP yet
          and enter the required business/location basics.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
        {([
          ["gbp", "Google Business Profile"],
          ["manual", "No GBP yet"],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => props.setSourceMode(mode)}
            className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
              props.sourceMode === mode
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* GBP — multi-select */}
      {props.sourceMode === "gbp" && (
      <section>
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
            <MapPin className="h-3.5 w-3.5" /> Google Business Profiles
            {props.selectedPlaces.length > 0 && (
              <span className="text-[10px] font-normal text-gray-400">
                ({props.selectedPlaces.length} selected)
              </span>
            )}
          </label>
          <span className="text-[10px] text-gray-400">
            One per location. First is primary.
          </span>
        </div>

        {props.selectedPlaces.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {props.selectedPlaces.map((p, idx) => {
              const isPrimary = idx === 0;
              return (
                <div
                  key={p.placeId}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {p.name}
                      </span>
                      {isPrimary && (
                        <span className="text-[9px] font-bold uppercase tracking-wide text-alloro-orange bg-alloro-orange/10 rounded px-1.5 py-0.5 shrink-0">
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{p.address}</div>
                  </div>
                  {!isPrimary && (
                    <button
                      onClick={() => props.setPrimaryPlace(p.placeId)}
                      className="text-[11px] text-gray-500 hover:text-alloro-orange shrink-0"
                      title="Make this the primary location"
                    >
                      Set primary
                    </button>
                  )}
                  <button
                    onClick={() => props.removeSelectedPlace(p.placeId)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 shrink-0"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={props.gbpQuery}
              onChange={(e) => props.setGbpQuery(e.target.value)}
              placeholder={
                props.selectedPlaces.length === 0
                  ? "Search for your business..."
                  : "Add another location..."
              }
              className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange"
            />
            {props.searchingGbp && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
            )}
          </div>
          {props.gbpSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
              {props.gbpSuggestions.map((s) => {
                const alreadySelected = props.selectedPlaces.some(
                  (p) => p.placeId === s.placeId,
                );
                return (
                  <button
                    key={s.placeId}
                    onClick={() => !alreadySelected && props.onSelectPlace(s)}
                    disabled={alreadySelected}
                    className={`block w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-0 ${
                      alreadySelected
                        ? "bg-gray-50 text-gray-400 cursor-not-allowed"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {s.mainText || s.description}
                        </div>
                        {s.secondaryText && (
                          <div className="text-xs text-gray-500 truncate">
                            {s.secondaryText}
                          </div>
                        )}
                      </div>
                      {alreadySelected && (
                        <span className="text-[10px] text-gray-400 shrink-0">
                          Added
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
      )}

      {props.sourceMode === "manual" && (
        <ManualNoGbpFields
          business={props.manualBusiness}
          onBusinessChange={props.updateManualBusiness}
          locations={props.manualLocations}
          onAddLocation={props.addManualLocation}
          onLocationChange={props.updateManualLocation}
          onRemoveLocation={props.removeManualLocation}
          onSetPrimary={props.setPrimaryManualLocation}
        />
      )}

      {/* URLs */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
            <Globe className="h-3.5 w-3.5" /> Page URLs to scrape
          </label>
          <button
            onClick={props.addUrlInput}
            className="inline-flex items-center gap-1 text-xs text-alloro-orange hover:text-orange-600 font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Add URL
          </button>
        </div>
        {props.urlInputs.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No URLs added.</p>
        ) : (
          <div className="space-y-2">
            {props.urlInputs.map((u) => (
              <UrlInputRow
                key={u.id}
                input={u}
                onChange={(url) => props.updateUrlInput(u.id, url)}
                onRemove={() => props.removeUrlInput(u.id)}
                onTest={() => props.runUrlTest(u.id)}
                onSetStrategy={(strategy) => props.setUrlStrategy(u.id, strategy)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Text */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
            <FileText className="h-3.5 w-3.5" /> Plain-text notes
          </label>
          <button
            onClick={props.addTextInput}
            className="inline-flex items-center gap-1 text-xs text-alloro-orange hover:text-orange-600 font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Add text
          </button>
        </div>
        {props.textInputs.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No text notes added.</p>
        ) : (
          <div className="space-y-2">
            {props.textInputs.map((t) => (
              <div key={t.id} className="rounded-lg border border-gray-200 p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={t.label}
                    onChange={(e) => props.updateTextInput(t.id, { label: e.target.value })}
                    placeholder="Label (optional, e.g., 'Founder note')"
                    className="flex-1 rounded border-0 px-0 py-1 text-xs text-gray-700 focus:outline-none focus:ring-0 placeholder:text-gray-400"
                  />
                  <button
                    onClick={() => props.removeTextInput(t.id)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <textarea
                  value={t.text}
                  onChange={(e) => props.updateTextInput(t.id, { text: e.target.value })}
                  placeholder="Paste content or write notes about the practice..."
                  rows={3}
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Logo */}
      <section>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
          <ImageIcon className="h-3.5 w-3.5" /> Logo URL (optional)
        </label>
        <input
          type="url"
          value={props.logoUrl}
          onChange={(e) => props.setLogoUrl(e.target.value)}
          placeholder="https://example.com/logo.png"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
        />
        <p className="text-[11px] text-gray-400 mt-1">
          Downloaded, hosted on S3, and used in generated layouts.
        </p>
      </section>

      {/* Brand colors */}
      <section>
        <label className="text-xs font-semibold text-gray-700 mb-2 block">Brand colors</label>
        <div className="grid grid-cols-2 gap-3">
          <ColorPicker
            value={props.primaryColor}
            onChange={props.setPrimaryColor}
            label="Primary"
          />
          <ColorPicker
            value={props.accentColor}
            onChange={props.setAccentColor}
            label="Accent"
          />
        </div>
        <label className="flex items-center gap-2 mt-3 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={props.gradientEnabled}
            onChange={(e) => props.setGradientEnabled(e.target.checked)}
            className="rounded"
          />
          Use gradient between primary and accent
        </label>
      </section>

      {props.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {props.error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
        <button
          onClick={props.onCancel}
          disabled={props.submitting}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          onClick={props.onGenerate}
          disabled={props.submitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {props.submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Starting...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Generate Identity
            </>
          )}
        </button>
      </div>
    </div>
  );
}

type ManualNoGbpFieldsProps = {
  business: ManualBusinessInput;
  onBusinessChange: (patch: Partial<ManualBusinessInput>) => void;
  locations: ManualLocationInput[];
  onAddLocation: () => void;
  onLocationChange: (
    id: string | undefined,
    patch: Partial<ManualLocationInput>,
  ) => void;
  onRemoveLocation: (id: string | undefined) => void;
  onSetPrimary: (id: string | undefined) => void;
};

function ManualNoGbpFields({
  business,
  onBusinessChange,
  locations,
  onAddLocation,
  onLocationChange,
  onRemoveLocation,
  onSetPrimary,
}: ManualNoGbpFieldsProps) {
  return (
    <section className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
      <div>
        <h4 className="text-xs font-semibold text-gray-800">No GBP basics</h4>
        <p className="mt-1 text-[11px] text-gray-500">
          Required: business name, category, phone, and one complete location with hours.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ManualTextField
          label="Business name"
          value={business.name}
          onChange={(value) => onBusinessChange({ name: value })}
          required
        />
        <ManualTextField
          label="Category / specialty"
          value={business.category}
          onChange={(value) => onBusinessChange({ category: value })}
          placeholder="Sleep dentistry"
          required
        />
        <ManualTextField
          label="Business phone"
          value={business.phone}
          onChange={(value) => onBusinessChange({ phone: value })}
          required
        />
        <ManualTextField
          label="Website URL"
          value={business.websiteUrl || ""}
          onChange={(value) => onBusinessChange({ websiteUrl: value })}
          placeholder="https://example.com"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
            <MapPin className="h-3.5 w-3.5" /> Manual locations
          </label>
          <button
            type="button"
            onClick={onAddLocation}
            className="inline-flex items-center gap-1 text-xs font-medium text-alloro-orange hover:text-orange-600"
          >
            <Plus className="h-3.5 w-3.5" /> Add location
          </button>
        </div>

        {locations.map((location, index) => (
          <ManualLocationEditor
            key={location.id || index}
            location={location}
            canRemove={locations.length > 1}
            onChange={(patch) => onLocationChange(location.id, patch)}
            onRemove={() => onRemoveLocation(location.id)}
            onSetPrimary={() => onSetPrimary(location.id)}
          />
        ))}
      </div>
    </section>
  );
}

type ManualLocationEditorProps = {
  location: ManualLocationInput;
  canRemove: boolean;
  onChange: (patch: Partial<ManualLocationInput>) => void;
  onRemove: () => void;
  onSetPrimary: () => void;
};

function ManualLocationEditor({
  location,
  canRemove,
  onChange,
  onRemove,
  onSetPrimary,
}: ManualLocationEditorProps) {
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">
            {location.name || "New location"}
          </span>
          {location.isPrimary && (
            <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
              Primary
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!location.isPrimary && (
            <button
              type="button"
              onClick={onSetPrimary}
              className="rounded px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-50 hover:text-alloro-orange"
            >
              Set primary
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
            aria-label="Remove manual location"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ManualTextField
          label="Location name"
          value={location.name}
          onChange={(value) => onChange({ name: value })}
          required
        />
        <ManualTextField
          label="Phone"
          value={location.phone}
          onChange={(value) => onChange({ phone: value })}
          required
        />
        <ManualTextField
          label="Street address"
          value={location.address}
          onChange={(value) => onChange({ address: value })}
          required
        />
        <ManualTextField
          label="City"
          value={location.city}
          onChange={(value) => onChange({ city: value })}
          required
        />
        <ManualTextField
          label="State"
          value={location.state}
          onChange={(value) => onChange({ state: value })}
          required
        />
        <ManualTextField
          label="ZIP"
          value={location.zip}
          onChange={(value) => onChange({ zip: value })}
          required
        />
        <ManualTextField
          label="Location website"
          value={location.websiteUrl || ""}
          onChange={(value) => onChange({ websiteUrl: value })}
          placeholder="Optional"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {MANUAL_HOUR_DAYS.map((day) => (
          <ManualTextField
            key={day}
            label={day}
            value={location.hours?.[day] || ""}
            onChange={(value) =>
              onChange({ hours: { ...(location.hours || {}), [day]: value } })
            }
            placeholder="9:00 AM - 5:00 PM"
          />
        ))}
      </div>
    </div>
  );
}

type ManualTextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
};

function ManualTextField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: ManualTextFieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-gray-600">
        {label}
        {required && <span className="text-alloro-orange"> *</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// WarmingUpView — shown while warmup is in progress
// ---------------------------------------------------------------------------

function WarmingUpView({
  status,
  onCancel,
}: {
  status: WarmupStatus;
  onCancel: () => void;
}) {
  return (
    <div className="px-6 py-16 flex flex-col items-center justify-center text-center space-y-4">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-amber-200 blur-xl opacity-40 animate-pulse" />
        <div className="relative rounded-full bg-amber-500 p-4">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
      </div>
      <div>
        <div className="text-base font-semibold text-gray-900">
          {status === "queued" ? "Queued..." : "Analyzing sources..."}
        </div>
        <div className="text-sm text-gray-500 mt-1">
          Scraping, analyzing images, classifying the practice, distilling content.
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        This usually takes 1-3 minutes.
      </div>
      <button
        onClick={onCancel}
        className="text-xs font-medium text-red-600 hover:text-red-800 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50"
      >
        Cancel
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReadyView — tabs: summary, json, doctors, services, locations, images
// ---------------------------------------------------------------------------

type ToastShape = { type: "success" | "error" | "info"; text: string };

interface ReadyViewProps {
  projectId: string;
  identity: ProjectIdentity;
  activeTab: IdentityTab;
  setActiveTab: (tab: IdentityTab) => void;
  onJsonTabOpen: () => void;
  jsonDraft: string;
  setJsonDraft: (v: string) => void;
  jsonError: string | null;
  jsonIsValid: boolean;
  setJsonIsValid: (v: boolean) => void;
  savingJson: boolean;
  onJsonSave: () => void;
  toast: ToastShape | null;
  onRerun: () => void;
  onSaveBrand: (brand: ProjectIdentity["brand"]) => Promise<void>;
  brandEditing: boolean;
  setBrandEditing: (v: boolean) => void;
  /** Called when a tab mutates identity (e.g. add/remove location, resync list). */
  onIdentityRefresh: (next: ProjectIdentity) => void;
  onToast: (toast: ToastShape | null) => void;
}

function ReadyView(props: ReadyViewProps) {
  const { identity } = props;
  const doctors: ProjectIdentityListEntry[] = Array.isArray(
    identity.content_essentials?.doctors,
  )
    ? (identity.content_essentials!.doctors as ProjectIdentityListEntry[])
    : [];
  const services: ProjectIdentityListEntry[] = Array.isArray(
    identity.content_essentials?.services,
  )
    ? (identity.content_essentials!.services as ProjectIdentityListEntry[])
    : [];
  const locations: ProjectIdentityLocation[] = Array.isArray(identity.locations)
    ? identity.locations
    : [];
  const images = identity.extracted_assets?.images || [];

  return (
    <div className="flex flex-col">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 pt-3 border-b border-gray-100 overflow-x-auto">
        <TabButton
          active={props.activeTab === "summary"}
          onClick={() => props.setActiveTab("summary")}
          icon={<Layout className="h-3.5 w-3.5" />}
          label="Summary"
        />
        <TabButton
          active={props.activeTab === "json"}
          onClick={props.brandEditing ? () => {} : props.onJsonTabOpen}
          icon={<Code className="h-3.5 w-3.5" />}
          label="JSON"
          disabled={props.brandEditing}
          title={props.brandEditing ? "Save or cancel brand edits first" : undefined}
        />
        <TabButton
          active={props.activeTab === "doctors"}
          onClick={() => props.setActiveTab("doctors")}
          icon={<Stethoscope className="h-3.5 w-3.5" />}
          label="Doctors"
          count={doctors.length}
        />
        <TabButton
          active={props.activeTab === "services"}
          onClick={() => props.setActiveTab("services")}
          icon={<Briefcase className="h-3.5 w-3.5" />}
          label="Services"
          count={services.length}
        />
        <TabButton
          active={props.activeTab === "locations"}
          onClick={() => props.setActiveTab("locations")}
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="Locations"
          count={locations.length}
        />
        <TabButton
          active={props.activeTab === "images"}
          onClick={() => props.setActiveTab("images")}
          icon={<ImageIcon className="h-3.5 w-3.5" />}
          label="Images"
          count={images.length}
        />
        <div className="flex-1" />
        <button
          onClick={props.onRerun}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Re-run warmup
        </button>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {props.activeTab === "summary" && (
          <IdentitySummary
            identity={identity}
            brandEditing={props.brandEditing}
            setBrandEditing={props.setBrandEditing}
            onSaveBrand={props.onSaveBrand}
          />
        )}
        {props.activeTab === "json" && (
          <IdentityJsonEditor
            draft={props.jsonDraft}
            setDraft={props.setJsonDraft}
            isValid={props.jsonIsValid}
            setIsValid={props.setJsonIsValid}
            error={props.jsonError}
            saving={props.savingJson}
            onSave={props.onJsonSave}
          />
        )}
        {props.activeTab === "doctors" && (
          <IdentityListTab
            projectId={props.projectId}
            list="doctors"
            entries={doctors}
            onIdentityChange={props.onIdentityRefresh}
            onToast={props.onToast}
          />
        )}
        {props.activeTab === "services" && (
          <IdentityListTab
            projectId={props.projectId}
            list="services"
            entries={services}
            onIdentityChange={props.onIdentityRefresh}
            onToast={props.onToast}
          />
        )}
        {props.activeTab === "locations" && (
          <IdentityLocationsTab
            projectId={props.projectId}
            identity={props.identity}
            locations={locations}
            onIdentityChange={props.onIdentityRefresh}
          />
        )}
        {props.activeTab === "images" && (
          <IdentityImagesTab images={images} />
        )}

        {props.toast && (
          <div
            className={`mt-4 rounded-lg border px-3 py-2 text-xs ${
              props.toast.type === "success"
                ? "bg-green-50 border-green-200 text-green-700"
                : props.toast.type === "error"
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-blue-50 border-blue-200 text-blue-700"
            }`}
          >
            {props.toast.text}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  disabled,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      className={`group inline-flex items-center px-2.5 py-2 text-xs font-medium rounded-t border-b-2 transition-colors ${
        active
          ? "text-alloro-orange border-alloro-orange"
          : disabled
            ? "text-gray-300 border-transparent cursor-not-allowed"
            : "text-gray-500 border-transparent hover:text-gray-700"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span
        className={`inline-flex items-center overflow-hidden whitespace-nowrap transition-all duration-200 ease-out ${
          active ? "max-w-[160px] opacity-100 ml-1.5" : "max-w-0 opacity-0 ml-0"
        }`}
      >
        {label}
        {typeof count === "number" && count > 0 && (
          <span className="ml-1 text-[10px] text-alloro-orange/70">({count})</span>
        )}
      </span>
    </button>
  );
}

function IdentitySummary({
  identity,
  brandEditing,
  setBrandEditing,
  onSaveBrand,
}: {
  identity: ProjectIdentity;
  brandEditing: boolean;
  setBrandEditing: (v: boolean) => void;
  onSaveBrand: (brand: ProjectIdentity["brand"]) => Promise<void>;
}) {
  const b = identity.business;
  const br = identity.brand;
  const v = identity.voice_and_tone;
  const ce = identity.content_essentials;
  const hoursRows = normalizeHours(b?.hours);

  return (
    <div className="space-y-4">
      <SummarySection title="Business">
        <SummaryRow label="Name" value={b?.name} />
        <SummaryRow label="Category" value={b?.category} />
        <SummaryRow label="Phone" value={b?.phone} />
        <SummaryRow label="Address" value={b?.address} />
        <SummaryRow
          label="Rating"
          value={b?.rating ? `${b.rating}★ (${b?.review_count || 0} reviews)` : null}
        />
        <HoursRow rows={hoursRows} />
      </SummarySection>

      <BrandEditableSection
        brand={br}
        editing={brandEditing}
        setEditing={setBrandEditing}
        onSave={onSaveBrand}
      />

      <SummarySection title="Voice & Tone">
        <SummaryRow label="Archetype" value={v?.archetype} />
        <SummaryRow label="Tone" value={v?.tone_descriptor} />
      </SummarySection>

      <SummarySection title="Content Essentials">
        <SummaryRow label="UVP" value={ce?.unique_value_proposition} />
        <SummaryRow
          label="Certifications"
          value={ce?.certifications?.length ? ce.certifications.join(", ") : null}
        />
        <SummaryRow
          label="Service areas"
          value={ce?.service_areas?.length ? ce.service_areas.join(", ") : null}
        />
        <SummaryRow
          label="Images analyzed"
          value={identity.extracted_assets?.images?.length || 0}
        />
      </SummarySection>
    </div>
  );
}

function BrandEditableSection({
  brand,
  editing,
  setEditing,
  onSave,
}: {
  brand: ProjectIdentity["brand"];
  editing: boolean;
  setEditing: (v: boolean) => void;
  onSave: (brand: ProjectIdentity["brand"]) => Promise<void>;
}) {
  const [primary, setPrimary] = useState<string>(brand?.primary_color || "#1E40AF");
  const [accent, setAccent] = useState<string>(brand?.accent_color || "#F59E0B");
  const [gradient, setGradient] = useState<GradientValue>({
    enabled: !!brand?.gradient_enabled,
    from: brand?.gradient_from || brand?.primary_color || "#1E40AF",
    to: brand?.gradient_to || brand?.accent_color || "#F59E0B",
    direction:
      (brand?.gradient_direction as GradientValue["direction"]) || "to-br",
    text_color: (brand?.gradient_text_color as "white" | "dark") || "white",
    preset:
      (brand?.gradient_preset as GradientValue["preset"]) || "smooth",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync from prop when editing opens
  useEffect(() => {
    if (!editing) return;
    setPrimary(brand?.primary_color || "#1E40AF");
    setAccent(brand?.accent_color || "#F59E0B");
    setGradient({
      enabled: !!brand?.gradient_enabled,
      from: brand?.gradient_from || brand?.primary_color || "#1E40AF",
      to: brand?.gradient_to || brand?.accent_color || "#F59E0B",
      direction:
        (brand?.gradient_direction as GradientValue["direction"]) || "to-br",
      text_color: (brand?.gradient_text_color as "white" | "dark") || "white",
      preset:
        (brand?.gradient_preset as GradientValue["preset"]) || "smooth",
    });
    setError(null);
  }, [editing, brand]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await onSave({
        ...(brand || {}),
        logo_s3_url: brand?.logo_s3_url ?? null,
        logo_alt_text: brand?.logo_alt_text ?? null,
        primary_color: primary,
        accent_color: accent,
        gradient_enabled: gradient.enabled,
        gradient_from: gradient.enabled ? gradient.from : null,
        gradient_to: gradient.enabled ? gradient.to : null,
        gradient_direction: gradient.direction,
        gradient_text_color: gradient.enabled ? gradient.text_color : null,
        gradient_preset: gradient.enabled ? gradient.preset : null,
      });
      setEditing(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Brand
        </h4>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-alloro-orange hover:text-orange-600"
          >
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-alloro-orange px-3 py-1 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        )}
      </div>

      {!editing ? (
        <>
          {/* Logo thumbnail — prepended so the admin can verify capture at a glance. */}
          <LogoThumbnailRow logoUrl={brand?.logo_s3_url} />
          <div className="grid grid-cols-2 gap-3">
            <ColorSwatch label="Primary" color={brand?.primary_color} />
            <ColorSwatch label="Accent" color={brand?.accent_color} />
          </div>
          {brand?.gradient_enabled && (
            <div className="mt-3 text-xs text-gray-500">
              Gradient: {brand.gradient_from || "?"} → {brand.gradient_to || "?"} ({brand.gradient_direction})
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <ColorPicker value={primary} onChange={setPrimary} label="Primary" />
            <ColorPicker value={accent} onChange={setAccent} label="Accent" />
          </div>
          <GradientPicker
            value={gradient}
            onChange={setGradient}
            defaultFrom={primary}
            defaultTo={accent}
          />
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
        {title}
      </h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-gray-500 shrink-0 min-w-[120px]">{label}</span>
      <span className="text-gray-900 text-right">
        {value === null || value === undefined || value === ""
          ? <span className="text-gray-300 italic">—</span>
          : value}
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Hours normalization + row renderer
// GBP can return hours in a few shapes; normalize to a Mon-Sun ordered list.
// -----------------------------------------------------------------------------

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
type DayName = (typeof DAY_ORDER)[number];

// GBP periods[] uses 0=Sunday. Map to our Monday-first labels.
const WEEKDAY_INDEX_TO_NAME: Record<number, DayName> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

function normalizeHours(raw: unknown): Array<{ day: DayName; text: string }> {
  const empty: Array<{ day: DayName; text: string }> = [];
  if (!raw) return empty;

  // Shape A: array of display strings — e.g. ["Monday: 9:00 AM – 5:00 PM", ...]
  if (Array.isArray(raw) && raw.every((r) => typeof r === "string")) {
    const byDay = new Map<DayName, string>();
    for (const line of raw as string[]) {
      const match = line.match(/^\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s*[:\-–]\s*(.+?)\s*$/i);
      if (!match) continue;
      const prefix = match[1].toLowerCase().slice(0, 3);
      const day = DAY_ORDER.find((d) => d.toLowerCase().startsWith(prefix));
      if (!day) continue;
      byDay.set(day, match[2].trim());
    }
    if (byDay.size > 0) {
      return DAY_ORDER.map((day) => ({ day, text: byDay.get(day) || "Closed" }));
    }
  }

  // Shape B: openingHours object with weekdayDescriptions: string[]
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const descriptions = obj.weekdayDescriptions;
    if (Array.isArray(descriptions) && descriptions.every((d) => typeof d === "string")) {
      return normalizeHours(descriptions);
    }

    // Shape C: openingHours.periods[] — [{open:{day,hour,minute}, close:{...}}]
    const periods = obj.periods;
    if (Array.isArray(periods)) {
      const byDay = new Map<DayName, string[]>();
      for (const p of periods as Array<Record<string, any>>) {
        const open = p?.open;
        const close = p?.close;
        if (!open || typeof open !== "object") continue;
        const dayIdx = typeof open.day === "number" ? open.day : -1;
        const day = WEEKDAY_INDEX_TO_NAME[dayIdx];
        if (!day) continue;
        const openStr = formatPeriodTime(open.hour, open.minute);
        const closeStr = close ? formatPeriodTime(close.hour, close.minute) : null;
        const range = closeStr ? `${openStr} – ${closeStr}` : `${openStr} (open 24h)`;
        const existing = byDay.get(day) || [];
        existing.push(range);
        byDay.set(day, existing);
      }
      if (byDay.size > 0) {
        return DAY_ORDER.map((day) => ({
          day,
          text: (byDay.get(day) || []).join(", ") || "Closed",
        }));
      }
    }
  }

  return empty;
}

function formatPeriodTime(hour: unknown, minute: unknown): string {
  const h = typeof hour === "number" ? hour : 0;
  const m = typeof minute === "number" ? minute : 0;
  const suffix = h >= 12 ? "PM" : "AM";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mm = m.toString().padStart(2, "0");
  return `${displayH}:${mm} ${suffix}`;
}

function HoursRow({ rows }: { rows: Array<{ day: DayName; text: string }> }) {
  if (rows.length === 0) {
    return (
      <div className="flex items-start justify-between gap-3 text-sm">
        <span className="text-gray-500 shrink-0 min-w-[120px]">Hours</span>
        <span className="text-gray-400 italic text-right">Not provided</span>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-gray-500 shrink-0 min-w-[120px]">Hours</span>
      <div className="text-gray-900 text-right space-y-0.5">
        {rows.map((r) => (
          <div key={r.day} className="flex items-center justify-end gap-3">
            <span className="text-gray-500 text-xs w-20 text-left">{r.day.slice(0, 3)}</span>
            <span className="text-gray-900">{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogoThumbnailRow({ logoUrl }: { logoUrl: string | null | undefined }) {
  if (logoUrl) {
    return (
      <div className="mb-3 flex items-center gap-3">
        <img
          src={logoUrl}
          alt="Logo"
          loading="lazy"
          className="h-12 w-12 rounded border border-gray-200 bg-gray-50 object-contain"
        />
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-700">Logo</div>
          <div className="text-[11px] text-gray-500 truncate">Hosted on S3</div>
        </div>
      </div>
    );
  }
  return (
    <div className="mb-3 flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50">
        <ImageIcon className="h-5 w-5 text-gray-300" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-gray-700">Logo</div>
        <div className="text-[11px] text-gray-500">
          No logo detected — upload in Brand edit mode.
        </div>
      </div>
    </div>
  );
}

function ColorSwatch({
  label,
  color,
}: {
  label: string;
  color: string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-8 w-8 rounded border border-gray-200"
        style={{ backgroundColor: color || "transparent" }}
      />
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-sm font-mono text-gray-900">{color || "—"}</div>
      </div>
    </div>
  );
}

function IdentityJsonEditor({
  draft,
  setDraft,
  isValid,
  setIsValid,
  error,
  saving,
  onSave,
}: {
  draft: string;
  setDraft: (v: string) => void;
  isValid: boolean;
  setIsValid: (v: boolean) => void;
  error: string | null;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Edit the full identity JSON directly. Validated on every keystroke.
        Save is disabled until the JSON is valid.
      </p>
      <MonacoJsonEditor
        value={draft}
        onChange={setDraft}
        onValidationChange={setIsValid}
        height="60vh"
      />
      {!isValid && (
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Invalid JSON — fix before saving
        </div>
      )}
      {error && isValid && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end">
        <button
          onClick={onSave}
          disabled={saving || !isValid}
          className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving...
            </>
          ) : (
            "Save JSON"
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// URL Input row with test + strategy picker (Plan — Part 3)
// ---------------------------------------------------------------------------

function UrlInputRow({
  input,
  onChange,
  onRemove,
  onTest,
  onSetStrategy,
}: {
  input: UrlInput;
  onChange: (url: string) => void;
  onRemove: () => void;
  onTest: () => void;
  onSetStrategy: (s: ScrapeStrategy) => void;
}) {
  const result = input.testResult;
  const showStrategyPicker = result && !result.ok;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 p-2">
        <input
          type="url"
          value={input.url}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/about"
          className="flex-1 rounded-lg border-0 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
        />
        <button
          onClick={onTest}
          disabled={input.testing || !input.url.trim()}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {input.testing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            "Test"
          )}
        </button>
        {renderStatusIcon(result)}
        <button
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {result && !result.ok && (
        <div className="border-t border-gray-100 bg-amber-50/50 px-3 py-2 text-xs">
          <div className="flex items-start gap-1.5 text-amber-800">
            <span className="font-semibold">Blocked:</span>
            <span>
              {result.block_type} — {result.detail}
            </span>
          </div>
          {result.detected_signals.length > 0 && (
            <div className="text-[10px] text-amber-700 mt-0.5 font-mono">
              Signals: {result.detected_signals.join(", ")}
            </div>
          )}
        </div>
      )}

      {result && result.ok && (
        <div className="border-t border-gray-100 bg-green-50/50 px-3 py-2 text-xs text-green-800">
          OK — {result.preview_chars.toLocaleString()} chars, status {result.status}
        </div>
      )}

      {showStrategyPicker && (
        <div className="border-t border-gray-100 bg-white px-3 py-2 space-y-2">
          <div className="text-[11px] font-semibold text-gray-700">
            Fallback strategy for this URL:
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <StrategyButton
              label="Browser render (slower)"
              description="Uses Chromium to render JS — bypasses most challenges"
              active={input.strategy === "browser"}
              onClick={() => onSetStrategy("browser")}
            />
            <StrategyButton
              label="Screenshot + AI"
              description="Screenshots the page and extracts text via AI — last resort"
              active={input.strategy === "screenshot"}
              onClick={() => onSetStrategy("screenshot")}
            />
            <StrategyButton
              label="Skip this URL"
              description="Don't include this URL in warmup"
              active={input.strategy === "fetch" && result && !result.ok}
              onClick={() => onSetStrategy("fetch")}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StrategyButton({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={description}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 transition ${
        active
          ? "border-alloro-orange bg-alloro-orange/10 text-alloro-orange"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

function renderStatusIcon(result: BlockCheckResult | null | undefined) {
  if (!result) return null;
  if (result.ok) {
    return (
      <span
        title={`OK (status ${result.status})`}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white text-[10px]"
      >
        ✓
      </span>
    );
  }
  return (
    <span
      title={result.detail}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[10px]"
    >
      !
    </span>
  );
}

// ---------------------------------------------------------------------------
// T7 — Doctors / Services / Locations tabs
// ---------------------------------------------------------------------------

/** Format an ISO timestamp as a compact relative string (e.g. "3h ago"). */
function humanizeTimestamp(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "never";
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "just now";
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(mo / 12);
  return `${yr}y ago`;
}

/** Find the most-recent `last_synced_at` across a list, or null if empty. */
function mostRecentSync(entries: Array<{ last_synced_at?: string }>): string | null {
  const valid = entries
    .map((e) => (e.last_synced_at ? Date.parse(e.last_synced_at) : NaN))
    .filter((n) => !Number.isNaN(n));
  if (valid.length === 0) return null;
  return new Date(Math.max(...valid)).toISOString();
}

interface IdentityListTabProps {
  projectId: string;
  list: IdentityListName;
  entries: ProjectIdentityListEntry[];
  onIdentityChange: (next: ProjectIdentity) => void;
  onToast: (toast: ToastShape | null) => void;
}

/**
 * Validate a URL string via native `new URL()`. Returns the trimmed URL on
 * success, or throws with a human-readable message.
 */
function validateUrlOrThrow(raw: string, label = "URL"): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    // Throws TypeError on invalid URLs.
    new URL(trimmed);
    return trimmed;
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }
}

/**
 * Merge semantics per Dave: placeholder shows current value. Empty input =
 * no change (returns current). Non-empty = new value. Explicit null clear is
 * only reachable via the raw JSON editor, not this UI.
 */
function mergeField(
  nextRaw: string,
  current: string | null | undefined,
): string | null {
  const trimmed = nextRaw.trim();
  if (!trimmed) return (current ?? null) as string | null;
  return trimmed;
}

function IdentityListTab({
  projectId,
  list,
  entries,
  onIdentityChange,
  onToast,
}: IdentityListTabProps) {
  const [resyncing, setResyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localEntries, setLocalEntries] = useState<ProjectIdentityListEntry[]>(entries);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  // Transient invalid-preview state. While `sourceOpen && sourceInvalid` the
  // tab's main body (rows + counts) renders empty + warning banner. Reverts
  // to latest identity when the drawer closes (saved or cancelled).
  const [sourceInvalid, setSourceInvalid] = useState(false);

  // Keep localEntries in sync when parent identity refreshes.
  useEffect(() => {
    setLocalEntries(entries);
  }, [entries]);

  // When the slice drawer closes, reset its validation bit so the main view
  // returns to rendering from latest identity.
  useEffect(() => {
    if (!sourceOpen) setSourceInvalid(false);
  }, [sourceOpen]);

  const slicePath = `content_essentials.${list}`;

  const handleResync = async () => {
    if (resyncing) return;
    setError(null);
    try {
      setResyncing(true);
      const res = await resyncProjectIdentityList(projectId, list);
      setLocalEntries(res.data.entries);
      // Refresh the identity in the parent so the JSON tab + tab counters update.
      const refreshed = await fetchIdentity(projectId);
      if (refreshed.data) onIdentityChange(refreshed.data);
      showSuccessToast(
        `${list[0].toUpperCase() + list.slice(1)} re-synced`,
        `${res.data.refreshed_count} fresh, ${res.data.stale_count} stale.`,
      );
    } catch (err: unknown) {
      const msg = getErrorMessage(err) || "Re-sync failed";
      setError(msg);
      showErrorToast("Re-sync failed", msg);
    } finally {
      setResyncing(false);
    }
  };

  /** Patch the full slice via PATCH /identity/slice then refresh. */
  const commitSliceArray = async (nextEntries: ProjectIdentityListEntry[]) => {
    setSaving(true);
    setError(null);
    try {
      const res = await patchIdentitySlice(projectId, slicePath, nextEntries);
      onIdentityChange(res.data);
      const nextCE = (res.data.content_essentials || {}) as Record<string, unknown>;
      const rawList = nextCE[list];
      setLocalEntries(
        Array.isArray(rawList) ? (rawList as ProjectIdentityListEntry[]) : [],
      );
      onToast({ type: "success", text: `${list[0].toUpperCase() + list.slice(1)} updated.` });
    } catch (err: unknown) {
      const msg = getErrorMessage(err) || "Save failed";
      setError(msg);
      onToast({ type: "error", text: msg });
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleRowSave = async (
    idx: number,
    patch: Partial<ProjectIdentityListEntry> & { name: string },
  ) => {
    const current = localEntries[idx];
    const next: ProjectIdentityListEntry = {
      ...current,
      ...patch,
      last_synced_at: new Date().toISOString(),
    };
    const nextArr = [...localEntries];
    nextArr[idx] = next;
    await commitSliceArray(nextArr);
    setEditingIdx(null);
  };

  const handleRowRemove = async (idx: number) => {
    const nextArr = localEntries.filter((_, i) => i !== idx);
    await commitSliceArray(nextArr);
    setEditingIdx(null);
  };

  const handleAddNew = async (entry: ProjectIdentityListEntry) => {
    const nextArr = [...localEntries, entry];
    await commitSliceArray(nextArr);
    setAddingNew(false);
  };

  const handleSliceSave = async (value: unknown) => {
    if (!Array.isArray(value)) {
      throw new Error(`${list} slice must be a JSON array`);
    }
    await commitSliceArray(value as ProjectIdentityListEntry[]);
  };

  const headerSyncStamp = mostRecentSync(localEntries);
  const labelPlural = list === "doctors" ? "Doctors" : "Services";
  const labelSingular = list === "doctors" ? "doctor" : "service";

  // Transient invalid-preview rule: while the source drawer holds invalid
  // JSON, the main view hides all rows and shows a warning banner. The
  // drawer itself remains interactive.
  const showInvalidPreview = sourceOpen && sourceInvalid;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">
            URLs we're tracking on the practice site. Re-sync re-runs extraction
            against the cached scraped pages.
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            List last synced{" "}
            <span className="font-medium text-gray-600">
              {humanizeTimestamp(headerSyncStamp)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAddingNew(true)}
            disabled={addingNew || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add {labelSingular}
          </button>
          <button
            onClick={() => setSourceOpen(true)}
            disabled={saving}
            title="Edit the raw JSON slice"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FileJson className="h-3.5 w-3.5" /> Edit source
          </button>
          <button
            onClick={handleResync}
            disabled={resyncing || saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {resyncing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Re-syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" /> Re-sync
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showInvalidPreview ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">
            <div className="font-semibold">Source editor has invalid JSON</div>
            <div className="mt-0.5">
              The {labelSingular} list is hidden until the JSON editor holds
              valid JSON. Close the editor to revert to the last-saved state.
            </div>
          </div>
        </div>
      ) : (
        <>
          {addingNew && (
            <IdentityListAddRow
              labelSingular={labelSingular}
              existing={localEntries}
              saving={saving}
              onCancel={() => setAddingNew(false)}
              onSave={handleAddNew}
            />
          )}

          {localEntries.length === 0 && !addingNew ? (
            <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-500">
                Warmup didn't find any {list} on the site — add them manually
                with the button above, or use Re-sync to re-scan cached pages.
              </p>
            </div>
          ) : localEntries.length > 0 ? (
            <div className="rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-100">
              {localEntries.map((entry, idx) => (
                <IdentityListRow
                  key={`${entry.source_url || "local"}-${idx}`}
                  entry={entry}
                  labelSingular={labelSingular}
                  editing={editingIdx === idx}
                  saving={saving}
                  onStartEdit={() => setEditingIdx(idx)}
                  onCancelEdit={() => setEditingIdx(null)}
                  onSave={(patch) => handleRowSave(idx, patch)}
                  onRemove={() => handleRowRemove(idx)}
                />
              ))}
            </div>
          ) : null}
        </>
      )}

      <p className="text-[11px] text-gray-400 italic">
        {labelPlural} list — light-touch tracking. Full content is scraped at
        import time from the Posts tab.
      </p>

      <IdentitySliceEditor
        open={sourceOpen}
        title={`Edit ${labelPlural} Source`}
        slicePath={slicePath}
        initialValue={entries}
        onSave={handleSliceSave}
        onClose={() => setSourceOpen(false)}
        onValidationChange={(isValid) => setSourceInvalid(!isValid)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline row renderer + editor for doctors/services — T9
// ---------------------------------------------------------------------------

interface IdentityListRowProps {
  entry: ProjectIdentityListEntry;
  labelSingular: string;
  editing: boolean;
  saving: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (
    patch: Partial<ProjectIdentityListEntry> & { name: string },
  ) => Promise<void>;
  onRemove: () => void;
}

function IdentityListRow({
  entry,
  labelSingular,
  editing,
  saving,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRemove,
}: IdentityListRowProps) {
  if (editing) {
    return (
      <IdentityListRowEditor
        entry={entry}
        labelSingular={labelSingular}
        saving={saving}
        onCancel={onCancelEdit}
        onSave={onSave}
        onRemove={onRemove}
      />
    );
  }

  return (
    <div className="p-3 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 truncate">
            {entry.name}
          </span>
          {entry.stale && (
            <span
              title={`This ${labelSingular} was not found in the most recent re-sync. Verify it still exists on the site.`}
              className="inline-flex items-center gap-0.5 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
            >
              <AlertTriangle className="h-3 w-3" /> stale
            </span>
          )}
        </div>
        {entry.short_blurb && (
          <div className="text-xs text-gray-600 mt-1 line-clamp-2">
            {entry.short_blurb}
          </div>
        )}
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
          {entry.source_url ? (
            <a
              href={entry.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-alloro-orange hover:text-orange-600 truncate max-w-[260px]"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{entry.source_url}</span>
            </a>
          ) : (
            <span className="italic">No source URL</span>
          )}
          <span className="shrink-0">
            Last synced {humanizeTimestamp(entry.last_synced_at)}
          </span>
        </div>
      </div>
      <button
        onClick={onStartEdit}
        disabled={saving}
        title={`Edit ${labelSingular}`}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-alloro-orange px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50 shrink-0"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </button>
    </div>
  );
}

/** Shared editor UI — used for both "add new" and "edit existing" rows. */
interface RowEditorCommonProps {
  saving: boolean;
  onCancel: () => void;
}

function IdentityListRowEditor({
  entry,
  labelSingular,
  saving,
  onCancel,
  onSave,
  onRemove,
}: RowEditorCommonProps & {
  entry: ProjectIdentityListEntry;
  labelSingular: string;
  onSave: (
    patch: Partial<ProjectIdentityListEntry> & { name: string },
  ) => Promise<void>;
  onRemove: () => void;
}) {
  // In edit mode: empty input means "no change" (placeholder shows current).
  // In add mode: empty means empty. We're always in edit mode here.
  const [nameDraft, setNameDraft] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [blurbDraft, setBlurbDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async () => {
    setErr(null);
    // Name is required. If left blank, we keep the current value (merge rule).
    // But if the current value is also blank, reject.
    const mergedName = (nameDraft.trim() || entry.name || "").trim();
    if (!mergedName) {
      setErr("Name is required.");
      return;
    }
    let mergedUrl: string | null = entry.source_url ?? null;
    if (urlDraft.trim()) {
      try {
        mergedUrl = validateUrlOrThrow(urlDraft, "Source URL");
      } catch (e: unknown) {
        setErr(getErrorMessage(e));
        return;
      }
    }
    const mergedBlurb = mergeField(blurbDraft, entry.short_blurb);
    if (mergedBlurb && mergedBlurb.length > 400) {
      setErr("Blurb must be 400 characters or fewer.");
      return;
    }
    try {
      await onSave({
        name: mergedName,
        source_url: mergedUrl,
        short_blurb: mergedBlurb,
      });
    } catch {
      /* handled upstream */
    }
  };

  return (
    <div className="p-3 bg-alloro-orange/5 border-l-2 border-alloro-orange space-y-2">
      <div className="text-[11px] font-semibold text-alloro-orange uppercase tracking-wider">
        Editing {labelSingular}
      </div>
      <div className="grid grid-cols-1 gap-2">
        <label className="text-[11px] text-gray-500">
          Name <span className="text-red-500">*</span>
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder={entry.name || "e.g. Dr. John Smith"}
            className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
          />
        </label>
        <label className="text-[11px] text-gray-500">
          Source URL
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder={entry.source_url || "https://example.com/..."}
            className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
          />
        </label>
        <label className="text-[11px] text-gray-500">
          Blurb (≤ 400 chars)
          <textarea
            value={blurbDraft}
            onChange={(e) => setBlurbDraft(e.target.value)}
            placeholder={
              entry.short_blurb || `Short description of this ${labelSingular}`
            }
            rows={3}
            maxLength={400}
            className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
          />
        </label>
      </div>
      {err && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {err}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          onClick={onRemove}
          disabled={saving}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Inline "Add new entry" form. Empty fields create an entry with null URL/blurb. */
function IdentityListAddRow({
  labelSingular,
  existing,
  saving,
  onCancel,
  onSave,
}: RowEditorCommonProps & {
  labelSingular: string;
  existing: ProjectIdentityListEntry[];
  onSave: (entry: ProjectIdentityListEntry) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [blurb, setBlurb] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async () => {
    setErr(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErr("Name is required.");
      return;
    }
    // Simple duplicate check on name.
    if (existing.some((e) => e.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
      setErr(`A ${labelSingular} with that name already exists.`);
      return;
    }
    let validUrl: string | null = null;
    if (url.trim()) {
      try {
        validUrl = validateUrlOrThrow(url, "Source URL");
      } catch (e: unknown) {
        setErr(getErrorMessage(e));
        return;
      }
    }
    const trimmedBlurb = blurb.trim();
    if (trimmedBlurb.length > 400) {
      setErr("Blurb must be 400 characters or fewer.");
      return;
    }
    try {
      await onSave({
        name: trimmedName,
        source_url: validUrl,
        short_blurb: trimmedBlurb || null,
        last_synced_at: new Date().toISOString(),
      });
    } catch {
      /* handled upstream */
    }
  };

  return (
    <div className="rounded-lg border border-alloro-orange/40 bg-alloro-orange/5 p-3 space-y-2">
      <div className="text-[11px] font-semibold text-alloro-orange uppercase tracking-wider">
        Add {labelSingular}
      </div>
      <div className="grid grid-cols-1 gap-2">
        <label className="text-[11px] text-gray-500">
          Name <span className="text-red-500">*</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              labelSingular === "doctor" ? "e.g. Dr. John Smith" : "e.g. Invisalign"
            }
            className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
          />
        </label>
        <label className="text-[11px] text-gray-500">
          Source URL (optional)
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/..."
            className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
          />
        </label>
        <label className="text-[11px] text-gray-500">
          Blurb (optional, ≤ 400 chars)
          <textarea
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder={`Short description of this ${labelSingular}`}
            rows={3}
            maxLength={400}
            className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
          />
        </label>
      </div>
      {err && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {err}
        </div>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Adding
            </>
          ) : (
            "Add"
          )}
        </button>
      </div>
    </div>
  );
}

interface IdentityLocationsTabProps {
  projectId: string;
  identity: ProjectIdentity;
  locations: ProjectIdentityLocation[];
  onIdentityChange: (next: ProjectIdentity) => void;
}

function IdentityLocationsTab({
  projectId,
  identity,
  locations,
  onIdentityChange,
}: IdentityLocationsTabProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [busyPlaceId, setBusyPlaceId] = useState<string | null>(null);
  const [removingPlaceId, setRemovingPlaceId] = useState<string | null>(null);
  const [localLocations, setLocalLocations] = useState<ProjectIdentityLocation[]>(locations);
  const confirm = useConfirm();

  useEffect(() => {
    setLocalLocations(locations);
  }, [locations]);

  const refreshIdentity = async () => {
    try {
      const refreshed = await fetchIdentity(projectId);
      if (refreshed.data) onIdentityChange(refreshed.data);
    } catch {
      // Non-fatal; UI already updated locally from the per-action response.
    }
  };

  const handleSetPrimary = async (location: ProjectIdentityLocation) => {
    const locationKey = getIdentityLocationKey(location);
    const name = location.name || location.place_id || location.id || "location";
    const ok = await confirm({
      title: "Switch primary location?",
      message: `Setting "${name}" as primary changes the main business data the AI uses for every page. Regenerate affected pages after switching.`,
      confirmLabel: "Set as primary",
      cancelLabel: "Cancel",
      variant: "default",
    });
    if (!ok) return;
    try {
      setBusyPlaceId(locationKey);
      if (isManualIdentityLocation(location)) {
        const updatedLocations = localLocations.map((loc) => ({
          ...loc,
          is_primary: getIdentityLocationKey(loc) === locationKey,
        }));
        const nextIdentity: ProjectIdentity = {
          ...identity,
          business: buildBusinessFromLocation(location, identity.business),
          locations: updatedLocations,
          last_updated_at: new Date().toISOString(),
        };
        const res = await updateIdentity(projectId, nextIdentity);
        onIdentityChange(res.data);
        setLocalLocations(readIdentityLocations(res.data));
      } else if (location.place_id) {
        const res = await setPrimaryLocation(projectId, location.place_id);
        onIdentityChange(res.data.identity);
        const nextLocations: ProjectIdentityLocation[] = Array.isArray(
          res.data.identity.locations,
        )
          ? res.data.identity.locations
          : [];
        setLocalLocations(nextLocations);
      }
      showSuccessToast("Primary location updated", `"${name}" is now primary.`);
    } catch (err: unknown) {
      showErrorToast("Set primary failed", getErrorMessage(err) || "Unknown error");
    } finally {
      setBusyPlaceId(null);
    }
  };

  const handleResync = async (location: ProjectIdentityLocation) => {
    if (!location.place_id || isManualIdentityLocation(location)) return;
    const name = location.name || location.place_id;
    try {
      setBusyPlaceId(location.place_id);
      const res = await resyncProjectLocation(projectId, location.place_id);
      setLocalLocations(res.data.locations);
      await refreshIdentity();
      if (res.data.location.warmup_status === "ready") {
        showSuccessToast("Location re-synced", `"${name}" updated.`);
      } else {
        showErrorToast(
          "Location scrape failed",
          res.data.location.warmup_error || "Apify returned no data — try again later.",
        );
      }
    } catch (err: unknown) {
      showErrorToast("Re-sync failed", getErrorMessage(err) || "Unknown error");
    } finally {
      setBusyPlaceId(null);
    }
  };

  const handleRemove = async (location: ProjectIdentityLocation) => {
    const locationKey = getIdentityLocationKey(location);
    const name = location.name || location.place_id || location.id || "location";
    const ok = await confirm({
      title: "Remove this location?",
      message: `"${name}" will be removed from this project's locations list. The Google Business Profile itself is not deleted.`,
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (!ok) return;
    try {
      setRemovingPlaceId(locationKey);
      if (isManualIdentityLocation(location)) {
        const updatedLocations = localLocations.filter(
          (loc) => getIdentityLocationKey(loc) !== locationKey,
        );
        const nextIdentity: ProjectIdentity = {
          ...identity,
          locations: updatedLocations,
          last_updated_at: new Date().toISOString(),
        };
        const res = await updateIdentity(projectId, nextIdentity);
        onIdentityChange(res.data);
        setLocalLocations(readIdentityLocations(res.data));
      } else if (location.place_id) {
        const res = await removeProjectLocation(projectId, location.place_id);
        setLocalLocations(res.data.locations);
        await refreshIdentity();
      }
      showSuccessToast("Location removed", `"${name}" removed from project.`);
    } catch (err: unknown) {
      showErrorToast("Remove failed", getErrorMessage(err) || "Unknown error");
    } finally {
      setRemovingPlaceId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{localLocations.length}</span>{" "}
            location{localLocations.length === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Google-backed rows can be re-synced; manual rows stay editable identity data.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" /> Add Location
        </button>
      </div>

      {localLocations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-500">
            No locations yet. Use Add Location for a Google-backed row, or rerun identity with No GBP data.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-100">
          {localLocations.map((loc) => (
            <LocationRow
              key={getIdentityLocationKey(loc)}
              loc={loc}
              busy={busyPlaceId === getIdentityLocationKey(loc)}
              removing={removingPlaceId === getIdentityLocationKey(loc)}
              onSetPrimary={() => handleSetPrimary(loc)}
              onResync={() => handleResync(loc)}
              onRemove={() => handleRemove(loc)}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddLocationModal
          projectId={projectId}
          onClose={() => setShowAdd(false)}
          onAdded={(next) => {
            setLocalLocations(next);
            void refreshIdentity();
          }}
        />
      )}
    </div>
  );
}

function LocationRow({
  loc,
  busy,
  removing,
  onSetPrimary,
  onResync,
  onRemove,
}: {
  loc: ProjectIdentityLocation;
  busy: boolean;
  removing: boolean;
  onSetPrimary: () => void;
  onResync: () => void;
  onRemove: () => void;
}) {
  const isFailed = loc.warmup_status === "failed";
  const isManual = isManualIdentityLocation(loc);

  return (
    <div className="p-3 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 truncate">
            {loc.name || <span className="italic text-gray-400">Unnamed location</span>}
          </span>
          {loc.is_primary && (
            <span className="inline-flex items-center gap-0.5 rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
              <Star className="h-3 w-3" /> Primary
            </span>
          )}
          {isManual && (
            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
              Manual
            </span>
          )}
          {isFailed && (
            <span
              title={loc.warmup_error || "Last warmup attempt failed"}
              className="inline-flex items-center gap-0.5 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700"
            >
              Warmup failed
            </span>
          )}
        </div>
        <div className="text-xs text-gray-600 mt-1 space-y-0.5">
          {loc.address && <div>{loc.address}</div>}
          {loc.phone && <div className="text-gray-500">{loc.phone}</div>}
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
          {loc.rating != null && (
            <span className="shrink-0">
              {loc.rating}★ ({loc.review_count || 0})
            </span>
          )}
          {loc.place_id ? (
            <span className="shrink-0 font-mono truncate">{loc.place_id}</span>
          ) : (
            <span className="shrink-0 text-amber-600">No GBP yet</span>
          )}
          <span className="shrink-0">
            Last synced {humanizeTimestamp(loc.last_synced_at)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {!loc.is_primary && (
          <button
            onClick={onSetPrimary}
            disabled={busy || removing}
            className="text-[11px] font-medium text-gray-600 hover:text-alloro-orange px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Set as primary
          </button>
        )}
        {!isManual && (
          <button
            onClick={onResync}
            disabled={busy || removing}
            title="Re-scrape this location's GBP"
            className="inline-flex items-center text-[11px] font-medium text-gray-600 hover:text-alloro-orange px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        <button
          onClick={onRemove}
          disabled={loc.is_primary || busy || removing}
          title={
            loc.is_primary
              ? "Cannot remove the primary location. Set another location as primary first."
              : "Remove this location"
          }
          className="inline-flex items-center p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
        >
          {removing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
