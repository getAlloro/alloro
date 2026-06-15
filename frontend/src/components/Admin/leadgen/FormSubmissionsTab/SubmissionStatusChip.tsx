import type { FormSubmission } from "../../../../api/websites";

export default function SubmissionStatusChip({ submission }: { submission: FormSubmission }) {
  if (submission.is_flagged) {
    return (
      <span
        className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700"
        title={submission.flag_reason || "Flagged by AI; email was held"}
      >
        flagged
      </span>
    );
  }

  if (!submission.is_read) {
    return (
      <span
        className="rounded-full bg-alloro-orange/10 px-2 py-0.5 text-[11px] font-medium text-alloro-orange"
        title="Unread submission"
      >
        new
      </span>
    );
  }

  return (
    <span
      className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500"
      title="Read submission"
    >
      read
    </span>
  );
}
