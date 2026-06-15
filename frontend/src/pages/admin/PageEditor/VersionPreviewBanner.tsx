import type { PageVersion } from "../../../components/PageEditor/VersionHistoryTab";

export function VersionPreviewBanner({
  previewVersion,
  onRestoreVersion,
  onExitPreview,
}: {
  previewVersion: PageVersion;
  onRestoreVersion: (versionId: string) => void;
  onExitPreview: () => void;
}) {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
      <span className="text-xs text-amber-700 font-medium">
        Previewing v{previewVersion.version} — editing is disabled
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onRestoreVersion(previewVersion.id)}
          className="text-xs px-2.5 py-1 rounded-md bg-alloro-orange text-white hover:bg-alloro-orange/90 transition-colors"
        >
          Restore this version
        </button>
        <button
          onClick={onExitPreview}
          className="text-xs px-2.5 py-1 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
        >
          Exit preview
        </button>
      </div>
    </div>
  );
}
