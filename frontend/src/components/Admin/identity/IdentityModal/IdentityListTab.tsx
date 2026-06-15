import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Pencil,
  FileJson,
} from "lucide-react";
import {
  fetchIdentity,
  patchIdentitySlice,
  type ProjectIdentity,
  type ProjectIdentityListEntry,
  type IdentityListName,
  resyncProjectIdentityList,
} from "../../../../api/websites";
import IdentitySliceEditor from "../IdentitySliceEditor";
import { showSuccessToast, showErrorToast } from "../../../../lib/toast";
import { getErrorMessage } from "../../../../lib/errorMessage";
import type { ToastShape } from "../identityModal.types";
import {
  humanizeTimestamp,
  mostRecentSync,
  validateUrlOrThrow,
  mergeField,
} from "../identityModal.utils";

interface IdentityListTabProps {
  projectId: string;
  list: IdentityListName;
  entries: ProjectIdentityListEntry[];
  onIdentityChange: (next: ProjectIdentity) => void;
  onToast: (toast: ToastShape | null) => void;
}

export function IdentityListTab({
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
