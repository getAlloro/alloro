/**
 * useLabels — returns the org-type-aware display label map (Code Constitution
 * §13.3, §15.2). Reads the active org type from the auth context and resolves
 * the vocabulary; defaults to the healthcare set when no type is set.
 *
 * Usage: `const labels = useLabels();` then `labels.hubHome`, `labels.customers`.
 */

import { useAuth } from "./useAuth";
import { ORG_LABELS, resolveOrgType, type OrgLabels } from "../constants/orgLabels";

export function useLabels(): OrgLabels {
  const { userProfile } = useAuth();
  return ORG_LABELS[resolveOrgType(userProfile?.organizationType)];
}
