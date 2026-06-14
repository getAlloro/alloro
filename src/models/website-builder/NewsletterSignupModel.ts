import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export interface INewsletterSignup {
  id: string;
  project_id: string;
  email: string;
  token: string;
  confirmed_at: Date | null;
  created_at: Date;
}

export class NewsletterSignupModel extends BaseModel {
  protected static tableName = "website_builder.newsletter_signups";

  static async create(
    data: { project_id: string; email: string },
    trx?: QueryContext,
  ): Promise<INewsletterSignup> {
    const [result] = await this.table(trx)
      .insert(data as Record<string, unknown>)
      .returning("*");
    return result;
  }

  static async findByToken(
    token: string,
    trx?: QueryContext,
  ): Promise<INewsletterSignup | undefined> {
    return this.table(trx).where("token", token).first();
  }

  static async findByProjectAndEmail(
    projectId: string,
    email: string,
    trx?: QueryContext,
  ): Promise<INewsletterSignup | undefined> {
    return this.table(trx)
      .where({ project_id: projectId, email })
      .first();
  }

  static async confirm(
    id: string,
    trx?: QueryContext,
  ): Promise<void> {
    await this.table(trx)
      .where("id", id)
      .update({ confirmed_at: new Date() });
  }

  static async upsert(
    data: { project_id: string; email: string },
    trx?: QueryContext,
  ): Promise<INewsletterSignup> {
    // Try to find existing signup
    const existing = await this.findByProjectAndEmail(data.project_id, data.email, trx);

    if (existing) {
      // Reset token and created_at to re-trigger confirmation flow
      const [result] = await this.table(trx)
        .where("id", existing.id)
        .update({
          token: db.raw("gen_random_uuid()"),
          confirmed_at: null,
          created_at: new Date(),
        } as any)
        .returning("*");
      return result;
    }

    return this.create(data, trx);
  }

  /**
   * All newsletter-signup rows for a project, ordered created_at desc, as raw
   * rows. Mirrors the inline export query in workers/processors/websiteBackup
   * verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findAllByProjectIdForBackup(
    projectId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .orderBy("created_at", "desc");
  }
}
