import { useState, type ReactNode } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  RefreshCw,
  AlertCircle,
  Loader2,
  Globe,
  Trash2,
  ExternalLink,
  Clock,
  Building2,
  Plus,
  Circle,
  CheckCircle,
  Pencil,
  Check,
  X,
  Archive,
} from "lucide-react";
import {
  deleteWebsite,
  createWebsite,
  updateWebsite,
} from "../../api/websites";
import type {
  WebsiteProject,
  FetchWebsitesRequest,
  WebsiteProjectListView,
} from "../../api/websites";
import { useAdminWebsites, useAdminStatuses, useInvalidateAdminWebsites } from "../../hooks/queries/useAdminQueries";
import {
  AdminPageHeader,
  FilterBar,
  BulkActionBar,
  EmptyState,
  Badge,
  ActionButton,
  TabBar,
} from "../../components/ui/DesignSystem";
import { useConfirm } from "../../components/ui/ConfirmModal";
import { ActiveIntegrationLogos } from "../../components/Admin/integrations/ActiveIntegrationLogos";
import { logger } from "../../lib/logger";

const INITIAL_PROJECT_LIST_VIEW: WebsiteProjectListView = "active";

const WEBSITE_PROJECT_LIST_TABS: Array<{
  id: WebsiteProjectListView;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    id: "active",
    label: "Active",
    description: "Attached to an org",
    icon: <Building2 className="h-4 w-4" />,
  },
  {
    id: "inactive",
    label: "Inactive",
    description: "No org yet",
    icon: <Circle className="h-4 w-4" />,
  },
  {
    id: "archive",
    label: "Archive",
    description: "Admin hidden",
    icon: <Archive className="h-4 w-4" />,
  },
];

function buildWebsiteFilters(
  projectListView: WebsiteProjectListView,
  selectedStatus: string,
): FetchWebsitesRequest {
  const nextFilters: FetchWebsitesRequest = {
    page: 1,
    limit: 50,
    projectListView,
  };

  if (selectedStatus !== "all") {
    nextFilters.status = selectedStatus;
  }

  return nextFilters;
}

/**
 * Websites List Page
 * Admin portal to view and manage website-builder projects
 */
export default function WebsitesList() {
  const navigate = useNavigate();
  const confirm = useConfirm();

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOperationLoading, setBulkOperationLoading] = useState(false);

  // Action loading states
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Favicon load failure tracking
  const [failedFavicons, setFailedFavicons] = useState<Set<string>>(new Set());

  // Inline display-name editing
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  // Filter states
  const [activeProjectListView, setActiveProjectListView] =
    useState<WebsiteProjectListView>(INITIAL_PROJECT_LIST_VIEW);
  const [filters, setFilters] = useState<FetchWebsitesRequest>({
    page: 1,
    limit: 50,
    projectListView: INITIAL_PROJECT_LIST_VIEW,
  });
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // TanStack Query hooks
  const { data: websitesResponse, isLoading: loading, error: queryError, isFetching } = useAdminWebsites(filters);
  const { data: statusesResponse } = useAdminStatuses();
  const { invalidateAll: refetchWebsites } = useInvalidateAdminWebsites();

  const websites = websitesResponse?.data ?? [];
  const totalPages = websitesResponse?.pagination?.totalPages ?? 1;
  const total = websitesResponse?.pagination?.total ?? 0;
  const statuses = statusesResponse?.statuses ?? [];
  const error = queryError?.message ?? null;
  const activeViewLabel =
    activeProjectListView === "archive" ? "archived" : activeProjectListView;
  const emptyStateTitle =
    activeProjectListView === "archive"
      ? "No archived websites found"
      : activeProjectListView === "active"
      ? "No active websites found"
      : "No inactive websites found";
  const emptyStateDescription =
    activeProjectListView === "archive"
      ? "No archived website projects match the selected filters."
      : activeProjectListView === "active"
      ? "No organization-linked websites match the selected filters. Try adjusting your filters or create a new website."
      : "No unassigned websites match the selected filters. Try adjusting your filters or create a new website.";

  const applyFilters = () => {
    setFilters(buildWebsiteFilters(activeProjectListView, selectedStatus));
  };

  const resetFilters = () => {
    setSelectedStatus("all");
    setFilters(buildWebsiteFilters(activeProjectListView, "all"));
  };

  const handleProjectListViewChange = (tabId: string) => {
    if (tabId !== "active" && tabId !== "inactive" && tabId !== "archive") return;

    setActiveProjectListView(tabId);
    setSelectedIds(new Set());
    setFilters(buildWebsiteFilters(tabId, selectedStatus));
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (deletingId) return;
    const ok = await confirm({ title: "Delete website project?", message: "This will also delete all its pages.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;

    try {
      setDeletingId(id);
      await deleteWebsite(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await refetchWebsites();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete website");
    } finally {
      setDeletingId(null);
    }
  };

  const handleArchive = async (website: WebsiteProject, e: React.MouseEvent) => {
    e.stopPropagation();
    if (archivingId) return;

    const ok = await confirm({
      title: "Archive website project?",
      message: "This only changes the admin list label. Organization links, custom domains, and live status stay intact.",
      confirmLabel: "Archive",
    });
    if (!ok) return;

    try {
      setArchivingId(website.id);
      await updateWebsite(website.id, {
        archived_at: new Date().toISOString(),
      } as Partial<WebsiteProject>);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(website.id);
        return next;
      });
      await refetchWebsites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive website");
    } finally {
      setArchivingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({ title: `Delete ${selectedIds.size} website(s)?`, message: "This will also delete all their pages.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;

    try {
      setBulkOperationLoading(true);
      for (const id of selectedIds) {
        await deleteWebsite(id);
      }
      setSelectedIds(new Set());
      await refetchWebsites();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete websites");
    } finally {
      setBulkOperationLoading(false);
    }
  };

  const handleCreate = async () => {
    if (creating) return;

    try {
      setCreating(true);
      const response = await createWebsite({});
      await refetchWebsites();
      // After 1 second, navigate to the new website detail page
      setTimeout(() => {
        navigate(`/admin/websites/${response.data.id}`);
      }, 1000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create website");
    } finally {
      setCreating(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
    setSelectedIds(new Set());
  };

  const toggleSelectWebsite = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleCardClick = (id: string) => {
    navigate(`/admin/websites/${id}`);
  };

  const startEditingName = (website: WebsiteProject, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingNameId(website.id);
    setEditingNameValue(website.display_name || website.generated_hostname);
  };

  const cancelEditingName = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingNameId(null);
    setEditingNameValue("");
  };

  const saveDisplayName = async (id: string, e?: React.MouseEvent | React.FormEvent) => {
    if (e) e.stopPropagation();
    if (e && "preventDefault" in e) e.preventDefault();
    const trimmed = editingNameValue.trim();
    if (!trimmed) return;

    try {
      await updateWebsite(id, { display_name: trimmed } as Partial<WebsiteProject>);
      await refetchWebsites();
    } catch (err) {
      logger.error("Failed to update display name:", err);
    } finally {
      setEditingNameId(null);
      setEditingNameValue("");
    }
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return "just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const getStatusStyles = (status: string): string => {
    switch (status) {
      case "LIVE":
        return "border-green-200 bg-green-100 text-green-700";
      case "IN_PROGRESS":
        return "border-yellow-200 bg-yellow-100 text-yellow-700";
      case "CREATED":
        return "border-gray-200 bg-gray-100 text-gray-700";
      default:
        return "border-gray-200 bg-gray-100 text-gray-700";
    }
  };

  // Get icon background color based on status - subtle backgrounds with glow
  const getIconStyles = (status: string): string => {
    switch (status) {
      case "LIVE":
        return "bg-green-100 shadow-[0_0_12px_rgba(34,197,94,0.4)]";
      case "CREATED":
        return "bg-gray-100";
      default:
        return "bg-orange-100 shadow-[0_0_12px_rgba(214,104,83,0.4)]";
    }
  };

  // Get icon color based on status
  const getIconColor = (status: string): string => {
    switch (status) {
      case "LIVE":
        return "text-green-600";
      case "CREATED":
        return "text-gray-400";
      default:
        return "text-alloro-orange";
    }
  };

  // Check if status is a processing state (should show spinner)
  const isProcessingStatus = (status: string): boolean => {
    return !["LIVE", "CREATED"].includes(status);
  };

  const formatStatus = (status: string): string => {
    return status
      .split("_")
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(" ");
  };

  // Extract business name — prefer project_identity.business.name, fall back to legacy step_gbp_scrape
  const getBusinessName = (website: WebsiteProject): string | null => {
    const identity = website.project_identity as Record<string, unknown> | null | undefined;
    const businessObj = identity && typeof identity === "object"
      ? (identity as { business?: Record<string, unknown> }).business
      : null;
    const fromIdentity = businessObj && typeof businessObj === "object"
      ? (businessObj.name as string | undefined)
      : undefined;
    if (fromIdentity) return fromIdentity;

    if (website.step_gbp_scrape && typeof website.step_gbp_scrape === "object") {
      const gbpData = website.step_gbp_scrape as Record<string, unknown>;
      if (gbpData.name && typeof gbpData.name === "string") return gbpData.name;
      if (gbpData.title && typeof gbpData.title === "string") return gbpData.title as string;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        icon={<Globe className="w-6 h-6" />}
        title="Websites"
        description="Manage website builder projects"
        actionButtons={
          <div className="flex items-center gap-2">
            <Badge label={`${total} ${activeViewLabel}`} color="blue" />
            <ActionButton
              label={creating ? "Creating..." : "New Website"}
              icon={
                creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )
              }
              onClick={handleCreate}
              variant="primary"
              disabled={creating}
            />
            <ActionButton
              label={isFetching ? "Loading" : "Refresh"}
              icon={
                <RefreshCw
                  className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
                />
              }
              onClick={() => refetchWebsites()}
              variant="secondary"
              disabled={isFetching}
              loading={isFetching}
            />
          </div>
        }
      />

      <div className="flex">
        <TabBar
          tabs={WEBSITE_PROJECT_LIST_TABS}
          activeTab={activeProjectListView}
          onTabChange={handleProjectListViewChange}
        />
      </div>

      {/* Bulk Actions Bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        totalCount={websites.length}
        onSelectAll={() => setSelectedIds(new Set(websites.map((w) => w.id)))}
        onDeselectAll={() => setSelectedIds(new Set())}
        isAllSelected={
          selectedIds.size === websites.length && websites.length > 0
        }
        actions={
          <ActionButton
            label="Delete"
            icon={<Trash2 className="w-4 h-4" />}
            onClick={handleBulkDelete}
            variant="danger"
            size="sm"
            disabled={bulkOperationLoading}
            loading={bulkOperationLoading}
          />
        }
      />

      {/* Filters */}
      <FilterBar>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Status
            </span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
            >
              <option value="all">All Statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 self-end">
            <ActionButton
              label="Apply"
              onClick={applyFilters}
              variant="primary"
            />
            <ActionButton
              label="Reset"
              onClick={resetFilters}
              variant="secondary"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (selectedIds.size === websites.length && websites.length > 0) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(websites.map((w) => w.id)));
              }
            }}
            disabled={websites.length === 0}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {selectedIds.size === websites.length && websites.length > 0 ? (
              <CheckCircle className="h-4 w-4 text-blue-600" />
            ) : (
              <Circle className="h-4 w-4 text-gray-400" />
            )}
            {selectedIds.size === websites.length && websites.length > 0
              ? "Deselect All"
              : "Select All"}
          </button>
        </div>
      </FilterBar>

      {/* Error State */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">
                Error loading websites
              </p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <ActionButton
              label="Retry"
              onClick={() => refetchWebsites()}
              variant="danger"
              size="sm"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading State - use top bar only */}
      {loading && websites.length === 0 ? null : websites.length === 0 ? (
        <EmptyState
          icon={<Globe className="w-12 h-12" />}
          title={emptyStateTitle}
          description={emptyStateDescription}
          action={{ label: "Create Website", onClick: handleCreate }}
        />
      ) : (
        /* Websites List */
        <div className="space-y-3">
          {websites.map((website, index) => {
            const businessName = getBusinessName(website);
            const siteUrl = website.custom_domain
              ? `https://${website.custom_domain}`
              : `https://${website.generated_hostname}.sites.getalloro.com`;
            const siteDomain = website.custom_domain
              || `${website.generated_hostname}.sites.getalloro.com`;
            const displayLabel = website.display_name || website.generated_hostname;

            return (
              <motion.div
                key={website.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                onClick={() => handleCardClick(website.id)}
                className={`rounded-xl border bg-white shadow-sm transition-all hover:shadow-md cursor-pointer ${
                  selectedIds.has(website.id)
                    ? "border-blue-300 ring-2 ring-blue-100"
                    : "border-gray-200"
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Selection checkbox */}
                    <motion.div
                      className="mt-1 flex-shrink-0"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectWebsite(website.id);
                      }}
                    >
                      {selectedIds.has(website.id) ? (
                        <CheckCircle className="h-5 w-5 text-blue-600" />
                      ) : (
                        <Circle className="h-5 w-5 text-gray-300" />
                      )}
                    </motion.div>

                    {/* Icon - color based on status with subtle background and glow */}
                    <div
                      className={`flex-shrink-0 w-10 h-10 rounded-lg ${getIconStyles(website.status)} flex items-center justify-center transition-shadow`}
                    >
                      {isProcessingStatus(website.status) ? (
                        <Loader2 className={`w-5 h-5 ${getIconColor(website.status)} animate-spin`} />
                      ) : website.status === "LIVE" && !failedFavicons.has(siteDomain) ? (
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${siteDomain}&sz=64`}
                          alt=""
                          className="w-5 h-5 rounded-sm"
                          onError={() => setFailedFavicons(prev => new Set(prev).add(siteDomain))}
                        />
                      ) : (
                        <Globe className={`w-5 h-5 ${getIconColor(website.status)}`} />
                      )}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      {/* Top row: Hostname and status badge */}
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          {editingNameId === website.id ? (
                            <form
                              onSubmit={(e) => saveDisplayName(website.id, e)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1.5"
                            >
                              <input
                                autoFocus
                                value={editingNameValue}
                                onChange={(e) => setEditingNameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") cancelEditingName();
                                }}
                                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-base font-semibold text-gray-900 focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
                              />
                              <button
                                type="submit"
                                className="rounded-md p-1 text-green-600 hover:bg-green-50 transition-colors"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingName}
                                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 transition-colors"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-1.5 group/name">
                              <span className="text-base font-semibold text-gray-900">
                                {displayLabel}
                              </span>
                              <ActiveIntegrationLogos
                                integrations={website.active_integrations ?? []}
                              />
                              <button
                                onClick={(e) => startEditingName(website, e)}
                                className="rounded-md p-1 text-gray-300 opacity-0 group-hover/name:opacity-100 hover:text-gray-500 hover:bg-gray-100 transition-all"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                          {businessName && (
                            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5" />
                              {businessName}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Organization badge */}
                          {website.organization && (
                            <Link
                              to={`/admin/organization-management`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 text-xs text-gray-600 bg-purple-50 border border-purple-200 rounded-full px-2.5 py-1 hover:bg-purple-100 transition-colors"
                            >
                              <Building2 className="h-3 w-3 text-purple-600" />
                              {website.organization.name}
                            </Link>
                          )}
                          {!website.organization && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
                              <Building2 className="h-3 w-3" />
                              No organization
                            </span>
                          )}
                          {/* Status badge */}
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyles(website.status)}`}
                          >
                            {isProcessingStatus(website.status) && (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            )}
                            {formatStatus(website.status)}
                          </span>
                        </div>
                      </div>

                      {/* Metadata row */}
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        {/* Created */}
                        <div className="flex items-center gap-1.5 text-gray-500">
                          <Clock className="h-3.5 w-3.5 text-gray-400" />
                          <span>{formatRelativeTime(website.created_at)}</span>
                        </div>

                        {/* Domain link - only show for live sites */}
                        {website.status === "LIVE" && (
                          <a
                            href={siteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span className="truncate max-w-[200px]">
                              {siteDomain}
                            </span>
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      className="flex items-center gap-2 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* View Live Site */}
                      {website.status === "LIVE" ? (
                        <a
                          href={siteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-600 transition hover:border-green-300 hover:bg-green-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View Site
                        </a>
                      ) : null}

                      {!website.archived_at && (
                        archivingId === website.id ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Archiving...
                          </span>
                        ) : (
                          <motion.button
                            onClick={(e) => handleArchive(website, e)}
                            disabled={archivingId !== null}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <Archive className="h-3.5 w-3.5" />
                            Archive
                          </motion.button>
                        )
                      )}

                      {/* Delete */}
                      {deletingId === website.id ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Deleting...
                        </span>
                      ) : (
                        <motion.button
                          onClick={(e) => handleDelete(website.id, e)}
                          disabled={deletingId !== null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <motion.div
          className="flex items-center justify-between pt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ActionButton
            label="Previous"
            onClick={() =>
              handlePageChange(Math.max(1, (filters.page || 1) - 1))
            }
            variant="secondary"
            disabled={(filters.page || 1) === 1 || loading}
          />
          <span className="text-sm text-gray-600">
            Page {filters.page || 1} of {totalPages} ({total} total)
          </span>
          <ActionButton
            label="Next"
            onClick={() =>
              handlePageChange(Math.min(totalPages, (filters.page || 1) + 1))
            }
            variant="secondary"
            disabled={(filters.page || 1) === totalPages || loading}
          />
        </motion.div>
      )}

      {/* Summary Stats */}
      {!loading && !error && websites.length > 0 && (
        <motion.div
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-sm text-gray-600">
            Showing {websites.length} of {total} {activeViewLabel} website
            {total !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-alloro-orange" />
              <span className="text-gray-600">
                <strong className="text-gray-900">
                  {websites.filter((w) => w.status === "LIVE").length}
                </strong>{" "}
                live
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-yellow-400" />
              <span className="text-gray-600">
                <strong className="text-gray-900">
                  {
                    websites.filter(
                      (w) => !["LIVE", "CREATED"].includes(w.status)
                    ).length
                  }
                </strong>{" "}
                processing
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-gray-400" />
              <span className="text-gray-600">
                <strong className="text-gray-900">
                  {websites.filter((w) => w.status === "CREATED").length}
                </strong>{" "}
                created
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
