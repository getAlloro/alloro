export const NEWSLETTER_FORM_NAME = "Newsletter Signup";

export function normalizeFormDisplayName(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeFormKey(formName: unknown): string {
  const normalized = normalizeFormDisplayName(formName).toLowerCase();
  const key = normalized
    .replace(/&amp;/g, "and")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return key || "form";
}
