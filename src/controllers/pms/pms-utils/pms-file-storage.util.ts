import { v4 as uuidv4 } from "uuid";

export function buildPmsFileS3Key(
  organizationId: number | null,
  locationId: number | null,
  filename: string
): string {
  const orgSegment = organizationId ? String(organizationId) : "unknown-org";
  const locationSegment = locationId ? String(locationId) : "unknown-location";
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uniqueId = uuidv4().slice(0, 8);

  return `uploads/pms-files/${orgSegment}/${locationSegment}/${uniqueId}-${sanitized}`;
}
