import { useMemo, useState } from "react";
import { Check, Link2, Plus, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { OsLinkDto } from "../../../../api/admin-os";
import {
  useAdminOsLinks,
  useCreateOsLink,
  useUpdateOsLinkStatus,
} from "../../../../hooks/queries/useAdminOsLinks";
import { useAdminOsDocuments } from "../../../../hooks/queries/useAdminOsDocuments";
import { useOsPopover } from "../../../../hooks/useOsPopover";
import { OsErrorState } from "../shared/OsErrorState";

/**
 * Related-documents rail (plans/07042026-alloro-os-admin-port P4 T5) — replaces
 * the "Related" placeholder in OsHistoryRail. Three groups, matching the rail's
 * quiet visual language (Spectral titles, hairline dividers, mono meta,
 * accent-wash hover, #D66853 only on the action affordances):
 *
 *   - Suggested — AI links pending a decision; accept ✓ / reject ✕ (quiet).
 *   - Related   — accepted out-links (this document → others).
 *   - Backlinks — accepted links pointing at this document.
 *
 * A "＋ Add" popover manually links another document. Server state is React
 * Query only (§15.1); mutations invalidate the links key so the rail refreshes.
 */

function OsLinkRow({ document }: { document: OsLinkDto["document"] }) {
  return (
    <Link
      to={`/admin/os/doc/${document.id}`}
      className={`block min-w-0 truncate rounded-md px-2 py-1 font-display text-[14px] transition-colors duration-150 hover:bg-accent-soft ${
        document.archived ? "text-gray-400 line-through" : "text-alloro-textDark"
      }`}
    >
      {document.title}
    </Link>
  );
}

function OsSuggestedRow({
  link,
  onAccept,
  onReject,
  isBusy,
}: {
  link: OsLinkDto;
  onAccept: () => void;
  onReject: () => void;
  isBusy: boolean;
}) {
  return (
    <li className="group flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors duration-150 hover:bg-accent-soft">
      <Link
        to={`/admin/os/doc/${link.document.id}`}
        className="min-w-0 flex-1 truncate font-display text-[14px] text-alloro-textDark"
      >
        {link.document.title}
      </Link>
      <button
        type="button"
        onClick={onAccept}
        disabled={isBusy}
        aria-label="Accept suggestion"
        className="rounded p-0.5 text-gray-300 transition-colors duration-150 hover:text-alloro-orange disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={isBusy}
        aria-label="Reject suggestion"
        className="rounded p-0.5 text-gray-300 transition-colors duration-150 hover:text-gray-600 disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </li>
  );
}

function OsLinkPicker({
  documentId,
  excludeIds,
  onPick,
  isSaving,
}: {
  documentId: string;
  excludeIds: Set<string>;
  onPick: (targetId: string) => void;
  isSaving: boolean;
}) {
  const { isOpen, setIsOpen, ref } = useOsPopover<HTMLDivElement>();
  const [term, setTerm] = useState("");
  const documentsQuery = useAdminOsDocuments({ limit: 100 });

  const candidates = useMemo(() => {
    const all = documentsQuery.data?.documents ?? [];
    const needle = term.trim().toLowerCase();
    return all
      .filter((doc) => doc.id !== documentId && !excludeIds.has(doc.id))
      .filter((doc) => !needle || doc.title.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [documentsQuery.data, term, documentId, excludeIds]);

  const pick = (targetId: string) => {
    setIsOpen(false);
    setTerm("");
    onPick(targetId);
  };

  return (
    <div ref={ref} className="relative mt-2 inline-flex">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={isSaving}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1 rounded-full border border-line-medium px-2 py-0.5 font-mono text-[11px] text-gray-500 transition-colors duration-150 hover:border-gray-300 disabled:opacity-60"
      >
        <Plus className="h-3 w-3" strokeWidth={1.75} />
        Add link
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Documents"
          className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-xl border border-line-medium bg-alloro-surface p-1 shadow-lg"
        >
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Find a document…"
            className="mb-1 w-full rounded-lg bg-gray-100/60 px-2.5 py-1.5 text-[13px] text-alloro-textDark placeholder:text-gray-400 focus:outline-none"
            aria-label="Filter documents"
          />
          <div className="max-h-56 overflow-y-auto">
            {documentsQuery.isLoading && (
              <p className="px-2.5 py-2 font-mono text-[11px] text-gray-400">
                Loading…
              </p>
            )}
            {!documentsQuery.isLoading && candidates.length === 0 && (
              <p className="px-2.5 py-2 font-mono text-[11px] text-gray-300">
                No documents to link.
              </p>
            )}
            {candidates.map((doc) => (
              <button
                key={doc.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => pick(doc.id)}
                className="block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[13px] text-gray-700 transition-colors duration-150 hover:bg-gray-100/70"
              >
                {doc.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OsRailGroupLabel({ children }: { children: string }) {
  return (
    <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400">
      {children}
    </p>
  );
}

export function OsRelatedRail({ documentId }: { documentId: string }) {
  const linksQuery = useAdminOsLinks(documentId);
  const updateStatus = useUpdateOsLinkStatus(documentId);
  const createLink = useCreateOsLink(documentId);

  const data = linksQuery.data;
  const excludeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const bucket of [
      data?.links ?? [],
      data?.suggested ?? [],
      data?.backlinks ?? [],
    ]) {
      for (const link of bucket) ids.add(link.document.id);
    }
    return ids;
  }, [data]);

  const isBusy = updateStatus.isPending || createLink.isPending;

  return (
    <section className="py-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        <Link2 className="h-4 w-4" strokeWidth={1.5} />
        Related
      </h3>
      <div className="mt-2 pl-6">
        {linksQuery.isLoading && (
          <p className="font-mono text-[11px] text-gray-400">Loading links…</p>
        )}
        {linksQuery.isError && (
          <OsErrorState
            message="Couldn't load related documents"
            onRetry={() => void linksQuery.refetch()}
          />
        )}

        {data && (
          <>
            {data.suggested.length > 0 && (
              <div className="mb-3">
                <OsRailGroupLabel>Suggested</OsRailGroupLabel>
                <ul>
                  {data.suggested.map((link) => (
                    <OsSuggestedRow
                      key={link.id}
                      link={link}
                      isBusy={isBusy}
                      onAccept={() =>
                        updateStatus.mutate({
                          linkId: link.id,
                          status: "accepted",
                        })
                      }
                      onReject={() =>
                        updateStatus.mutate({
                          linkId: link.id,
                          status: "rejected",
                        })
                      }
                    />
                  ))}
                </ul>
              </div>
            )}

            {data.links.length > 0 && (
              <div className="mb-3">
                <OsRailGroupLabel>Related</OsRailGroupLabel>
                {data.links.map((link) => (
                  <OsLinkRow key={link.id} document={link.document} />
                ))}
              </div>
            )}

            {data.backlinks.length > 0 && (
              <div className="mb-3">
                <OsRailGroupLabel>Backlinks</OsRailGroupLabel>
                {data.backlinks.map((link) => (
                  <OsLinkRow key={link.id} document={link.document} />
                ))}
              </div>
            )}

            {data.suggested.length === 0 &&
              data.links.length === 0 &&
              data.backlinks.length === 0 && (
                <p className="font-mono text-[11px] text-gray-300">
                  No related documents yet.
                </p>
              )}

            <OsLinkPicker
              documentId={documentId}
              excludeIds={excludeIds}
              onPick={(targetId) => createLink.mutate(targetId)}
              isSaving={isBusy}
            />
          </>
        )}
      </div>
    </section>
  );
}
