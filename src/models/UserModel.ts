import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export interface IUser {
  id: number;
  email: string;
  name: string | null;
  password_hash: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email_verified: boolean;
  email_verification_code: string | null;
  email_verification_expires_at: Date | null;
  password_reset_code: string | null;
  password_reset_expires_at: Date | null;
  is_internal: boolean;
  google_sub: string | null;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export class UserModel extends BaseModel {
  protected static tableName = "users";

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IUser | undefined> {
    return super.findById(id, trx);
  }

  static async findByEmail(
    email: string,
    trx?: QueryContext
  ): Promise<IUser | undefined> {
    const normalizedEmail = email.toLowerCase();
    return this.table(trx).where({ email: normalizedEmail }).first();
  }

  static async create(
    data: {
      email: string;
      name?: string;
      password_hash?: string;
      email_verification_code?: string;
      email_verification_expires_at?: Date;
    },
    trx?: QueryContext
  ): Promise<IUser> {
    const record: Record<string, unknown> = {
      email: data.email.toLowerCase(),
      name: data.name || data.email.toLowerCase().split("@")[0],
    };
    if (data.password_hash) record.password_hash = data.password_hash;
    if (data.email_verification_code)
      record.email_verification_code = data.email_verification_code;
    if (data.email_verification_expires_at)
      record.email_verification_expires_at =
        data.email_verification_expires_at;
    return super.create(record, trx);
  }

  static async findOrCreate(
    email: string,
    name?: string,
    trx?: QueryContext
  ): Promise<IUser> {
    const existing = await this.findByEmail(email, trx);
    if (existing) return existing;
    return this.create({ email, name }, trx);
  }

  // ─── Google SSO login (plans/07052026-google-sso-admin-and-user-login) ───

  /** Look up a user by their stable Google account id (the `sub` claim). */
  static async findByGoogleSub(
    googleSub: string,
    trx?: QueryContext
  ): Promise<IUser | undefined> {
    return this.table(trx).where({ google_sub: googleSub }).first();
  }

  /**
   * Create a new user from a verified Google identity (admin sign-in). The
   * admin Google flow only ever reaches here for an @getalloro.com account
   * (assertAdminDomain runs first, and the login flow never creates), so the
   * new row is internal staff — is_internal:true keeps them out of client
   * telemetry and into the OS people-pickers, matching the one-time backfill
   * in migration 20260701010000.
   */
  static async createFromGoogle(
    data: {
      email: string;
      name: string | null;
      googleSub: string;
      avatarUrl: string | null;
    },
    trx?: QueryContext
  ): Promise<IUser> {
    const normalizedEmail = data.email.toLowerCase();
    return super.create(
      {
        email: normalizedEmail,
        name: data.name || normalizedEmail.split("@")[0],
        google_sub: data.googleSub,
        avatar_url: data.avatarUrl,
        is_internal: true,
      },
      trx
    );
  }

  /** Mark a user as internal Alloro staff. Idempotent. */
  static async markInternal(
    id: number,
    trx?: QueryContext
  ): Promise<IUser> {
    await super.updateById(id, { is_internal: true }, trx);
    const updated = await this.findById(id, trx);
    return updated as IUser;
  }

  /**
   * All internal Alloro staff (is_internal), for admin people-pickers and
   * rosters — the DB-driven replacement for the SUPER_ADMIN_EMAILS env roster.
   * @getalloro accounts land here automatically on first Google sign-in.
   */
  static async listInternalUsers(trx?: QueryContext): Promise<
    Array<{
      id: number;
      email: string;
      name: string | null;
      first_name: string | null;
      last_name: string | null;
    }>
  > {
    return this.table(trx)
      .where({ is_internal: true })
      .select("id", "email", "name", "first_name", "last_name")
      .orderBy("email", "asc");
  }

  /** Bind a google_sub (and refresh the avatar) onto an existing user row. */
  static async attachGoogleIdentity(
    id: number,
    googleSub: string,
    avatarUrl: string | null,
    trx?: QueryContext
  ): Promise<IUser> {
    await super.updateById(
      id,
      {
        google_sub: googleSub,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      },
      trx
    );
    const updated = await this.findById(id, trx);
    return updated as IUser;
  }

  static async updateProfile(
    id: number,
    data: { first_name?: string; last_name?: string; phone?: string },
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async setEmailVerified(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(
      id,
      {
        email_verified: true,
        email_verification_code: null,
        email_verification_expires_at: null,
      },
      trx
    );
  }

  static async setVerificationCode(
    id: number,
    code: string,
    expiresAt: Date,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(
      id,
      {
        email_verification_code: code,
        email_verification_expires_at: expiresAt,
      },
      trx
    );
  }

  static async findByVerificationCode(
    email: string,
    code: string,
    trx?: QueryContext
  ): Promise<IUser | undefined> {
    const normalizedEmail = email.toLowerCase();
    return this.table(trx)
      .where({
        email: normalizedEmail,
        email_verification_code: code,
      })
      .where("email_verification_expires_at", ">", new Date())
      .first();
  }

  static async setPasswordResetCode(
    id: number,
    code: string,
    expiresAt: Date,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(
      id,
      {
        password_reset_code: code,
        password_reset_expires_at: expiresAt,
      },
      trx
    );
  }

  static async findByPasswordResetCode(
    email: string,
    code: string,
    trx?: QueryContext
  ): Promise<IUser | undefined> {
    const normalizedEmail = email.toLowerCase();
    return this.table(trx)
      .where({
        email: normalizedEmail,
        password_reset_code: code,
      })
      .where("password_reset_expires_at", ">", new Date())
      .first();
  }

  static async clearPasswordResetCode(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(
      id,
      {
        password_reset_code: null,
        password_reset_expires_at: null,
      },
      trx
    );
  }

  static async updatePasswordHash(
    id: number,
    passwordHash: string,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { password_hash: passwordHash }, trx);
  }

  // (id) → is_internal projection, used by telemetry ingestion's write-side block.
  static async findInternalFlagById(
    id: number,
    trx?: QueryContext
  ): Promise<{ is_internal: boolean } | undefined> {
    return this.table(trx).where({ id }).select("is_internal").first();
  }

  // Fetch a single user's email (used by PM enrichment helpers).
  static async findEmailById(
    id: number,
    trx?: QueryContext
  ): Promise<{ email: string | null } | undefined> {
    return this.table(trx).where({ id }).select("email").first();
  }

  // Fetch id+email for a set of user ids (used by PM mention resolution).
  static async findIdEmailByIds(
    ids: number[],
    trx?: QueryContext
  ): Promise<Array<{ id: number; email: string | null }>> {
    return this.table(trx).whereIn("id", ids).select("id", "email");
  }

  static async findInternalProfilesByIds(
    ids: number[],
    trx?: QueryContext
  ): Promise<
    Array<{
      id: number;
      email: string;
      name: string | null;
      first_name: string | null;
      last_name: string | null;
    }>
  > {
    if (ids.length === 0) return [];
    return this.table(trx)
      .whereIn("id", ids)
      .where({ is_internal: true })
      .whereNotNull("email")
      .select("id", "email", "name", "first_name", "last_name");
  }

  // Resolve a list of emails (case-insensitive) to id/email/name fields.
  // Used by the PM user picker, which sources its roster from
  // SUPER_ADMIN_EMAILS and hydrates display names from the users table.
  static async findManyByEmailsInsensitive(
    emails: string[],
    trx?: QueryContext
  ): Promise<
    Array<{
      id: number | string;
      email: string;
      name: string | null;
      first_name: string | null;
      last_name: string | null;
    }>
  > {
    const emailPlaceholders = emails.map(() => "?").join(", ");
    return this.table(trx)
      .whereRaw(`LOWER(email) IN (${emailPlaceholders})`, emails)
      .select("id", "email", "name", "first_name", "last_name");
  }

  /**
   * Delete users who no longer belong to any organization. Raw statement
   * preserved verbatim from service.delete-organization (orphan cleanup after
   * an org delete cascades its organization_users rows). Pass the delete
   * transaction so it runs atomically with the org removal.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async deleteOrphaned(trx?: QueryContext): Promise<any> {
    return (trx || db).raw(`
      DELETE FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM organization_users ou WHERE ou.user_id = u.id
      )
    `);
  }
}
