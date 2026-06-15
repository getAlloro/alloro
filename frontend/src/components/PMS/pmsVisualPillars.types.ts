/**
 * Shared types for PMSVisualPillars and its extracted sub-components.
 */

export interface PMSVisualPillarsProps {
  domain?: string;
  organizationId?: number | null;
  locationId?: number | null;
  locationName?: string | null;
  hasProperties?: boolean;
}
