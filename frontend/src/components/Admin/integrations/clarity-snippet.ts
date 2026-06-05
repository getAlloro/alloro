// Admin-side mirror of the backend src/controllers/admin-websites/feature-utils/
// util.clarity-snippet.ts (the source of truth) plus the renderer's tag template
// (website-builder-rebuild/src/routes/site.ts). Used to show the derived tag and
// to extract a Project ID from a pasted snippet. The tag is NEVER stored — the
// renderer regenerates it from the Project ID.

const PROJECT_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

/**
 * Builds the canonical Microsoft Clarity bootstrap for a Project ID — byte-for-byte
 * what the renderer injects.
 */
export function deriveClarityTag(projectId: string): string {
  const id = projectId.trim();
  return `<script type="text/javascript">(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "${id}");</script>`;
}

/** Extracts a Clarity Project ID from a pasted tag/snippet, or null. */
export function extractClarityProjectId(code: string): string | null {
  const directTagMatch = code.match(/clarity\.ms\/tag\/([A-Za-z0-9_-]+)/i);
  if (directTagMatch?.[1]) return directTagMatch[1];

  const concatenatedTagMatch = code.match(
    /clarity\.ms\/tag\/["']?\s*\+\s*["']([A-Za-z0-9_-]+)["']/i,
  );
  if (concatenatedTagMatch?.[1]) return concatenatedTagMatch[1];

  const iifeArgumentMatch = code.match(
    /["']clarity["']\s*,\s*["']script["']\s*,\s*["']([A-Za-z0-9_-]+)["']/i,
  );
  return iifeArgumentMatch?.[1] ?? null;
}

/** True when the input looks like a pasted snippet rather than a bare Project ID. */
export function looksLikeClaritySnippet(value: string): boolean {
  return /clarity\.ms\/tag|["']clarity["']\s*,\s*["']script["']|<script/i.test(value);
}

/** Validates the Project ID format (matches the backend sanitizer). */
export function isValidClarityProjectId(value: string): boolean {
  return PROJECT_ID_RE.test(value.trim());
}
