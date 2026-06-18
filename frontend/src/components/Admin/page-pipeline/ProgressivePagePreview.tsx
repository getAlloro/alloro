import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  fetchPageProgressiveState,
  type PageProgressiveState,
} from "../../../api/websites";
import { renderPage } from "../../../utils/templateRenderer";
import { prepareHtmlForPreview } from "../../../hooks/useIframeSelector";
import { getErrorMessage } from "../../../lib/errorMessage";

interface ProgressivePagePreviewProps {
  projectId: string;
  pageId: string;
  /** Poll interval in ms while generation is active. Default 2000. */
  pollMs?: number;
  /** Called once the page flips to `ready`. */
  onReady?: () => void;
}

/**
 * Renders the page as it's being built.
 *
 * Two-phase rendering:
 *   1. FIRST tick  — build the full srcDoc (wrapper + header + template
 *      scaffold + footer) and hand it to the iframe. Browser renders it.
 *   2. SUBSEQUENT ticks — do NOT touch srcDoc. Reach into the iframe's live
 *      contentDocument and swap each newly-completed section's children in
 *      place via a DocumentFragment. Scroll position stays put.
 *
 * A `data-alloro-is-current` attribute on the section currently being
 * built drives the animated "Building…" label + shimmer; other pending
 * sections stay dimmed with no label.
 */
export default function ProgressivePagePreview({
  projectId,
  pageId,
  pollMs = 2000,
  onReady,
}: ProgressivePagePreviewProps) {
  const [state, setState] = useState<PageProgressiveState | null>(null);
  const [initialSrcDoc, setInitialSrcDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const firstLoadDoneRef = useRef(false);
  const lastGeneratedNamesRef = useRef<Set<string>>(new Set());
  const readyNotifiedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetchPageProgressiveState(projectId, pageId);
        if (cancelled) return;
        setState(res.data);

        if (
          res.data.generation_status === "ready" &&
          !readyNotifiedRef.current
        ) {
          readyNotifiedRef.current = true;
          onReady?.();
        }

        if (
          res.data.generation_status !== "ready" &&
          res.data.generation_status !== "failed"
        ) {
          timer = setTimeout(tick, pollMs);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setError(getErrorMessage(err) || "Failed to load page state");
        timer = setTimeout(tick, pollMs * 2);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, pageId, pollMs, onReady]);

  // Built ONCE from the first state snapshot that has wrapper + template.
  // Stored in state so the value persists across renders; subsequent poll
  // ticks mutate the iframe DOM in place instead of rebuilding srcDoc.
  useEffect(() => {
    if (firstLoadDoneRef.current) return;
    if (!state) return;
    if (
      !state.template_sections ||
      state.template_sections.length === 0 ||
      !state.wrapper
    ) {
      return;
    }

    const generatedByName = new Map(
      state.generated_sections.map((s) => [s.name, s.content] as const),
    );

    const merged = state.template_sections.map((section) => {
      const rendered = generatedByName.get(section.name);
      const isReady = typeof rendered === "string" && rendered.length > 0;
      const inner = isReady ? (rendered as string) : section.content;
      const stateAttr = isReady ? "ready" : "pending";
      return {
        name: section.name,
        content: `<div data-alloro-preview-section="${escapeAttr(section.name)}" data-alloro-preview-state="${stateAttr}">${inner}</div>`,
      };
    });

    let assembled = renderPage(
      state.wrapper,
      state.header || "",
      state.footer || "",
      merged,
      undefined,
      undefined,
      undefined,
      projectId,
    );

    const overlayCss = `
      <style>
        html { scroll-behavior: auto; }
        body { overflow-x: hidden; }

        [data-alloro-preview-section] { position: relative; }

        /* Pending: dim children, disable interactivity. No label by default. */
        [data-alloro-preview-state="pending"] > *:not([data-alloro-label-pill]) {
          opacity: 0.30 !important;
          filter: saturate(0.4) !important;
          pointer-events: none !important;
        }
        [data-alloro-preview-state="pending"][data-alloro-is-current="1"] > *:not([data-alloro-label-pill]) {
          opacity: 0.45 !important;
        }

        /* Active section: shimmer bar at the top edge. */
        [data-alloro-preview-state="pending"][data-alloro-is-current="1"]::after {
          content: "";
          position: absolute; inset-inline: 0; top: 0; height: 3px;
          background: linear-gradient(90deg, transparent 0%, #f59e0b 40%, #f59e0b 60%, transparent 100%);
          background-size: 200% 100%;
          animation: alloro-shimmer 1.8s ease-in-out infinite;
          pointer-events: none; z-index: 11;
        }

        /* Label pill: a real DOM node (injected by inline script) so the
           dimming filter doesn't wash it out. Only shown when section is
           the current one. */
        [data-alloro-preview-state="pending"][data-alloro-is-current="1"] > [data-alloro-label-pill] {
          position: absolute; inset-inline: 0; top: 50%; transform: translateY(-50%);
          display: flex; align-items: center; justify-content: center;
          pointer-events: none; z-index: 10; opacity: 1; filter: none;
        }
        [data-alloro-preview-state="pending"]:not([data-alloro-is-current="1"]) > [data-alloro-label-pill],
        [data-alloro-preview-state="ready"] > [data-alloro-label-pill] {
          display: none;
        }
        [data-alloro-label-pill] > .alloro-pill {
          display: inline-flex; align-items: center; gap: 0.5rem;
          background: rgba(255,255,255,0.96); backdrop-filter: blur(4px);
          padding: 0.5rem 1rem; border-radius: 9999px;
          border: 1px solid #fde68a;
          color: #b45309; font-weight: 500; font-size: 0.8125rem;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          animation: alloro-pulse 1.4s ease-in-out infinite;
        }
        [data-alloro-label-pill] .alloro-dot {
          width: 0.5rem; height: 0.5rem; border-radius: 9999px;
          background: #f59e0b;
          animation: alloro-dot-pulse 1s ease-in-out infinite;
        }

        /* Freshly-landed section animates in once. */
        [data-alloro-preview-state="ready"][data-alloro-just-landed="1"] {
          animation: alloro-section-in 400ms ease-out both;
        }

        @keyframes alloro-section-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes alloro-shimmer {
          0%   { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        @keyframes alloro-pulse {
          0%, 100% { transform: translateY(-50%) scale(1); opacity: 1; }
          50%      { transform: translateY(-50%) scale(1.03); opacity: 0.95; }
        }
        @keyframes alloro-dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.7); }
        }
      </style>
      <script>
        (function(){
          function ensurePills(){
            document.querySelectorAll('[data-alloro-preview-section]').forEach(function(el){
              if (el.querySelector(':scope > [data-alloro-label-pill]')) return;
              var wrap = document.createElement('div');
              wrap.setAttribute('data-alloro-label-pill', '');
              var pill = document.createElement('div');
              pill.className = 'alloro-pill';
              var dot = document.createElement('span');
              dot.className = 'alloro-dot';
              pill.appendChild(dot);
              pill.appendChild(document.createTextNode('Building ' + (el.dataset.alloroPreviewSection || 'section') + '…'));
              wrap.appendChild(pill);
              el.appendChild(wrap);
            });
          }
          ensurePills();
          new MutationObserver(ensurePills).observe(document.body, { childList: true, subtree: true });
        })();
      </script>
    `;
    assembled = assembled.replace(/<\/body>/i, `${overlayCss}\n</body>`);

    firstLoadDoneRef.current = true;
    lastGeneratedNamesRef.current = new Set(
      state.generated_sections.map((s) => s.name),
    );

    setInitialSrcDoc(prepareHtmlForPreview(assembled));
  }, [state, projectId]);

  // Mutate the live iframe DOM on subsequent ticks — do NOT rebuild srcDoc.
  useEffect(() => {
    if (!state || !iframeRef.current) return;
    if (!firstLoadDoneRef.current) return;

    const doc = iframeRef.current.contentDocument;
    if (!doc || !doc.body) return;

    // Move the "current section" marker so the active shimmer/pill follow.
    const current = state.generation_progress?.current_component || "";
    doc.body.setAttribute("data-alloro-current", current);
    doc
      .querySelectorAll("[data-alloro-preview-section]")
      .forEach((el) => {
        const name = (el as HTMLElement).dataset.alloroPreviewSection || "";
        if (name === current && (el as HTMLElement).dataset.alloroPreviewState === "pending") {
          (el as HTMLElement).setAttribute("data-alloro-is-current", "1");
        } else {
          (el as HTMLElement).removeAttribute("data-alloro-is-current");
        }
      });

    // Swap in any newly-landed sections in place. Use a DocumentFragment
    // built via Range.createContextualFragment so the content parses in
    // the correct DOM context.
    const prevSet = lastGeneratedNamesRef.current;
    const justLandedSections: string[] = [];
    for (const s of state.generated_sections) {
      if (prevSet.has(s.name)) continue;
      const target = doc.querySelector(
        `[data-alloro-preview-section="${cssEscape(s.name)}"]`,
      ) as HTMLElement | null;
      if (!target) continue;

      const range = doc.createRange();
      range.selectNodeContents(target);
      const frag = range.createContextualFragment(s.content);
      target.replaceChildren(frag);

      target.setAttribute("data-alloro-preview-state", "ready");
      target.setAttribute("data-alloro-just-landed", "1");
      target.removeAttribute("data-alloro-is-current");
      justLandedSections.push(s.name);
    }
    lastGeneratedNamesRef.current = new Set(
      state.generated_sections.map((s) => s.name),
    );

    if (justLandedSections.length > 0) {
      setTimeout(() => {
        const d = iframeRef.current?.contentDocument;
        if (!d) return;
        for (const name of justLandedSections) {
          const el = d.querySelector(
            `[data-alloro-preview-section="${cssEscape(name)}"]`,
          );
          el?.removeAttribute("data-alloro-just-landed");
        }
      }, 600);
    }
  }, [state]);

  if (error && !state) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!state || !initialSrcDoc) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading preview...
      </div>
    );
  }

  const total = state.template_sections.length;
  const completed = state.generated_sections.length;
  const current = state.generation_progress?.current_component || null;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isGenerating =
    state.generation_status === "generating" ||
    state.generation_status === "queued";

  return (
    <div className="relative w-full h-full">
      {isGenerating && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4 pointer-events-none">
          <div className="rounded-xl border border-amber-200 bg-white/95 backdrop-blur px-4 py-3 shadow-sm pointer-events-auto">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600 shrink-0" />
                <span className="text-sm font-medium text-gray-900 truncate">
                  Building page…
                </span>
              </div>
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">
                {current || "—"} ({completed}/{total})
              </span>
            </div>
            <div className="relative h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
              <div className="absolute inset-y-0 left-0 w-1/3 rounded-full opacity-40 bg-gradient-to-r from-transparent via-white to-transparent alloro-bar-shimmer" />
            </div>
          </div>
        </div>
      )}

      <iframe
        ref={iframeRef}
        title="Page preview"
        sandbox="allow-same-origin allow-scripts"
        className="w-full h-full border-0 bg-white"
        srcDoc={initialSrcDoc}
      />
      <style>{`
        @keyframes alloro-bar-shimmer-kf {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        .alloro-bar-shimmer { animation: alloro-bar-shimmer-kf 1.6s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape a value for use inside a CSS attribute selector. */
function cssEscape(s: string): string {
  return s.replace(/(["\\])/g, "\\$1");
}
