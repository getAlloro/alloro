import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export interface PostBlockFilter {
  ids?: string;
  exc_ids?: string;
  cats?: string;
  tags?: string;
  orderBy: string;
  order: "asc" | "desc";
  limit: number;
  offset: number;
}

export interface IPost {
  id: string;
  project_id: string;
  post_type_id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  featured_image: string | null;
  custom_fields: Record<string, unknown>;
  status: "draft" | "published";
  sort_order: number;
  seo_data: Record<string, unknown> | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Joined fields (not always present)
  categories?: string[];
  tags?: string[];
}

export class PostModel extends BaseModel {
  protected static tableName = "website_builder.posts";
  protected static jsonFields = ["custom_fields", "seo_data"];

  static async findByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<IPost[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .orderBy("sort_order", "asc")
      .orderBy("created_at", "desc");
  }

  static async findByProjectAndType(
    projectId: string,
    postTypeId: string,
    status?: string,
    trx?: QueryContext
  ): Promise<IPost[]> {
    let query = this.table(trx).where({
      project_id: projectId,
      post_type_id: postTypeId,
    });
    if (status) {
      query = query.where({ status });
    }
    return query.orderBy("sort_order", "asc").orderBy("created_at", "desc");
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IPost | undefined> {
    return super.findById(id, trx);
  }

  static async findByIdAndProject(
    postId: string,
    projectId: string,
    trx?: QueryContext
  ): Promise<IPost | undefined> {
    return this.table(trx)
      .where({ id: postId, project_id: projectId })
      .first();
  }

  static async findBySlug(
    projectId: string,
    postTypeId: string,
    slug: string,
    trx?: QueryContext
  ): Promise<IPost | undefined> {
    return this.table(trx)
      .where({ project_id: projectId, post_type_id: postTypeId, slug })
      .first();
  }

  static async create(
    data: Partial<IPost>,
    trx?: QueryContext
  ): Promise<IPost> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: string,
    data: Partial<IPost>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async deleteById(
    id: string,
    trx?: QueryContext
  ): Promise<number> {
    return super.deleteById(id, trx);
  }

  // ===================================================================
  // AI command pipeline helpers
  //
  // These mirror the inline `db("website_builder.posts")` queries previously
  // held in admin-websites/feature-services/service.ai-command verbatim (same
  // columns, filters, ordering, and `db.fn.now()` timestamp sources). The AI
  // command pipeline reads raw post rows (content/title columns accessed
  // directly), so the read methods return raw rows.
  // ===================================================================

  /**
   * Fetch a post (full raw row) by id. Mirrors the inline
   * db(POSTS_TABLE).where("id").first() lookups in service.ai-command
   * (getCurrentHtml, executeUpdatePostMeta).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawById(id: string, trx?: QueryContext): Promise<any> {
    return this.table(trx).where("id", id).first();
  }

  /**
   * Published posts for a project, ordered created_at desc (full raw rows).
   * Mirrors the "resolve all posts" branch of service.ai-command.resolvePosts.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findPublishedByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ project_id: projectId, status: "published" })
      .orderBy("created_at", "desc");
  }

  /**
   * Post rows for an explicit id set (full raw rows). Mirrors the
   * specific-ids branch of service.ai-command.resolvePosts.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByIds(ids: string[], trx?: QueryContext): Promise<any[]> {
    return this.table(trx).whereIn("id", ids);
  }

  /**
   * Posts for a project + post type, capped to `limit` (full raw rows). Mirrors
   * the style-context fetch in service.ai-command.executeCreatePost.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByProjectAndTypeLimit(
    projectId: string,
    postTypeId: string,
    limit: number,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ project_id: projectId, post_type_id: postTypeId })
      .limit(limit);
  }

  /**
   * (post.slug, post_type.slug) pairs for every post in a project, via the
   * post_types join. Mirrors service.ai-command.getExistingPostSlugs verbatim.
   */
  static async findExistingSlugsWithType(
    projectId: string,
    trx?: QueryContext
  ): Promise<Array<{ slug: string; post_type_slug: string }>> {
    return this.table(trx)
      .where({ project_id: projectId })
      .join(
        "website_builder.post_types",
        "website_builder.posts.post_type_id",
        "website_builder.post_types.id"
      )
      .select(
        "website_builder.posts.slug",
        "website_builder.post_types.slug as post_type_slug"
      );
  }

  /**
   * Insert a post row verbatim (raw passthrough) and return it. Mirrors the
   * insert in service.ai-command.executeCreatePost (project_id, post_type_id,
   * title, slug, content, status, sort_order).
   */
  static async insertReturning(
    row: Record<string, unknown>,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const [post] = await this.table(trx).insert(row).returning("*");
    return post;
  }

  /**
   * Set content on a post by id, stamping updated_at via the DB clock. Mirrors
   * the content-write in service.ai-command.saveEditedHtml for the post branch
   * verbatim.
   */
  static async updateContentById(
    id: string,
    content: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where("id", id)
      .update({
        content,
        updated_at: db.fn.now(),
      });
  }

  /**
   * Apply a partial column update to a post by id, stamping updated_at via the
   * DB clock. The caller passes only the fields it wants to change (already
   * stringified where needed, e.g. custom_fields). Mirrors the inline
   * db(POSTS_TABLE).where("id").update(updates) in
   * service.ai-command.executeUpdatePostMeta verbatim, where `updates` is
   * `{ updated_at: db.fn.now(), ...conditionalFields }`.
   */
  static async updateFieldsById(
    id: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where("id", id)
      .update({ ...fields, updated_at: db.fn.now() });
  }

  /**
   * Fetch published posts for a project + post-type slug, applying the
   * post_block shortcode's slug-include/exclude, category, and tag filters,
   * plus ordering and limit/offset. Mirrors the inline query in
   * shortcodeResolver.fetchFilteredPosts verbatim (select p.*, the two
   * whereExists category/tag subqueries, dynamic order/limit/offset). Returns
   * raw rows (select p.*) to preserve original consumption.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async fetchFilteredForBlock(
    projectId: string,
    postTypeSlug: string,
    filter: PostBlockFilter,
    trx?: QueryContext
  ): Promise<any[]> {
    const conn = trx || db;
    let query = conn("website_builder.posts as p")
      .join("website_builder.post_types as pt", "p.post_type_id", "pt.id")
      .where("p.project_id", projectId)
      .where("pt.slug", postTypeSlug)
      .where("p.status", "published")
      .select("p.*");

    if (filter.ids) {
      query = query.whereIn("p.slug", filter.ids.split(",").map((s) => s.trim()));
    }
    if (filter.exc_ids) {
      query = query.whereNotIn(
        "p.slug",
        filter.exc_ids.split(",").map((s) => s.trim())
      );
    }
    if (filter.cats) {
      const catSlugs = filter.cats.split(",").map((s) => s.trim());
      query = query.whereExists(
        conn("website_builder.post_category_assignments as pca")
          .join(
            "website_builder.post_categories as pc",
            "pca.category_id",
            "pc.id"
          )
          .whereRaw("pca.post_id = p.id")
          .whereIn("pc.slug", catSlugs)
      );
    }
    if (filter.tags) {
      const tagSlugs = filter.tags.split(",").map((s) => s.trim());
      query = query.whereExists(
        conn("website_builder.post_tag_assignments as pta")
          .join("website_builder.post_tags as ptag", "pta.tag_id", "ptag.id")
          .whereRaw("pta.post_id = p.id")
          .whereIn("ptag.slug", tagSlugs)
      );
    }

    query = query.orderBy(`p.${filter.orderBy}`, filter.order);
    if (filter.limit > 0) {
      query = query.limit(filter.limit);
    }
    if (filter.offset > 0) {
      query = query.offset(filter.offset);
    }

    return query;
  }

  /**
   * Fetch (post_id, category name) pairs for a set of post ids. Mirrors the
   * inline category-assignment join in shortcodeResolver.fetchFilteredPosts.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findCategoryNamesByPostIds(
    postIds: string[],
    trx?: QueryContext
  ): Promise<Array<{ post_id: string; name: string }>> {
    return (trx || db)("website_builder.post_category_assignments as pca")
      .join(
        "website_builder.post_categories as pc",
        "pca.category_id",
        "pc.id"
      )
      .whereIn("pca.post_id", postIds)
      .select("pca.post_id", "pc.name");
  }

  /**
   * Fetch (post_id, tag name) pairs for a set of post ids. Mirrors the inline
   * tag-assignment join in shortcodeResolver.fetchFilteredPosts.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findTagNamesByPostIds(
    postIds: string[],
    trx?: QueryContext
  ): Promise<Array<{ post_id: string; name: string }>> {
    return (trx || db)("website_builder.post_tag_assignments as pta")
      .join("website_builder.post_tags as pt", "pta.tag_id", "pt.id")
      .whereIn("pta.post_id", postIds)
      .select("pta.post_id", "pt.name");
  }

  /**
   * Update only the seo_data column for a post (verbatim string value as built
   * by the caller). Mirrors the inline update in
   * UserWebsiteController.updateUserPostSeo, which stores a pre-stringified
   * value and sets updated_at via the DB clock.
   */
  static async updateSeoDataRaw(
    postId: string,
    seoDataValue: string,
    trx?: QueryContext
  ): Promise<number> {
    return (trx || db)("website_builder.posts")
      .where("id", postId)
      .update({
        seo_data: seoDataValue,
        updated_at: db.fn.now(),
      });
  }

  /**
   * Set seo_data (pre-stringified) on a single post by id, bumping updated_at
   * via the JS clock. Mirrors the inline update in
   * workers/processors/seoBulkGenerate for the post branch verbatim. Distinct
   * from updateSeoDataRaw, which sets updated_at via the DB clock (db.fn.now())
   * — preserved separately so neither caller's timestamp source changes.
   */
  static async updateSeoDataByIdJsClock(
    postId: string,
    seoDataValue: string,
    trx?: QueryContext
  ): Promise<number> {
    return (trx || db)("website_builder.posts")
      .where({ id: postId })
      .update({
        seo_data: seoDataValue,
        updated_at: new Date(),
      });
  }

  /**
   * Posts for a project + post type, ordered sort_order asc then created_at
   * desc, returned as raw rows. Mirrors the inline entity fetch in
   * workers/processors/seoBulkGenerate.getPostEntities verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByProjectAndTypeForSeo(
    projectId: string,
    postTypeId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return (trx || db)("website_builder.posts")
      .where({ project_id: projectId, post_type_id: postTypeId })
      .orderBy("sort_order", "asc")
      .orderBy("created_at", "desc");
  }

  /**
   * seo_data values for all posts of a project that have non-null seo_data.
   * Mirrors the posts half of the inline meta gather in
   * workers/processors/seoBulkGenerate.getAllSeoMeta verbatim.
   */
  static async findSeoDataByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<Array<{ seo_data: unknown }>> {
    return (trx || db)("website_builder.posts")
      .where({ project_id: projectId })
      .whereNotNull("seo_data")
      .select("seo_data");
  }

  /**
   * All post_category_assignments rows for a set of post ids, as raw rows.
   * Mirrors the inline backup export in workers/processors/websiteBackup
   * verbatim (the posts domain owns the assignment join tables — see
   * findCategoryNamesByPostIds). Caller guards the empty-id case.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findCategoryAssignmentsByPostIds(
    postIds: string[],
    trx?: QueryContext
  ): Promise<any[]> {
    return (trx || db)("website_builder.post_category_assignments").whereIn(
      "post_id",
      postIds
    );
  }

  /**
   * All post_tag_assignments rows for a set of post ids, as raw rows. Mirrors
   * the inline backup export in workers/processors/websiteBackup verbatim.
   * Caller guards the empty-id case.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findTagAssignmentsByPostIds(
    postIds: string[],
    trx?: QueryContext
  ): Promise<any[]> {
    return (trx || db)("website_builder.post_tag_assignments").whereIn(
      "post_id",
      postIds
    );
  }

  // ===================================================================
  // Admin controller helpers (AdminWebsitesController)
  // ===================================================================

  /**
   * Count posts for a project + post type. Mirrors the inline
   * db("website_builder.posts").where({project_id,post_type_id}).count() in
   * AdminWebsitesController.startBulkSeoGenerate verbatim.
   */
  static async countByProjectAndType(
    projectId: string,
    postTypeId: string,
    trx?: QueryContext
  ): Promise<number> {
    const row = await this.table(trx)
      .where({ project_id: projectId, post_type_id: postTypeId })
      .count("* as count")
      .first();
    return parseInt(row?.count as string, 10) || 0;
  }

  /**
   * SEO-meta projection (id/title/slug/seo_data) for all posts of a project.
   * Mirrors the posts query in AdminWebsitesController.getAllSeoMeta verbatim.
   * Raw rows.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findSeoMetaByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .select("id", "title", "slug", "seo_data");
  }

  // ===================================================================
  // Admin post-manager helpers (service.post-manager)
  //
  // Mirror the inline `db("website_builder.posts")` queries (and the
  // category/tag assignment + attachment child-table queries the posts domain
  // owns) in service.post-manager verbatim — same columns, filters, ordering,
  // joins, and `db.fn.now()` timestamp source. Reads return raw rows.
  // ===================================================================

  /**
   * Posts for a project with optional post_type_id + status filters, ordered
   * sort_order asc then created_at desc (full raw rows). Mirrors the inline
   * list query in service.post-manager.listPosts verbatim (distinct from
   * findByProjectId, which has no status/type filter branch, and from
   * findByProjectAndType, which requires a post type).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByProjectFiltered(
    projectId: string,
    filters: { post_type_id?: string; status?: string } | undefined,
    trx?: QueryContext
  ): Promise<any[]> {
    let query = this.table(trx).where("project_id", projectId);
    if (filters?.post_type_id) {
      query = query.where("post_type_id", filters.post_type_id);
    }
    if (filters?.status) {
      query = query.where("status", filters.status);
    }
    return query.orderBy("sort_order", "asc").orderBy("created_at", "desc");
  }

  /**
   * Apply a partial column update to a post scoped to its project, stamping
   * updated_at via the DB clock. Mirrors the inline update in
   * service.post-manager.updatePost verbatim (caller builds the field bag,
   * pre-stringifying JSON columns). Distinct from updateFieldsById, which is not
   * project-scoped.
   */
  static async updateFieldsByIdAndProject(
    postId: string,
    projectId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: postId, project_id: projectId })
      .update({ ...fields, updated_at: db.fn.now() });
  }

  /**
   * Delete a post scoped to its project; returns the affected count. Mirrors
   * the inline delete in service.post-manager.deletePost.
   */
  static async deleteByIdAndProject(
    postId: string,
    projectId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: postId, project_id: projectId })
      .del();
  }

  /**
   * Fetch a post with a given project + post type + slug excluding one id (raw
   * row or undefined). Mirrors the slug-conflict check in
   * service.post-manager.updatePost verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findSlugConflict(
    projectId: string,
    postTypeId: string,
    slug: string,
    excludePostId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ project_id: projectId, post_type_id: postTypeId, slug })
      .whereNot("id", excludePostId)
      .first();
  }

  // ---- enrich joins (id/name/slug projections) ----

  /**
   * (id, name, slug) of categories assigned to a post via the assignment join.
   * Mirrors the category branch of service.post-manager.enrichPost verbatim.
   */
  static async findAssignedCategories(
    postId: string,
    trx?: QueryContext
  ): Promise<Array<{ id: string; name: string; slug: string }>> {
    return (trx || db)("website_builder.post_category_assignments")
      .join(
        "website_builder.post_categories",
        "website_builder.post_category_assignments.category_id",
        "website_builder.post_categories.id"
      )
      .where("website_builder.post_category_assignments.post_id", postId)
      .select(
        "website_builder.post_categories.id",
        "website_builder.post_categories.name",
        "website_builder.post_categories.slug"
      );
  }

  /**
   * (id, name, slug) of tags assigned to a post via the assignment join.
   * Mirrors the tag branch of service.post-manager.enrichPost verbatim.
   */
  static async findAssignedTags(
    postId: string,
    trx?: QueryContext
  ): Promise<Array<{ id: string; name: string; slug: string }>> {
    return (trx || db)("website_builder.post_tag_assignments")
      .join(
        "website_builder.post_tags",
        "website_builder.post_tag_assignments.tag_id",
        "website_builder.post_tags.id"
      )
      .where("website_builder.post_tag_assignments.post_id", postId)
      .select(
        "website_builder.post_tags.id",
        "website_builder.post_tags.name",
        "website_builder.post_tags.slug"
      );
  }

  /**
   * Attachments for a post, ordered order_index asc (full raw rows). Mirrors
   * the attachment branch of service.post-manager.enrichPost verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findAttachmentsByPostId(
    postId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return (trx || db)("website_builder.post_attachments")
      .where("post_id", postId)
      .orderBy("order_index", "asc");
  }

  // ---- assignment writes ----

  /**
   * Bulk-insert category assignments ({ post_id, category_id }). Mirrors the
   * inline insert in service.post-manager.createPost / updatePost verbatim.
   * Caller guards the empty-array case.
   */
  static async insertCategoryAssignments(
    rows: Array<{ post_id: string; category_id: string }>,
    trx?: QueryContext
  ): Promise<void> {
    await (trx || db)("website_builder.post_category_assignments").insert(rows);
  }

  /**
   * Delete all category assignments for a post. Mirrors the inline delete in
   * service.post-manager.updatePost verbatim.
   */
  static async deleteCategoryAssignmentsByPostId(
    postId: string,
    trx?: QueryContext
  ): Promise<number> {
    return (trx || db)("website_builder.post_category_assignments")
      .where("post_id", postId)
      .del();
  }

  /**
   * Bulk-insert tag assignments ({ post_id, tag_id }). Mirrors the inline
   * insert in service.post-manager.createPost / updatePost verbatim. Caller
   * guards the empty-array case.
   */
  static async insertTagAssignments(
    rows: Array<{ post_id: string; tag_id: string }>,
    trx?: QueryContext
  ): Promise<void> {
    await (trx || db)("website_builder.post_tag_assignments").insert(rows);
  }

  /**
   * Delete all tag assignments for a post. Mirrors the inline delete in
   * service.post-manager.updatePost verbatim.
   */
  static async deleteTagAssignmentsByPostId(
    postId: string,
    trx?: QueryContext
  ): Promise<number> {
    return (trx || db)("website_builder.post_tag_assignments")
      .where("post_id", postId)
      .del();
  }
}
