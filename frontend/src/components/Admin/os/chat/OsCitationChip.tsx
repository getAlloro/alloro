import { Link } from "react-router-dom";
import type { OsChatCitation } from "../../../../api/admin-os-chat";

/**
 * One source pill under an assistant answer (plans/07042026-alloro-os-admin-port
 * P5 T4). Bordered mono pill "[doc title · heading]" linking to the cited
 * document's reader (/admin/os/doc/:id). The doc title carries Spectral (D13:
 * doc titles get the serif); the heading path stays mono meta. Falls back to the
 * heading path, then "Document", when the title isn't resolved yet.
 */
export function OsCitationChip({
  citation,
  title,
}: {
  citation: OsChatCitation;
  title: string | undefined;
}) {
  const label = title ?? citation.heading_path ?? "Document";
  const fullLabel =
    citation.heading_path && citation.heading_path !== label
      ? `${label} · ${citation.heading_path}`
      : label;

  return (
    <Link
      to={`/admin/os/doc/${citation.document_id}`}
      title={fullLabel}
      className="inline-flex max-w-[18rem] items-center gap-1.5 rounded-full border border-gray-200 bg-alloro-surface px-2.5 py-0.5 transition-colors duration-150 hover:border-alloro-orange/40 hover:bg-alloro-orange/5"
    >
      <span className="truncate font-display text-[12px] text-gray-700">
        {label}
      </span>
      {citation.heading_path && citation.heading_path !== label && (
        <span className="hidden truncate font-mono text-[10px] text-gray-400 sm:inline">
          {citation.heading_path}
        </span>
      )}
    </Link>
  );
}
