/**
 * Related-document link lifecycle (plans/07042026-alloro-os-admin-port, P4 T4;
 * port of alloro-os LinkService). The ingest pipeline writes AI suggestions
 * (OsDocumentLinkModel.suggestPair); this service owns the human lifecycle:
 * list the three buckets for a document, accept / reject a suggestion, create
 * a manual link, and remove one. Thin over Os*Model (§7.4); every mutation
 * writes an activity row. Every state change is a shaped DTO so the frontend
 * gets one stable link shape across all three buckets.
 */

import {
  IOsLinkView,
  OsDocumentLinkModel,
  OsLinkStatus,
} from "../../../models/OsDocumentLinkModel";
import { OsDocumentModel } from "../../../models/OsDocumentModel";
import { OsActivityModel } from "../../../models/OsActivityModel";
import { OsError } from "../feature-utils/OsError";

/** One link edge as the API returns it — the "other" document is nested. */
export interface OsLinkDto {
  id: string;
  origin: string;
  status: OsLinkStatus;
  document: {
    id: string;
    title: string;
    status: string;
    archived: boolean;
  };
}

/** The Related rail payload: accepted out-links, backlinks, pending suggestions. */
export interface OsLinksView {
  links: OsLinkDto[];
  backlinks: OsLinkDto[];
  suggested: OsLinkDto[];
}

function shapeLink(view: IOsLinkView): OsLinkDto {
  return {
    id: view.id,
    origin: view.origin,
    status: view.status,
    document: {
      id: view.doc_id,
      title: view.doc_title,
      status: view.doc_status,
      archived: Boolean(view.doc_archived_at),
    },
  };
}

function documentNotFound(documentId: string): never {
  throw new OsError("OS_DOCUMENT_NOT_FOUND", "Document not found.", {
    documentId,
  });
}

async function requireDocument(documentId: string): Promise<void> {
  const document = await OsDocumentModel.findDocumentById(documentId);
  if (!document) documentNotFound(documentId);
}

async function requireLinkStatus(
  linkId: string,
  status: OsLinkStatus,
  actorId: number
): Promise<{ id: string; status: OsLinkStatus }> {
  const link = await OsDocumentLinkModel.findLinkById(linkId);
  if (!link) {
    throw new OsError("OS_LINK_NOT_FOUND", "Link not found.", { linkId });
  }
  await OsDocumentLinkModel.setStatus(linkId, status);
  await OsActivityModel.log({
    actor_id: actorId,
    action: status === "accepted" ? "link.accepted" : "link.rejected",
    target_type: "link",
    target_id: linkId,
  });
  return { id: linkId, status };
}

export class OsLinkService {
  /** The Related rail: accepted out-links + backlinks + pending suggestions. */
  static async getLinks(documentId: string): Promise<OsLinksView> {
    await requireDocument(documentId);
    const [outbound, inbound, suggested] = await Promise.all([
      OsDocumentLinkModel.listOutboundAccepted(documentId),
      OsDocumentLinkModel.listInboundAccepted(documentId),
      OsDocumentLinkModel.listSuggested(documentId),
    ]);
    return {
      links: outbound.map(shapeLink),
      backlinks: inbound.map(shapeLink),
      suggested: suggested.map(shapeLink),
    };
  }

  /**
   * Manual link source → target, created accepted. Guards: never self-link
   * (400), target must exist (404), and an already-accepted pair is a 409 —
   * the human sees "already linked" instead of a silent no-op. Flipping a
   * suggested/rejected pair to accepted via this path is allowed (that is the
   * "accept a suggestion by adding it manually" affordance).
   */
  static async createManualLink(
    sourceDocumentId: string,
    targetDocumentId: string,
    actorId: number
  ): Promise<OsLinkDto> {
    if (sourceDocumentId === targetDocumentId) {
      // Bad request (invalid pair), not a state conflict — the code deliberately
      // omits "CONFLICT" so handleOsError leaves it at the default 400.
      throw new OsError(
        "OS_LINK_SELF",
        "A document cannot link to itself.",
        { documentId: sourceDocumentId }
      );
    }
    await requireDocument(sourceDocumentId);
    const target = await OsDocumentModel.findDocumentById(targetDocumentId);
    if (!target) {
      throw new OsError(
        "OS_LINK_TARGET_NOT_FOUND",
        "Target document not found.",
        { targetDocumentId }
      );
    }

    const existing = await OsDocumentLinkModel.findPair(
      sourceDocumentId,
      targetDocumentId
    );
    if (existing?.status === "accepted") {
      throw new OsError(
        "OS_LINK_DUPLICATE_CONFLICT",
        "These documents are already linked.",
        { linkId: existing.id }
      );
    }

    const link = await OsDocumentLinkModel.upsertManualAccepted(
      sourceDocumentId,
      targetDocumentId,
      actorId
    );
    await OsActivityModel.log({
      actor_id: actorId,
      action: "link.accepted",
      target_type: "link",
      target_id: link.id,
      metadata: {
        source: sourceDocumentId,
        target: targetDocumentId,
        manual: true,
      },
    });
    return {
      id: link.id,
      origin: link.origin,
      status: link.status,
      document: {
        id: target.id,
        title: target.title,
        status: target.status,
        archived: Boolean(target.archived_at),
      },
    };
  }

  /** Accept a suggested (or previously rejected) link. */
  static async acceptLink(
    linkId: string,
    actorId: number
  ): Promise<{ id: string; status: OsLinkStatus }> {
    return requireLinkStatus(linkId, "accepted", actorId);
  }

  /** Reject a suggested (or previously accepted) link. */
  static async rejectLink(
    linkId: string,
    actorId: number
  ): Promise<{ id: string; status: OsLinkStatus }> {
    return requireLinkStatus(linkId, "rejected", actorId);
  }
}
