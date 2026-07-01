import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  Check,
  FileText,
  Loader2,
  X,
  Trash2,
  Pencil,
  ChevronDown,
  Hash,
  Sparkles,
  RefreshCw,
  RotateCcw,
  Eye,
  Search,
} from "lucide-react";
import {
  deletePageByPath,
  updatePageDisplayName,
} from "../../../api/websites";
import type { WebsiteProjectWithPages, WebsitePage, BulkSeoStatus } from "../../../api/websites";
import { toast } from "react-hot-toast";
import { ActionButton, BulkActionBar } from "../../../components/ui/DesignSystem";
import { useConfirm } from "../../../components/ui/ConfirmModal";
import { adminFetch } from "../../../api";
import { logger } from "../../../lib/logger";
import BulkSeoProgressPopover from "../../../components/PageEditor/SeoPanel/BulkSeoProgressPopover";
import {
  computeSeoScore,
  getGenStatusStyles,
  getPageStatusStyles,
  formatDateTime,
} from "../websiteDetail.utils";

type PageGroup = { path: string; pages: WebsitePage[] };

export function PagesTab({
  id,
  website,
  pageGroups,
  allPageSeoMeta,
  isGeneratingPage,
  isLive,
  isInProgress,
  isBulkSeoActive,
  bulkSeoStatus,
  expandedPaths,
  selectedPaths,
  editingName,
  nameInput,
  savingName,
  deletingPageId,
  deletingPagePath,
  confirm,
  invalidateWebsite,
  setWebsiteCache,
  setSelectedPaths,
  setEditingName,
  setNameInput,
  setSavingName,
  setShowFindReplaceModal,
  setShowCreatePageModal,
  togglePath,
  startBulkPageSeo,
  handleCancelGeneration,
  handleDeletePage,
  handleDeletePageVersion,
}: {
  id: string | undefined;
  website: WebsiteProjectWithPages;
  pageGroups: PageGroup[];
  allPageSeoMeta: { titles: string[]; descriptions: string[] };
  isGeneratingPage: boolean;
  isLive: boolean;
  isInProgress: boolean;
  isBulkSeoActive: boolean;
  bulkSeoStatus: BulkSeoStatus | null;
  expandedPaths: Set<string>;
  selectedPaths: Set<string>;
  editingName: string | null;
  nameInput: string;
  savingName: string | null;
  deletingPageId: string | null;
  deletingPagePath: string | null;
  confirm: ReturnType<typeof useConfirm>;
  invalidateWebsite: (uuid: string) => Promise<void>;
  setWebsiteCache: (uuid: string, data: WebsiteProjectWithPages) => unknown;
  setSelectedPaths: Dispatch<SetStateAction<Set<string>>>;
  setEditingName: Dispatch<SetStateAction<string | null>>;
  setNameInput: Dispatch<SetStateAction<string>>;
  setSavingName: Dispatch<SetStateAction<string | null>>;
  setShowFindReplaceModal: Dispatch<SetStateAction<boolean>>;
  setShowCreatePageModal: Dispatch<SetStateAction<boolean>>;
  togglePath: (path: string) => void;
  startBulkPageSeo: (paths?: string[]) => Promise<void>;
  handleCancelGeneration: () => void;
  handleDeletePage: (path: string, versionCount: number) => Promise<void>;
  handleDeletePageVersion: (pageId: string, pageGroup: PageGroup) => Promise<void>;
}) {
  const [isProgressPopoverOpen, setIsProgressPopoverOpen] = useState(false);

  return (
    <motion.div
      className="rounded-xl border border-gray-200 bg-white shadow-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Pages</h3>
          <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
            {pageGroups.length} {pageGroups.length === 1 ? "page" : "pages"}
          </span>
          {isGeneratingPage && (
            <span className="flex items-center gap-1.5 text-xs text-alloro-orange">
              <Loader2 className="w-3 h-3 animate-spin" />
              Generating...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pageGroups.length > 0 && (
            <button
              onClick={() => setShowFindReplaceModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-orange-50 hover:text-alloro-orange rounded-lg transition-colors"
              title="Find & replace text across all pages"
            >
              <Search className="w-3.5 h-3.5" />
              Find &amp; Replace
            </button>
          )}
          {/* Bulk SEO generation progress */}
          {isBulkSeoActive && bulkSeoStatus ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsProgressPopoverOpen((open) => !open)}
                className="flex items-center gap-1.5 text-xs text-alloro-orange font-medium hover:text-alloro-orange/80 transition-colors"
                title="View live per-page SEO generation progress"
              >
                <Loader2 className="w-3 h-3 animate-spin" />
                SEO {bulkSeoStatus.completed_count}/{bulkSeoStatus.total_count}
              </button>
              <BulkSeoProgressPopover
                items={bulkSeoStatus.item_statuses}
                isOpen={isProgressPopoverOpen}
                onOpenChange={setIsProgressPopoverOpen}
              />
            </div>
          ) : (
            pageGroups.length > 0 && (
              <button
                onClick={() => startBulkPageSeo()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-orange-50 hover:text-alloro-orange rounded-lg transition-colors"
                title="Generate SEO for all pages"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Generate SEO
              </button>
            )
          )}
          {(isLive || isInProgress) && website.template_id && (
            <ActionButton
              label={isGeneratingPage ? "Generating..." : "Create Page"}
              icon={
                isGeneratingPage ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )
              }
              onClick={() => setShowCreatePageModal(true)}
              variant="primary"
              size="sm"
              disabled={isGeneratingPage}
            />
          )}
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {pageGroups.length > 0 ? (
          pageGroups.map((group) => {
            const isExpanded = expandedPaths.has(group.path);
            const latestPage = group.pages[0]; // Already sorted desc
            const publishedPage = group.pages.find(
              (p) => p.status === "published",
            );
            const displayPage = publishedPage || latestPage;

            return (
              <div key={group.path}>
                {/* Page row (click to expand) */}
                <div
                  className={`w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-all text-left ${
                    selectedPaths.has(group.path) ? "bg-alloro-orange/5 border-l-2 border-l-alloro-orange" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Selection checkbox */}
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPaths((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.path)) next.delete(group.path);
                          else next.add(group.path);
                          return next;
                        });
                      }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="shrink-0"
                    >
                      {selectedPaths.has(group.path) ? (
                        <CheckCircle className="h-5 w-5 text-alloro-orange" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300 hover:border-gray-400 transition-colors" />
                      )}
                    </motion.button>
                    <button onClick={() => togglePath(group.path)} className="flex items-center gap-3 text-left flex-1 min-w-0">
                      <FileText className="h-5 w-5 text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        {editingName === group.path ? (
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const newName = nameInput.trim() || null;
                              setSavingName(group.path);
                              // Optimistic update — set name in cache immediately
                              setWebsiteCache(id!, {
                                ...website,
                                pages: website.pages.map((p) =>
                                  p.path === group.path ? { ...p, display_name: newName } : p
                                ),
                              });
                              try {
                                await updatePageDisplayName(id!, group.path, newName);
                              } finally {
                                setSavingName(null);
                                setEditingName(null);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1.5"
                          >
                            <input
                              type="text"
                              value={nameInput}
                              onChange={(e) => setNameInput(e.target.value)}
                              autoFocus
                              placeholder={group.path}
                              onKeyDown={(e) => { if (e.key === "Escape") setEditingName(null); }}
                              className="text-sm font-medium px-2 py-0.5 border border-alloro-orange/30 rounded focus:outline-none focus:ring-1 focus:ring-alloro-orange/30 w-48"
                              disabled={savingName === group.path}
                            />
                            {savingName === group.path ? (
                              <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
                            ) : (
                              <>
                                <button type="submit" className="p-0.5 text-green-500 hover:text-green-600 transition-colors" title="Save">
                                  <Check className="w-4 h-4" />
                                </button>
                                <button type="button" onClick={() => setEditingName(null)} className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors" title="Cancel">
                                  <X className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </form>
                        ) : (
                          <div
                            className="flex items-baseline gap-1.5 cursor-text truncate"
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingName(group.path);
                              setNameInput(displayPage.display_name || "");
                            }}
                            title="Double-click to rename"
                          >
                            <span className="font-medium text-gray-900">
                              {displayPage.display_name || group.path}
                            </span>
                            {displayPage.display_name && (
                              <span className="text-xs text-gray-400 font-normal">{group.path}</span>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-gray-500">
                          {group.pages.length}{" "}
                          {group.pages.length === 1 ? "version" : "versions"}
                        </p>
                      </div>
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* SEO Score — use displayPage (published or latest) */}
                    {(() => {
                      const seoPage = displayPage;
                      const sibTitles = allPageSeoMeta.titles.filter((t) => t !== (seoPage.seo_data?.meta_title || ""));
                      const sibDescs = allPageSeoMeta.descriptions.filter((d) => d !== (seoPage.seo_data?.meta_description || ""));
                      const seoScore = computeSeoScore(seoPage.seo_data, sibTitles, sibDescs, website.wrapper || "");
                      return (
                        <div className="flex items-center gap-1.5" title={`SEO: ${seoScore.score}/${seoScore.max}`}>
                          <div className="w-8 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${seoScore.barClass}`}
                              style={{ width: `${seoScore.pct}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-bold tabular-nums ${seoScore.colorClass}`}>
                            {seoScore.pct > 0 ? seoScore.pct : "—"}
                          </span>
                        </div>
                      );
                    })()}
                    {displayPage.generation_status && displayPage.generation_status !== "ready" ? (
                      <>
                        {(displayPage.generation_status === "generating" || displayPage.generation_status === "queued") && (
                          <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />
                        )}
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getGenStatusStyles(displayPage.generation_status)}`}
                        >
                          {displayPage.generation_status}
                        </span>
                        {(displayPage.generation_status === "generating" || displayPage.generation_status === "queued") && (
                          <>
                            <Link
                              to={`/admin/websites/${id}/pages/${displayPage.id}/edit`}
                              onClick={(e) => e.stopPropagation()}
                              title="Watch sections come in live"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-alloro-orange/30 bg-orange-50 px-3 py-1.5 text-xs font-medium text-alloro-orange transition hover:bg-orange-100"
                            >
                              <Eye className="h-3 w-3" />
                              Preview
                            </Link>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelGeneration();
                              }}
                              title="Stop generation"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100 hover:border-gray-300"
                            >
                              <X className="h-3 w-3" />
                              Stop
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePage(group.path, group.pages.length);
                              }}
                              disabled={deletingPagePath === group.path}
                              title="Delete this page"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                            >
                              {deletingPagePath === group.path ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                              Delete
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getPageStatusStyles(displayPage.status)}`}
                        >
                          {displayPage.status}
                        </span>
                        {(displayPage.status === "published" ||
                          displayPage.status === "draft") && (
                          <Link
                            to={`/admin/websites/${id}/pages/${displayPage.id}/edit`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100 hover:border-gray-300"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </Link>
                        )}
                      </>
                    )}
                    <button onClick={() => togglePath(group.path)}>
                      <ChevronDown
                        className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                </div>

                {/* Expanded version list */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-gray-50 border-t border-gray-100">
                        {group.pages.map((page) => {
                          const canDelete =
                            page.status !== "published" &&
                            group.pages.length > 1;
                          return (
                            <div
                              key={page.id}
                              className="flex items-center justify-between px-5 py-3 pl-14 border-b border-gray-100 last:border-b-0"
                            >
                              <div className="flex items-center gap-3">
                                <Hash className="h-3.5 w-3.5 text-gray-400" />
                                <span className="text-sm font-medium text-gray-700">
                                  v{page.version}
                                </span>
                                {page.generation_status && page.generation_status !== "ready" ? (
                                  <>
                                    {(page.generation_status === "generating" || page.generation_status === "queued") && (
                                      <Loader2 className="h-3 w-3 text-amber-500 animate-spin" />
                                    )}
                                    <span
                                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getGenStatusStyles(page.generation_status)}`}
                                    >
                                      {page.generation_status}
                                    </span>
                                  </>
                                ) : (
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getPageStatusStyles(page.status)}`}
                                  >
                                    {page.status}
                                  </span>
                                )}
                                <span className="text-xs text-gray-400">
                                  {formatDateTime(page.updated_at)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {(!page.generation_status || page.generation_status === "ready") &&
                                  (page.status === "published" ||
                                  page.status === "draft") && (
                                  <Link
                                    to={`/admin/websites/${id}/pages/${page.id}/edit`}
                                    className="text-xs text-gray-500 hover:text-alloro-orange transition-colors"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Link>
                                )}
                                {page.status === "inactive" && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const ok = await confirm({
                                        title: `Revert to v${page.version}?`,
                                        message: "This will create a new draft from this version's content. The current published version will remain live until you publish the draft.",
                                        confirmLabel: "Revert",
                                      });
                                      if (!ok) return;
                                      try {
                                        // Create a new page version with this version's sections
                                        await adminFetch(`/api/admin/websites/${id}/pages`, {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({
                                            path: page.path,
                                            sections: page.sections,
                                          }),
                                        });
                                        invalidateWebsite(id!);
                                        toast.success(`Created draft from v${page.version}`);
                                      } catch {
                                        toast.error("Failed to revert");
                                      }
                                    }}
                                    className="text-xs text-gray-400 hover:text-alloro-orange transition-colors"
                                    title="Revert to this version"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    onClick={() =>
                                      handleDeletePageVersion(
                                        page.id,
                                        group,
                                      )
                                    }
                                    disabled={deletingPageId === page.id}
                                    className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                    title="Delete this version"
                                  >
                                    {deletingPageId === page.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3 w-3" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {/* Delete entire page */}
                        <div className="px-5 py-2.5 pl-14 border-t border-gray-200 bg-gray-50/80">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePage(
                                group.path,
                                group.pages.length,
                              );
                            }}
                            disabled={deletingPagePath === group.path}
                            className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          >
                            {deletingPagePath === group.path ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            Delete page and all versions
                          </button>
                          {group.pages.filter((p) => p.status === "inactive").length > 5 && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const inactiveVersions = group.pages.filter((p) => p.status === "inactive");
                                const toDelete = inactiveVersions.slice(5); // Keep latest 5 inactive
                                const ok = await confirm({
                                  title: `Clean up ${toDelete.length} old version(s)?`,
                                  message: `Keep the 5 most recent inactive versions and delete ${toDelete.length} older ones. Published and draft versions are not affected.`,
                                  confirmLabel: "Clean Up",
                                });
                                if (!ok) return;
                                for (const v of toDelete) {
                                  await adminFetch(`/api/admin/websites/${id}/pages/${v.id}`, { method: "DELETE" }).catch(() => {});
                                }
                                invalidateWebsite(id!);
                                toast.success(`Cleaned up ${toDelete.length} old version(s)`);
                              }}
                              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-alloro-orange transition-colors ml-4"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Clean up old versions ({group.pages.filter((p) => p.status === "inactive").length - 5} removable)
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-gray-500">
            <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p>No pages created yet</p>
          </div>
        )}
      </div>

      {/* Bulk action bar — uses shared BulkActionBar component */}
      <BulkActionBar
        selectedCount={selectedPaths.size}
        totalCount={pageGroups.length}
        onSelectAll={() => setSelectedPaths(new Set(pageGroups.map((g) => g.path)))}
        onDeselectAll={() => setSelectedPaths(new Set())}
        isAllSelected={selectedPaths.size === pageGroups.length && pageGroups.length > 0}
        actions={[
          {
            label: "Generate SEO",
            icon: <Sparkles className="w-4 h-4" />,
            onClick: () => {
              startBulkPageSeo(Array.from(selectedPaths));
              setSelectedPaths(new Set());
            },
            variant: "primary" as const,
            disabled: isBulkSeoActive,
          },
          {
            label: "Publish",
            icon: <Check className="w-4 h-4" />,
            onClick: async () => {
              let published = 0;
              let failed = 0;
              for (const path of selectedPaths) {
                const group = pageGroups.find((g) => g.path === path);
                // Find draft, or if only version exists use latest regardless of status
                const target = group?.pages.find((p) => p.status === "draft") || group?.pages[0];
                if (target && target.status !== "published") {
                  try {
                    const res = await adminFetch(`/api/admin/websites/${id}/pages/${target.id}/publish`, { method: "POST" });
                    if (res.ok) {
                      published++;
                    } else {
                      const err = await res.json().catch(() => ({}));
                      logger.error(`Failed to publish ${path}:`, err);
                      failed++;
                    }
                  } catch {
                    failed++;
                  }
                }
              }
              invalidateWebsite(id!);
              setSelectedPaths(new Set());
              if (published > 0) toast.success(`Published ${published} page(s)`);
              if (failed > 0) toast.error(`Failed to publish ${failed} page(s)`);
            },
            variant: "secondary" as const,
          },
          {
            label: "Delete",
            icon: <Trash2 className="w-4 h-4" />,
            onClick: async () => {
              const ok = await confirm({
                title: `Delete ${selectedPaths.size} page(s)?`,
                message: "This will delete all versions of the selected pages. This action cannot be undone.",
                confirmLabel: "Delete",
                variant: "danger",
              });
              if (!ok) return;
              for (const path of selectedPaths) {
                await deletePageByPath(id!, path);
              }
              invalidateWebsite(id!);
              setSelectedPaths(new Set());
              toast.success(`Deleted ${selectedPaths.size} page(s)`);
            },
            variant: "danger" as const,
          },
        ]}
      />
    </motion.div>
  );
}
