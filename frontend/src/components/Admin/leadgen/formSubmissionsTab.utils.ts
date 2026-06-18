/**
 * Pure helpers for FormSubmissionsTab.
 *
 * No React, no hooks — moved verbatim out of FormSubmissionsTab.tsx so the
 * component stays under the file-size budget. Behavior unchanged.
 */

import type {
  FileValue,
  FormContents,
  FormSection,
} from "../../../api/websites";

export function isFileValue(value: unknown): value is FileValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "s3Key" in value &&
    "name" in value
  );
}

export function isSectionsFormat(
  contents: FormContents,
): contents is FormSection[] {
  return Array.isArray(contents);
}

/** Extract preview text from either format */
export function previewFields(contents: FormContents): string {
  if (isSectionsFormat(contents)) {
    // Grab first 2 text fields from first section
    const textFields: string[] = [];
    for (const section of contents) {
      for (const [k, v] of section.fields) {
        if (typeof v === "string" && v.trim()) {
          textFields.push(`${k}: ${v}`);
          if (textFields.length >= 2) break;
        }
      }
      if (textFields.length >= 2) break;
    }
    return textFields.join(" · ");
  }
  // Legacy flat format
  const textEntries = Object.entries(contents).filter(
    ([, v]) => typeof v === "string",
  ) as [string, string][];
  return textEntries.slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" · ");
}

/** Check if contents has any file values that need pre-signed URLs */
export const hasFiles = (contents: FormContents): boolean => {
  if (isSectionsFormat(contents)) {
    return contents.some((s) => s.fields.some(([, v]) => isFileValue(v)));
  }
  return Object.values(contents).some(isFileValue);
};

export const relativeTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
};
