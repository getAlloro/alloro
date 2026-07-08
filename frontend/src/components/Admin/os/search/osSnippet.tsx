import { Fragment, type ReactNode } from "react";

/**
 * Render a search snippet, emphasizing the `<<…>>`-marked match spans as
 * accent text (plans/07042026-alloro-os-admin-port P4 T5). The backend's
 * ts_headline marks matches with StartSel=<< / StopSel=>> (see
 * OsDocumentModel.OS_DOCUMENT_SEARCH_TSV_REBUILD_SQL). We parse those markers
 * into plain React nodes rather than injecting raw HTML (§17.4) — the text is
 * server-controlled, but building nodes keeps the surface XSS-proof by design.
 */

const OS_MATCH_OPEN = "<<";
const OS_MATCH_CLOSE = ">>";

export function renderOsSnippet(snippet: string): ReactNode {
  if (!snippet.includes(OS_MATCH_OPEN)) return snippet;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  while (cursor < snippet.length) {
    const open = snippet.indexOf(OS_MATCH_OPEN, cursor);
    if (open === -1) {
      nodes.push(<Fragment key={key++}>{snippet.slice(cursor)}</Fragment>);
      break;
    }
    if (open > cursor) {
      nodes.push(<Fragment key={key++}>{snippet.slice(cursor, open)}</Fragment>);
    }
    const close = snippet.indexOf(OS_MATCH_CLOSE, open + OS_MATCH_OPEN.length);
    if (close === -1) {
      // Unbalanced marker — render the rest literally rather than guessing.
      nodes.push(<Fragment key={key++}>{snippet.slice(open)}</Fragment>);
      break;
    }
    const matchText = snippet.slice(open + OS_MATCH_OPEN.length, close);
    nodes.push(
      <mark key={key++} className="bg-transparent font-semibold text-alloro-orange">
        {matchText}
      </mark>,
    );
    cursor = close + OS_MATCH_CLOSE.length;
  }

  return nodes;
}
