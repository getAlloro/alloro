export function EditorErrorBanner({
  editError,
  onDismiss,
}: {
  editError: string;
  onDismiss: () => void;
}) {
  return (
    <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between">
      <span className="text-xs text-red-600">{editError}</span>
      <button
        onClick={onDismiss}
        className="text-xs text-red-400 hover:text-red-600"
      >
        Dismiss
      </button>
    </div>
  );
}
