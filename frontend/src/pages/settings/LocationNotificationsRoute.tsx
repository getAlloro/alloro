/**
 * Card H — Per-Location Notification Routing settings page.
 *
 * Mounted at /settings/locations/:locationId/notifications. Reads the
 * three notification_type rows for a location, lets the practice admin
 * edit comma-separated email lists per type, and ships a bulk-config
 * affordance to copy a routing setup from another location.
 *
 * All customer-visible strings are imported from
 * src/services/notifications/locationRouterStrings on the backend (the
 * approved string set), mirrored here for type-safety. The strings test
 * (tests/notifications/cardHStrings.test.ts) gates them on Voice
 * Constraints — if any flag, the build halts before this page ships.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet, apiPost, apiPut } from "@/api/index";

const STRINGS = {
  warning_no_per_location_config:
    "No location-specific routing configured. Notifications routed to practice global list. Configure routing in Settings, Locations, this location, Notifications.",
  page_title: "Notification Routing",
  section_form_submission: "Form submissions",
  section_referral_received: "Referral notifications",
  section_review_alert: "Review alerts",
  helper_text:
    "Email addresses below receive notifications for this location. Add multiple addresses separated by commas. The practice global list still receives notifications until a location-specific list is configured here.",
  bulk_copy_label: "Copy routing from another location",
  save_button: "Save",
  saved_confirmation: "Saved.",
  empty_state:
    "No addresses configured yet. Add one or more addresses below to route this notification type to this location's inbox.",
};

type NotificationType = "form_submission" | "referral_received" | "review_alert";

interface ConfigRow {
  location_id: number;
  notification_type: NotificationType;
  email_addresses: string[];
}

interface PageData {
  location: { id: number; name: string; organization_id: number };
  location_term: string;
  config: ConfigRow[];
}

const SECTION_LABELS: Record<NotificationType, string> = {
  form_submission: STRINGS.section_form_submission,
  referral_received: STRINGS.section_referral_received,
  review_alert: STRINGS.section_review_alert,
};

export default function LocationNotificationsRoute() {
  const { locationId } = useParams<{ locationId: string }>();
  const [data, setData] = useState<PageData | null>(null);
  const [edits, setEdits] = useState<Record<NotificationType, string>>({
    form_submission: "",
    referral_received: "",
    review_alert: "",
  });
  const [savedAt, setSavedAt] = useState<NotificationType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) return;
    let active = true;
    apiGet({ path: `/api/admin/locations/${locationId}/notifications` })
      .then((r: any) => {
        if (!active) return;
        if (r?.success === false) {
          setError("Could not load notification routing.");
          return;
        }
        setData(r as PageData);
        const next: Record<NotificationType, string> = {
          form_submission: "",
          referral_received: "",
          review_alert: "",
        };
        for (const row of r.config) {
          next[row.notification_type as NotificationType] = row.email_addresses.join(", ");
        }
        setEdits(next);
      })
      .catch(() => active && setError("Could not load notification routing."));
    return () => {
      active = false;
    };
  }, [locationId]);

  async function save(notificationType: NotificationType): Promise<void> {
    if (!locationId) return;
    const value = edits[notificationType] || "";
    const emails = value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    try {
      await apiPut({
        path: `/api/admin/locations/${locationId}/notifications/${notificationType}`,
        passedData: { email_addresses: emails },
      });
      setSavedAt(notificationType);
      setTimeout(() => setSavedAt(null), 2500);
    } catch {
      setError("Save failed. Try again in a moment.");
    }
  }

  async function copyFrom(sourceLocationId: number): Promise<void> {
    if (!locationId) return;
    try {
      const r: any = await apiPost({
        path: `/api/admin/locations/${locationId}/notifications/copy`,
        passedData: { source_location_id: sourceLocationId },
      });
      if (r?.success && r.config) {
        const next: Record<NotificationType, string> = {
          form_submission: "",
          referral_received: "",
          review_alert: "",
        };
        for (const row of r.config) {
          next[row.notification_type as NotificationType] = row.email_addresses.join(", ");
        }
        setEdits(next);
      }
    } catch {
      setError("Copy failed.");
    }
  }

  if (error) {
    return <div className="text-sm text-gray-500">{error}</div>;
  }
  if (!data) {
    return <div className="text-xs text-gray-400">Loading routing for this {data?.["location_term"] ?? "location"}.</div>;
  }

  const locationLabel = data.location_term ?? "location";

  const allEmpty = data.config.every((r) => r.email_addresses.length === 0);

  return (
    <div className="space-y-6 max-w-[800px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#1A1D23]">
          {STRINGS.page_title}
        </h1>
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">
          {locationLabel}: {data.location.name}
        </p>
      </div>

      {allEmpty ? (
        <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5 text-sm text-[#1A1D23]/60">
          {STRINGS.warning_no_per_location_config}
        </div>
      ) : null}

      <p className="text-sm text-gray-500">{STRINGS.helper_text}</p>

      <div className="space-y-4">
        {(Object.keys(SECTION_LABELS) as NotificationType[]).map((nt) => (
          <section
            key={nt}
            className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5 space-y-3"
          >
            <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
              {SECTION_LABELS[nt]}
            </div>
            {edits[nt].length === 0 ? (
              <p className="text-sm text-gray-500">{STRINGS.empty_state}</p>
            ) : null}
            <textarea
              className="w-full rounded-xl border border-stone-200/60 bg-white px-3 py-2 text-sm text-[#1A1D23] focus:outline-none focus:border-[#D56753]"
              rows={2}
              value={edits[nt]}
              onChange={(e) =>
                setEdits((prev) => ({ ...prev, [nt]: e.target.value }))
              }
              placeholder="email1@office.com, email2@office.com"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => save(nt)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D56753] text-white text-sm font-medium hover:brightness-105 transition-all"
              >
                {STRINGS.save_button}
              </button>
              {savedAt === nt ? (
                <span className="text-xs text-emerald-500 font-semibold uppercase tracking-wider">
                  {STRINGS.saved_confirmation}
                </span>
              ) : null}
            </div>
          </section>
        ))}
      </div>

      <BulkCopyAffordance
        organizationId={data.location.organization_id}
        currentLocationId={data.location.id}
        onCopied={copyFrom}
      />
    </div>
  );
}

interface LocationOption {
  id: number;
  name: string;
}

function BulkCopyAffordance({
  organizationId,
  currentLocationId,
  onCopied,
}: {
  organizationId: number;
  currentLocationId: number;
  onCopied: (sourceLocationId: number) => void | Promise<void>;
}) {
  const [otherLocations, setOtherLocations] = useState<LocationOption[]>([]);
  const [selected, setSelected] = useState<number | "">("");

  useEffect(() => {
    let active = true;
    apiGet({ path: `/api/admin/organizations/${organizationId}/locations` })
      .then((r: any) => {
        if (!active) return;
        if (r?.success && Array.isArray(r.locations)) {
          setOtherLocations(r.locations.filter((l: LocationOption) => l.id !== currentLocationId));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [organizationId, currentLocationId]);

  if (otherLocations.length === 0) return null;

  return (
    <div className="rounded-2xl bg-[#F0EDE8] border border-stone-200/60 p-5 space-y-3">
      <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
        {STRINGS.bulk_copy_label}
      </div>
      <div className="flex items-center gap-3">
        <select
          value={selected}
          onChange={(e) =>
            setSelected(e.target.value ? Number(e.target.value) : "")
          }
          className="rounded-xl border border-stone-200/60 bg-white px-3 py-2 text-sm text-[#1A1D23]"
        >
          <option value="">Choose a source...</option>
          {otherLocations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button
          disabled={!selected}
          onClick={() => selected !== "" && onCopied(selected)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D56753] text-white text-sm font-medium hover:brightness-105 transition-all disabled:opacity-50"
        >
          Copy
        </button>
      </div>
    </div>
  );
}
