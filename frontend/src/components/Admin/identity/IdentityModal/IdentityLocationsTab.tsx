import { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, Star, RefreshCw } from "lucide-react";
import {
  fetchIdentity,
  updateIdentity,
  type ProjectIdentity,
  type ProjectIdentityLocation,
  setPrimaryLocation,
  removeProjectLocation,
  resyncProjectLocation,
} from "../../../../api/websites";
import AddLocationModal from "../../org/AddLocationModal";
import { useConfirm } from "../../../ui/ConfirmModal";
import { showSuccessToast, showErrorToast } from "../../../../lib/toast";
import { getErrorMessage } from "../../../../lib/errorMessage";
import {
  isManualIdentityLocation,
  getIdentityLocationKey,
  buildBusinessFromLocation,
  readIdentityLocations,
  humanizeTimestamp,
} from "../identityModal.utils";

interface IdentityLocationsTabProps {
  projectId: string;
  identity: ProjectIdentity;
  locations: ProjectIdentityLocation[];
  onIdentityChange: (next: ProjectIdentity) => void;
}

export function IdentityLocationsTab({
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
