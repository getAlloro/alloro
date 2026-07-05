import { BaseModel, QueryContext } from "./BaseModel";

/**
 * Row shape for os.assets. `size_bytes` is a bigint (pg returns it as a string).
 * The S3 object itself lives at `s3_key` in the shared imports bucket under the
 * `os/assets/{documentId}/{assetId}` namespace (master spec D9).
 */
export interface IOsAsset {
  id: string;
  document_id: string;
  s3_key: string;
  mime: string;
  size_bytes: string;
  uploaded_by: number | null;
  created_at: Date;
}

export interface INewOsAsset {
  document_id: string;
  s3_key: string;
  mime: string;
  size_bytes: number;
  uploaded_by: number | null;
}

/**
 * os.assets — image objects embedded in a document, from either an editor
 * paste/drop or an import's extracted images (plans/07042026-alloro-os-admin-
 * port, D4/D9; P6 T2/T5). The row is the source of truth; delivery is a
 * presigned-URL redirect keyed by the asset id (AdminOsAssetsController).
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design;
 * isolation is the super-admin gate on every /api/admin/os route (§11.1).
 */
export class OsAssetModel extends BaseModel {
  protected static tableName = "os.assets";

  /**
   * Insert an asset row. Some callers need the id BEFORE the object is written
   * (the S3 key embeds the asset id), so this generates the id here via
   * gen_random_uuid()'s DB default and returns the full row. created_at has a
   * DB default; size_bytes is bigint so a number is stringified for pg.
   */
  static async createAsset(
    input: INewOsAsset,
    trx?: QueryContext
  ): Promise<IOsAsset> {
    const [row] = await this.table(trx)
      .insert({ ...input, size_bytes: String(input.size_bytes) })
      .returning("*");
    return row;
  }

  static async findAssetById(
    id: string,
    trx?: QueryContext
  ): Promise<IOsAsset | undefined> {
    return this.table(trx).where({ id }).first();
  }

  /**
   * Set the S3 key after the object lands (the key embeds the asset id, so the
   * row is created first). os.assets has no updated_at column, so this updates
   * only s3_key — BaseModel.updateById would try to stamp a non-existent
   * updated_at and fail.
   */
  static async setS3Key(
    id: string,
    s3Key: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({ s3_key: s3Key });
  }
}
