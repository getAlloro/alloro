/**
 * User Website CSV Utilities
 *
 * Pure helpers for serializing form submissions to CSV. No I/O, no req/res —
 * data in, string out. Extracted from UserWebsiteController.exportFormSubmissions
 * to keep the controller thin.
 */

import type { IFormSubmission } from "../../../models/website-builder/FormSubmissionModel";

/**
 * Escape a single CSV cell. Wraps the value in quotes when it contains a
 * comma, quote, or newline, doubling any embedded quotes (RFC 4180).
 */
export function escCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/**
 * Build the full CSV document for a set of form submissions.
 *
 * Columns: Date, Form Name, <union of all submission field keys, sorted>, Read.
 * Matches the original inline implementation byte-for-byte (ISO date, "Yes"/"No"
 * read flag, empty string for missing fields).
 */
export function buildSubmissionsCsv(submissions: IFormSubmission[]): string {
  // Collect all unique field keys across all submissions
  const allKeys = new Set<string>();
  for (const sub of submissions) {
    if (sub.contents && typeof sub.contents === "object") {
      for (const key of Object.keys(sub.contents)) {
        allKeys.add(key);
      }
    }
  }
  const fieldKeys = Array.from(allKeys).sort();

  const headers = ["Date", "Form Name", ...fieldKeys, "Read"];
  const rows = submissions.map((sub) => {
    const date = new Date(sub.submitted_at).toISOString();
    const formName = sub.form_name || "";
    const fields = fieldKeys.map(
      (k) => (sub.contents as Record<string, string>)?.[k] || ""
    );
    const isRead = sub.is_read ? "Yes" : "No";
    return [date, formName, ...fields, isRead].map(escCsv).join(",");
  });

  return [headers.map(escCsv).join(","), ...rows].join("\n");
}
