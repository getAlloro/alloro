import {
  Plus,
  Trash2,
  Loader2,
  Search,
  MapPin,
  Sparkles,
  Globe,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import type {
  BlockCheckResult,
  ScrapeStrategy,
  ManualBusinessInput,
  ManualLocationInput,
} from "../../../../api/websites";
import type { PlaceSuggestion } from "../../../../api/places";
import ColorPicker from "../../page-pipeline/ColorPicker";
import type {
  UrlInput,
  TextInput,
  WarmupSourceMode,
} from "../identityModal.types";
import { MANUAL_HOUR_DAYS } from "../identityModal.utils";

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

export function EmptyWarmupForm(props: EmptyFormProps) {
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
