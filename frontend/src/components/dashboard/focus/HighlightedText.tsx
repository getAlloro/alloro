import React from "react";

interface HighlightedTextProps {
  text: string;
  highlights?: string[];
}

/**
 * HighlightedText — wraps occurrences of `highlights` phrases inside `text`
 * with `<mark className="hl">` JSX nodes. Pure-text only: never accepts or
 * emits raw HTML, so agent-authored output cannot inject markup.
 *
 * Algorithm (port of ~/Desktop/another-design/project/parts.jsx:4-19):
 *   1. No highlights → return text as-is.
 *   2. Filter empties, sort longest-first so overlapping prefixes match the
 *      longer phrase (e.g. "form submissions" beats "form").
 *   3. Escape regex specials in each phrase.
 *   4. Build a single grouped alternation `/(a|b|c)/g`. Splitting on a regex
 *      with a capture group keeps the matches in the resulting array.
 *   5. Walk the parts; if a part exactly matches a sorted highlight, wrap it
 *      in `<mark className="hl">`, else render the plain string.
 *
 * Phrases that don't appear in `text` are silent no-ops — the regex simply
 * never matches them, so they don't affect output.
 */
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const HIGHLIGHT_TAG_RE = /(<\/?\s*(?:hghlt|hl)\s*>)/gi;
const OPEN_HIGHLIGHT_TAG_RE = /^<\s*(?:hghlt|hl)\s*>$/i;
const CLOSE_HIGHLIGHT_TAG_RE = /^<\s*\/\s*(?:hghlt|hl)\s*>$/i;

type TextPart = {
  text: string;
  highlighted: boolean;
};

function splitHighlightTags(text: string): TextPart[] | null {
  if (!HIGHLIGHT_TAG_RE.test(text)) {
    HIGHLIGHT_TAG_RE.lastIndex = 0;
    return null;
  }
  HIGHLIGHT_TAG_RE.lastIndex = 0;

  const rawParts = text.split(HIGHLIGHT_TAG_RE);
  const parts: TextPart[] = [];
  let highlighted = false;

  rawParts.forEach((part) => {
    if (!part) return;
    if (OPEN_HIGHLIGHT_TAG_RE.test(part)) {
      highlighted = true;
      return;
    }
    if (CLOSE_HIGHLIGHT_TAG_RE.test(part)) {
      highlighted = false;
      return;
    }
    parts.push({ text: part, highlighted });
  });

  return parts;
}

const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  highlights,
}) => {
  const taggedParts = splitHighlightTags(text);

  const sorted = (highlights ?? [])
    .filter((h): h is string => Boolean(h && h.length))
    .sort((a, b) => b.length - a.length);

  if (!taggedParts && sorted.length === 0) {
    return <>{text}</>;
  }

  const escaped = sorted.map((s) => s.replace(REGEX_SPECIALS, "\\$&"));
  const re = escaped.length > 0 ? new RegExp(`(${escaped.join("|")})`, "g") : null;
  const parts = taggedParts ?? [{ text, highlighted: false }];

  return (
    <>
      {parts.flatMap((part, partIndex) => {
        if (part.highlighted) {
          return (
            <mark key={`tag-${partIndex}`} className="hl">
              {part.text}
            </mark>
          );
        }
        if (!re) {
          return (
            <React.Fragment key={`plain-${partIndex}`}>
              {part.text}
            </React.Fragment>
          );
        }
        return part.text.split(re).map((segment, segmentIndex) => {
          if (sorted.includes(segment)) {
            return (
              <mark key={`${partIndex}-${segmentIndex}`} className="hl">
                {segment}
              </mark>
            );
          }
          return (
            <React.Fragment key={`${partIndex}-${segmentIndex}`}>
              {segment}
            </React.Fragment>
          );
        });
      })}
    </>
  );
};

export default HighlightedText;
