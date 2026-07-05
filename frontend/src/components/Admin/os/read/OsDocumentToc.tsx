import type { OsTocEntry } from "../../../../api/admin-os";

/**
 * Table of contents from version.toc_json (P3 T3): indents by heading level
 * and smooth-scrolls to the ids OsMarkdownBody stamped (instant under
 * prefers-reduced-motion). Sticky beside the reading column on lg+.
 */

const INDENT_BY_LEVEL: Record<number, string> = {
  1: "pl-3",
  2: "pl-6",
  3: "pl-9",
  4: "pl-12",
};

function indentClass(level: number): string {
  return INDENT_BY_LEVEL[Math.min(Math.max(level, 1), 4)];
}

function scrollToHeading(slug: string) {
  const element = document.getElementById(slug);
  if (!element) return;
  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  element.scrollIntoView({
    behavior: prefersReduced ? "auto" : "smooth",
    block: "start",
  });
  history.replaceState(null, "", `#${slug}`);
}

export function OsDocumentToc({ entries }: { entries: OsTocEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <nav
      aria-label="Table of contents"
      className="sticky top-24 hidden w-52 shrink-0 lg:block"
    >
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-gray-400">
        Contents
      </p>
      <ul className="space-y-1 border-l border-line-medium">
        {entries.map((entry, index) => (
          <li key={`${entry.slug}-${index}`}>
            <a
              href={`#${entry.slug}`}
              onClick={(event) => {
                event.preventDefault();
                scrollToHeading(entry.slug);
              }}
              className={`-ml-px block border-l border-transparent py-0.5 text-[13px] text-gray-500 transition-colors duration-150 hover:border-alloro-orange hover:text-gray-900 ${indentClass(entry.level)}`}
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
