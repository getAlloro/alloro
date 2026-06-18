import type { FinalStage } from "../../../../types/leadgen";
import {
  STAGE_LABEL,
  STAGE_TONE,
  STAGE_CLASSES,
} from "../LeadgenSubmissionsTable";

export default function StagePillInline({ stage }: { stage: FinalStage }) {
  const tone = STAGE_TONE[stage] ?? "gray";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STAGE_CLASSES[tone]}`}
    >
      {STAGE_LABEL[stage] ?? stage}
    </span>
  );
}
