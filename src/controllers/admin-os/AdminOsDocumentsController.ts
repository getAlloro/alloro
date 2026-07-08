import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { OsDocumentService } from "./feature-services/OsDocumentService";
import { OsTrashService } from "./feature-services/OsTrashService";
import { ok, handleOsError } from "./feature-utils/osResponses";
import {
  osActorId,
  parseOsListFilters,
} from "./feature-utils/osRequestParams";
import {
  buildOsPaginationMeta,
  parseOsPagination,
} from "./feature-utils/osPagination";

/**
 * Admin OS — documents: CRUD + draft autosave + publish + meta + reindex
 * (plans/07042026-alloro-os-admin-port P2 T3; §2.4 split by resource).
 * Thin orchestration only (§7.3): every handler parses the request, calls one
 * feature-service, and answers with the §8.1 envelope via osResponses.
 */
export class AdminOsDocumentsController {
  /** POST /api/admin/os/documents */
  static async create(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const document = await OsDocumentService.createDocument(
        {
          title: String(req.body.title),
          folderId: req.body.folder_id ?? null,
          contentMd: req.body.content_md ?? "",
        },
        osActorId(req)
      );
      return ok(res, { document }, 201);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** GET /api/admin/os/documents — filters + §11.6 pagination. */
  static async list(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const { page, limit, offset } = parseOsPagination(
        req.query.page,
        req.query.limit
      );
      const { documents, total } = await OsDocumentService.listDocuments(
        parseOsListFilters(req.query),
        { limit, offset }
      );
      return ok(res, {
        documents,
        pagination: buildOsPaginationMeta(total, page, limit),
      });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** GET /api/admin/os/documents/:id — enriched document + live version. */
  static async get(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const result = await OsDocumentService.getDocument(req.params.id);
      return ok(res, result);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** PATCH /api/admin/os/documents/:id — rename (slug regenerated). */
  static async rename(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const document = await OsDocumentService.renameDocument(
        req.params.id,
        String(req.body.title),
        osActorId(req)
      );
      return ok(res, { document });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** DELETE /api/admin/os/documents/:id — soft-archive into the trash. */
  static async archive(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const document = await OsTrashService.archiveDocument(
        req.params.id,
        osActorId(req)
      );
      return ok(res, { document });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** PATCH /api/admin/os/documents/:id/meta — folder/owner/category/tags. */
  static async updateMeta(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const document = await OsDocumentService.updateMeta(
        req.params.id,
        {
          folderId: req.body.folder_id,
          ownerId: req.body.owner_id,
          category: req.body.category,
          tags: req.body.tags,
        },
        osActorId(req)
      );
      return ok(res, { document });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** GET /api/admin/os/documents/:id/draft — seeded from live on first open. */
  static async getDraft(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const draft = await OsDocumentService.getDraft(
        req.params.id,
        osActorId(req)
      );
      return ok(res, { draft });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** PUT /api/admin/os/documents/:id/draft — lock-gated autosave. */
  static async saveDraft(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const draft = await OsDocumentService.saveDraft(
        req.params.id,
        String(req.body.content_md ?? ""),
        req.body.base_version ?? null,
        osActorId(req)
      );
      return ok(res, { draft });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** POST /api/admin/os/documents/:id/publish — transactional v(N+1). */
  static async publish(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const version = await OsDocumentService.publishVersion(
        req.params.id,
        {
          baseVersion: Number(req.body.base_version),
          summary: req.body.summary ?? null,
          note: req.body.note ?? null,
        },
        osActorId(req)
      );
      return ok(res, { version }, 201);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** POST /api/admin/os/documents/:id/reindex — 202, ingest re-queued. */
  static async reindex(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const document = await OsDocumentService.reindexDocument(
        req.params.id,
        osActorId(req)
      );
      return ok(res, { queued: true, document }, 202);
    } catch (error) {
      return handleOsError(res, error);
    }
  }
}
