export default function RecipientsSummary({
  recipients,
  title = "Saved recipients",
  emptyMessage = "No recipients were saved.",
}: {
  recipients: string[];
  title?: string;
  emptyMessage?: string;
}) {
  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-500">{title}</p>
      {recipients.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {recipients.map((email) => (
            <span
              key={email}
              className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200"
            >
              {email}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-red-600">{emptyMessage}</p>
      )}
    </div>
  );
}
