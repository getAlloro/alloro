import { useState } from "react";
import { X, Loader2, MapPin } from "lucide-react";
import GbpSearchPicker, { type SelectedPlace } from "./GbpSearchPicker";
import { addProjectLocation, type ProjectIdentityLocation } from "../../api/websites";
import { showSuccessToast, showErrorToast } from "../../lib/toast";
import { getErrorMessage } from "../../lib/errorMessage";

/**
 * AddLocationModal — small wrapper around GbpSearchPicker that calls
 * `addProjectLocation` and returns the updated locations array to its parent.
 *
 * Used by IdentityModal's Locations tab (T7 + F3).
 */

interface AddLocationModalProps {
  projectId: string;
  onClose: () => void;
  onAdded: (locations: ProjectIdentityLocation[]) => void;
}

export default function AddLocationModal({
  projectId,
  onClose,
  onAdded,
}: AddLocationModalProps) {
  const [selected, setSelected] = useState<SelectedPlace | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!selected || submitting) return;
    setError(null);
    try {
      setSubmitting(true);
      const res = await addProjectLocation(projectId, selected.placeId);
      onAdded(res.data.locations);
      showSuccessToast(
        "Location added",
        res.data.added.warmup_status === "ready"
          ? `${res.data.added.name || selected.name} scraped successfully.`
          : "Location attached, but the GBP scrape failed — re-sync from the row.",
      );
      onClose();
    } catch (err: unknown) {
      const msg = getErrorMessage(err) || "Failed to add location";
      setError(msg);
      showErrorToast("Add location failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!submitting ? onClose : undefined}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-alloro-orange" />
              <h2 className="text-lg font-bold text-gray-900">Add Location</h2>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            <p className="text-xs text-gray-500">
              Search Google Business Profile and pick the location. We'll scrape it
              now and add it to this project's locations list.
            </p>

            <GbpSearchPicker
              value={selected}
              onChange={setSelected}
              label="Google Business Profile"
              placeholder="Search for a location..."
            />

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!selected || submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Adding...
                </>
              ) : (
                "Add Location"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
