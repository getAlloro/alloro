import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { slugifyOsHeading } from "../shared/osFormat";

/**
 * Rendered markdown for the reading column and version previews — the house
 * react-markdown + remark-gfm pattern (analog: MindChatTab); no raw HTML
 * injection (§17.4). Headings are stamped with the same slug
 * the backend writes into version.toc_json, so TOC anchors line up. Spectral
 * carries the reading body per D13.
 */

function flattenToText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(flattenToText).join("");
  if (typeof node === "object" && "props" in node) {
    return flattenToText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function heading(Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
  return function OsHeading({ children }: { children?: ReactNode }) {
    const slug = slugifyOsHeading(flattenToText(children));
    return <Tag id={slug || undefined}>{children}</Tag>;
  };
}

const OS_PROSE_CLASSES = [
  "prose prose-gray max-w-none",
  // Spectral reading body (D13); chrome elsewhere stays Jakarta.
  "font-display text-[15.5px] leading-relaxed text-gray-800",
  "prose-headings:font-display prose-headings:text-alloro-textDark",
  "prose-a:text-alloro-orange prose-a:decoration-accent-soft-line hover:prose-a:decoration-alloro-orange",
  "prose-code:font-mono prose-code:text-[0.85em] prose-code:text-alloro-textDark",
  "prose-pre:rounded-xl prose-pre:border prose-pre:border-line-soft prose-pre:bg-gray-50 prose-pre:font-mono prose-pre:text-gray-800",
  "prose-blockquote:border-l-accent-soft-line prose-blockquote:text-gray-600",
  "prose-th:border prose-th:border-line-medium prose-th:bg-gray-50 prose-th:px-3 prose-th:py-1.5 prose-th:text-left prose-th:font-sans prose-th:text-[12px]",
  "prose-td:border prose-td:border-line-soft prose-td:px-3 prose-td:py-1.5 prose-td:text-[14px]",
  "prose-table:w-full",
  "prose-hr:border-line-medium",
  "prose-li:marker:text-gray-400",
].join(" ");

export function OsMarkdownBody({ markdown }: { markdown: string }) {
  return (
    <div className={OS_PROSE_CLASSES}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: heading("h1"),
          h2: heading("h2"),
          h3: heading("h3"),
          h4: heading("h4"),
          h5: heading("h5"),
          h6: heading("h6"),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
