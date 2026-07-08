/**
 * Category registry for the OS Library. The list an admin sees is the
 * persisted registry (os.document_categories) merged with the distinct
 * categories the AI has already written onto documents; create normalizes
 * (trim/collapse/lowercase key) and upserts idempotently.
 */

import {
  IOsDocumentCategory,
  OsDocumentCategoryModel,
} from "../../../models/OsDocumentCategoryModel";
import { OsActivityModel } from "../../../models/OsActivityModel";
import { OsError } from "../feature-utils/OsError";

const RESERVED_UNCATEGORIZED = "uncategorized";
const MAX_CATEGORY_LENGTH = 120;

export type OsCategorySource = "persisted" | "document";

export interface OsCategory {
  id: string | null;
  name: string;
  source: OsCategorySource;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface CreateOsCategoryResult {
  category: OsCategory;
  created: boolean;
}

function cleanCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeCategoryName(name: string): string {
  return cleanCategoryName(name).toLowerCase();
}

function toPersistedCategory(row: IOsDocumentCategory): OsCategory {
  return {
    id: row.id,
    name: row.name,
    source: "persisted",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Server-authoritative name rules (§5.4) — zod only checks the basics. */
function assertCategoryName(rawName: string): {
  name: string;
  normalizedName: string;
} {
  const name = cleanCategoryName(rawName);
  const normalizedName = normalizeCategoryName(name);
  if (!name) {
    throw new OsError("OS_CATEGORY_NAME_REQUIRED", "Category name is required.");
  }
  if (name.length > MAX_CATEGORY_LENGTH) {
    throw new OsError(
      "OS_CATEGORY_NAME_TOO_LONG",
      `Category name must be ${MAX_CATEGORY_LENGTH} characters or fewer.`
    );
  }
  if (normalizedName === RESERVED_UNCATEGORIZED) {
    throw new OsError("OS_CATEGORY_NAME_RESERVED", "Uncategorized is reserved.");
  }
  return { name, normalizedName };
}

function readDocumentCategoryName(
  rawName: string
): { name: string; normalizedName: string } | null {
  const name = cleanCategoryName(rawName);
  const normalizedName = normalizeCategoryName(name);
  if (
    !name ||
    name.length > MAX_CATEGORY_LENGTH ||
    normalizedName === RESERVED_UNCATEGORIZED
  ) {
    return null;
  }
  return { name, normalizedName };
}

export class OsCategoryService {
  static async listCategories(): Promise<OsCategory[]> {
    const [persisted, documentCategories] = await Promise.all([
      OsDocumentCategoryModel.listPersisted(),
      OsDocumentCategoryModel.listDocumentCategoryNames(),
    ]);
    const byName = new Map<string, OsCategory>();

    for (const row of persisted) {
      byName.set(row.normalized_name, toPersistedCategory(row));
    }
    for (const row of documentCategories) {
      const category = readDocumentCategoryName(row.name);
      if (!category) continue;
      if (!byName.has(category.normalizedName)) {
        byName.set(category.normalizedName, {
          id: null,
          name: category.name,
          source: "document",
          created_at: null,
          updated_at: null,
        });
      }
    }

    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Idempotent create: an existing normalized name returns created:false. */
  static async createCategory(
    rawName: string,
    actorId: number
  ): Promise<CreateOsCategoryResult> {
    const { name, normalizedName } = assertCategoryName(rawName);
    const existing =
      await OsDocumentCategoryModel.findByNormalizedName(normalizedName);
    if (existing) return { category: toPersistedCategory(existing), created: false };

    const created = await OsDocumentCategoryModel.createCategory({
      name,
      normalizedName,
      createdBy: actorId,
    });
    // onConflict().ignore() returns nothing on a concurrent insert — re-read.
    const row =
      created ??
      (await OsDocumentCategoryModel.findByNormalizedName(normalizedName));
    if (!row) {
      throw new OsError("OS_CATEGORY_CREATE_FAILED", "Could not create category.");
    }
    if (created) {
      await OsActivityModel.log({
        actor_id: actorId,
        action: "category.created",
        target_type: "category",
        target_id: row.id,
        metadata: { name: row.name },
      });
    }
    return { category: toPersistedCategory(row), created: Boolean(created) };
  }
}
