import { Link2 } from "lucide-react";
import type { SubmissionSummary } from "../../../types/leadgen";
import {
  STAGE_CLASSES,
  getAssociationLabel,
  getStageDisplay,
  hasPersistedAccountLink,
  isPersistedConversion,
} from "./leadgenSubmissionDisplay.utils";

export type LeadgenSubmissionStageCellProps = {
  submission: SubmissionSummary;
};

export function LeadgenSubmissionStageCell({
  submission,
}: LeadgenSubmissionStageCellProps) {
  const stage = getStageDisplay(submission);
  const associationLabel = getAssociationLabel(submission.linked_via);
  const isAccountLinked = hasPersistedAccountLink(submission);
  const isConverted = isPersistedConversion(submission);

  return (
    <td className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STAGE_CLASSES[stage.tone]}`}
        >
          {stage.label}
        </span>
        {submission.abandoned && (
          <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            Abandoned
          </span>
        )}
        {isAccountLinked && (
          <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            Account linked
          </span>
        )}
        {isConverted && (
          <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            Converted
          </span>
        )}
        {associationLabel && (
          <span
            className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600"
            title="Association hint only; not a persisted account link or conversion."
          >
            <Link2 className="h-2.5 w-2.5" />
            {associationLabel}
          </span>
        )}
      </div>
    </td>
  );
}
