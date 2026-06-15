import type { EditChatHistory } from "../../api/websites";
import type { ChatMessage } from "../../components/PageEditor/ChatPanel";

/**
 * Inject "Rebuilding section…" overlay + pulse/gray styling into the assembled
 * page HTML for every section whose name is in `regeneratingNames`. We mutate
 * the HTML string (not the iframe DOM) so the effect survives the srcDoc
 * re-render cycle triggered by live-preview polling.
 *
 * Sections are pre-tagged by `renderPage` with `data-alloro-section="{name}"`
 * on their root element (see utils/templateRenderer.ts). We locate each match
 * via a permissive regex, append the pulse classes to the existing class
 * attribute, wrap the body in a relatively-positioned container via CSS, and
 * prepend an absolutely-positioned overlay pill.
 *
 * Kept deliberately lightweight — no DOMParser, no cheerio, no iframe-side
 * mutation. Idempotent: passing the same name twice will add classes twice
 * but the pill is keyed by a marker attribute so only one is injected.
 */
export function injectRegenerateOverlays(html: string, regeneratingNames: Set<string>): string {
  if (regeneratingNames.size === 0) return html;

  let out = html;
  for (const name of regeneratingNames) {
    // Escape the name for use inside the double-quoted attribute and regex.
    const escapedAttr = name.replace(/"/g, '\\"');
    const escapedRegex = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Match the opening tag carrying data-alloro-section="{name}".
    // Captures: (1) tag prefix up to class attr or end-of-tag, (2) existing
    // class value if any. We only need to handle the common case of a class
    // attribute already being present — renderPage-tagged sections universally
    // carry Tailwind classes.
    const openTagRe = new RegExp(
      `(<\\w+\\b[^>]*\\bdata-alloro-section="${escapedRegex}"[^>]*)>`,
      "i",
    );
    const match = out.match(openTagRe);
    if (!match) continue;

    const fullOpenTag = match[0];
    const openTagWithoutClose = match[1];

    // Inject the pulse classes into the existing class attribute, or add one.
    const pulseClasses = "alloro-regenerating opacity-50 animate-pulse pointer-events-none relative";
    let newOpenTag: string;
    if (/\bclass="([^"]*)"/i.test(openTagWithoutClose)) {
      newOpenTag = openTagWithoutClose.replace(
        /\bclass="([^"]*)"/i,
        (_full, existing) => `class="${existing} ${pulseClasses}"`,
      );
    } else if (/\bclass='([^']*)'/i.test(openTagWithoutClose)) {
      newOpenTag = openTagWithoutClose.replace(
        /\bclass='([^']*)'/i,
        (_full, existing) => `class='${existing} ${pulseClasses}'`,
      );
    } else {
      newOpenTag = `${openTagWithoutClose} class="${pulseClasses}"`;
    }

    // Build the overlay pill — inline-styled so it doesn't rely on Tailwind
    // classes that may or may not be bundled in the preview iframe.
    const overlayHtml = `<div data-alloro-regen-overlay="${escapedAttr}" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:50;pointer-events:none;"><div style="display:inline-flex;align-items:center;gap:8px;background:#212D40;color:#fff;padding:10px 16px;border-radius:9999px;box-shadow:0 10px 25px rgba(0,0,0,0.25);font-size:14px;font-weight:600;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:alloro-regen-spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Rebuilding section…</div></div>`;

    const replacement = `${newOpenTag}>${overlayHtml}`;
    out = out.replace(fullOpenTag, replacement);
  }

  // Inject the keyframes for the spinner exactly once. The preview iframe
  // already carries Tailwind for animate-pulse, so we only need the spin.
  if (out.includes("data-alloro-regen-overlay") && !out.includes("data-alloro-regen-keyframes")) {
    const styleTag = `<style data-alloro-regen-keyframes>@keyframes alloro-regen-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>`;
    if (/<\/head>/i.test(out)) {
      out = out.replace(/<\/head>/i, `${styleTag}</head>`);
    } else {
      out = styleTag + out;
    }
  }

  return out;
}

export const MAX_CHAT_MESSAGES_PER_COMPONENT = 50;

/**
 * Code-view (Monaco) edits fire onChange per keystroke; snapshots within this
 * window coalesce into a single undo entry so the stack stays usable.
 */
export const CODE_EDIT_UNDO_COALESCE_MS = 2500;

// The desktop preview renders at a fixed true-desktop viewport width (so it
// shows the real lg:/xl: sizes a visitor sees) and scales to fit the pane —
// the editor pane is usually narrower than a real desktop.
export const DESKTOP_PREVIEW_WIDTH = 1280;

export function chatMapToObject(map: Map<string, ChatMessage[]>): EditChatHistory {
  const obj: EditChatHistory = {};
  for (const [key, messages] of map) {
    obj[key] = messages.slice(-MAX_CHAT_MESSAGES_PER_COMPONENT);
  }
  return obj;
}

export function objectToChatMap(obj: EditChatHistory | null): Map<string, ChatMessage[]> {
  const map = new Map<string, ChatMessage[]>();
  if (!obj) return map;
  for (const [key, messages] of Object.entries(obj)) {
    if (Array.isArray(messages)) {
      map.set(key, messages);
    }
  }
  return map;
}
