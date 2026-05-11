import { CheckCircle2 } from "lucide-react";

export type FormRecipientDefaultPreviewProps = {
  recipients: string[];
};

export function FormRecipientDefaultPreview({
  recipients,
}: FormRecipientDefaultPreviewProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 text-alloro-orange" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            This form uses default recipients.
          </p>
          {recipients.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
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
            <p className="mt-2 text-sm text-amber-700">
              No default recipients are configured yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
