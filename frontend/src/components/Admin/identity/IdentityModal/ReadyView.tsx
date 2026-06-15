import type React from "react";
import { useState, useEffect } from "react";
import {
  Loader2,
  Code,
  Layout,
  MapPin,
  Stethoscope,
  Briefcase,
  AlertTriangle,
  RefreshCw,
  Image as ImageIcon,
} from "lucide-react";
import type {
  ProjectIdentity,
  ProjectIdentityListEntry,
  ProjectIdentityLocation,
} from "../../../../api/websites";
import ColorPicker from "../../page-pipeline/ColorPicker";
import GradientPicker from "../../page-pipeline/GradientPicker";
import type { GradientValue } from "../../page-pipeline/GradientPicker";
import IdentityImagesTab from "../IdentityImagesTab";
import MonacoJsonEditor from "../../MonacoJsonEditor";
import { getErrorMessage } from "../../../../lib/errorMessage";
import type { IdentityTab, ToastShape, DayName } from "../identityModal.types";
import { normalizeHours } from "../identityModal.utils";
import { IdentityListTab } from "./IdentityListTab";
import { IdentityLocationsTab } from "./IdentityLocationsTab";

// ---------------------------------------------------------------------------
// ReadyView — tabs: summary, json, doctors, services, locations, images
// ---------------------------------------------------------------------------

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

export function ReadyView(props: ReadyViewProps) {
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
