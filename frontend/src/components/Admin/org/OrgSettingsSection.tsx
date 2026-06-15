import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Settings,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Loader2,
  X,
  MapPin,
  CheckCircle,
  Clock,
  Eye,
  Archive,
  RotateCcw,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import type { AdminOrganizationDetail } from "../../api/admin-organizations";
import {
  adminDeleteOrganization,
  adminArchiveOrganization,
  adminGetBusinessData,
  adminRefreshBusinessData,
  adminSyncOrgBusinessData,
  adminUnarchiveOrganization,
} from "../../api/admin-organizations";
import { OrgRecipientSettingsSection } from "./OrgRecipientSettingsSection";

interface OrgSettingsSectionProps {
  org: AdminOrganizationDetail;
  orgId: number;
  onRefresh?: () => Promise<void> | void;
}

type ApiErrorLike = {
  response?: { data?: { error?: string; message?: string } };
  message?: string;
};

function getApiErrorMessage(error: unknown, fallback: string): string {
  const typedError = error as ApiErrorLike;
  return (
    typedError.response?.data?.error ||
    typedError.response?.data?.message ||
    typedError.message ||
    fallback
  );
}

export function OrgSettingsSection({ org, orgId, onRefresh }: OrgSettingsSectionProps) {
  const navigate = useNavigate();
  const isArchived = Boolean(org.archived_at);
  const archiveDate = org.archived_at
    ? new Date(org.archived_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [isArchiving, setIsArchiving] = useState(false);
  const [isUnarchiving, setIsUnarchiving] = useState(false);

  // Business data state
  const [businessData, setBusinessData] = useState<{
    organization: {
      id: number;
      name: string;
      business_data: Record<string, unknown> | null;
    };
    locations: Array<{
      id: number;
      name: string;
      is_primary: boolean;
      business_data: Record<string, unknown> | null;
    }>;
  } | null>(null);
  const [loadingBusinessData, setLoadingBusinessData] = useState(true);
  const [refreshingLocationId, setRefreshingLocationId] = useState<
    number | null
  >(null);
  const [syncingOrgData, setSyncingOrgData] = useState(false);
  const [viewingData, setViewingData] = useState<{
    locationName: string;
    data: Record<string, unknown>;
  } | null>(null);

  const loadBusinessData = useCallback(async () => {
    try {
      setLoadingBusinessData(true);
      const data = await adminGetBusinessData(orgId);
      setBusinessData(data);
    } catch {
      // Silently fail — section still shows without data
      setBusinessData(null);
    } finally {
      setLoadingBusinessData(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadBusinessData();
  }, [loadBusinessData]);

  const handleRefreshLocation = async (locationId: number) => {
    setRefreshingLocationId(locationId);
    try {
      const result = await adminRefreshBusinessData(orgId, locationId);
      if (result.success) {
        toast.success("Business data refreshed from Google");
        await loadBusinessData();
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Failed to refresh business data"));
    } finally {
      setRefreshingLocationId(null);
    }
  };

  const handleSyncOrgData = async () => {
    setSyncingOrgData(true);
    try {
      const result = await adminSyncOrgBusinessData(orgId);
      if (result.success) {
        toast.success("Organization business data synced from primary location");
        await loadBusinessData();
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Failed to sync org business data"));
    } finally {
      setSyncingOrgData(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== org.name) return;
    setIsDeleting(true);

    try {
      await adminDeleteOrganization(orgId);
      toast.success(`"${org.name}" has been permanently deleted`);
      navigate("/admin/organization-management");
    } catch {
      toast.error("Failed to delete organization");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      const response = await adminArchiveOrganization(orgId, archiveReason);
      const data = response.data;
      toast.success(
        `Archived ${org.name}: ${data.archivedProjects} site${
          data.archivedProjects === 1 ? "" : "s"
        } archived`
      );
      setArchiveConfirm(false);
      setArchiveReason("");
      await onRefresh?.();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Failed to archive organization"));
    } finally {
      setIsArchiving(false);
    }
  };

  const handleUnarchive = async () => {
    setIsUnarchiving(true);
    try {
      await adminUnarchiveOrganization(orgId);
      toast.success(`"${org.name}" has been restored`);
      await onRefresh?.();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Failed to restore organization"));
    } finally {
      setIsUnarchiving(false);
    }
  };

  const formatRefreshedAt = (data: Record<string, unknown> | null): string => {
    if (!data?.refreshed_at) return "Never refreshed";
    const date = new Date(data.refreshed_at as string);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const hasConnections = (org.connections || []).length > 0;

  return (
    <div className="space-y-6">
      <OrgRecipientSettingsSection orgId={orgId} />

      {/* Business Data Management */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-gray-200 bg-white p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-5 w-5 text-gray-700" />
          <h3 className="font-semibold text-gray-900">Business Data</h3>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Business data is used for SEO generation. Refresh from Google to pull
          the latest name, address, phone, hours, and categories from the
          connected GBP profile.
        </p>

        {!hasConnections && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            No Google connection linked to this organization. Business data
            cannot be refreshed until a Google account is connected.
          </div>
        )}

        {loadingBusinessData ? (
          <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading business data...
          </div>
        ) : businessData ? (
          <div className="space-y-3">
            {/* Organization (Umbrella) Business Data */}
            {(() => {
              const orgBd = businessData.organization
                .business_data as Record<string, unknown> | null;
              const hasOrgData = !!orgBd;
              const hasPrimary = businessData.locations.some(
                (l) => l.is_primary && l.business_data
              );

              return (
                <div className="rounded-lg border-2 border-alloro-orange/30 bg-orange-50/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Settings className="h-4 w-4 text-alloro-orange shrink-0" />
                        <span className="text-sm font-semibold text-gray-900">
                          Organization (Umbrella)
                        </span>
                        <span className="text-[10px] font-bold text-alloro-orange bg-orange-50 border border-alloro-orange/30 rounded-full px-2 py-0.5">
                          SEO Context
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Used as fallback context for SEO generation on generic
                        pages (homepage, about, etc.) when "Organization-wide"
                        is selected.
                      </p>

                      <div className="mt-2 flex items-center gap-2">
                        {hasOrgData ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700">
                            <CheckCircle className="h-3 w-3" />
                            Data available
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="h-3 w-3" />
                            No data synced
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {formatRefreshedAt(orgBd)}
                        </span>
                      </div>

                      {hasOrgData && orgBd && (
                        <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                          {orgBd.name ? (
                            <p>
                              <strong>Name:</strong> {orgBd.name as string}
                            </p>
                          ) : null}
                          {orgBd.phone ? (
                            <p>
                              <strong>Phone:</strong> {orgBd.phone as string}
                            </p>
                          ) : null}
                          {(orgBd.address as Record<string, unknown>)?.city ? (
                            <p>
                              <strong>City:</strong>{" "}
                              {
                                (orgBd.address as Record<string, unknown>)
                                  .city as string
                              }
                              ,{" "}
                              {
                                (orgBd.address as Record<string, unknown>)
                                  .state as string
                              }
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {hasOrgData && orgBd && (
                        <button
                          onClick={() =>
                            setViewingData({
                              locationName: `${businessData.organization.name} (Umbrella)`,
                              data: orgBd,
                            })
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          See More
                        </button>
                      )}
                      <button
                        onClick={handleSyncOrgData}
                        disabled={syncingOrgData || !hasPrimary}
                        title={
                          !hasPrimary
                            ? "Refresh a primary location first"
                            : "Copy primary location data to org level"
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-alloro-orange hover:bg-alloro-orange/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {syncingOrgData ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        {syncingOrgData
                          ? "Syncing..."
                          : "Sync from Primary Location"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Location-Level Business Data */}
            {businessData.locations.map((loc) => {
              const bd = loc.business_data as Record<string, unknown> | null;
              const hasData = !!bd;
              const isRefreshing = refreshingLocationId === loc.id;

              return (
                <div
                  key={loc.id}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {loc.name}
                        </span>
                        {loc.is_primary && (
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                            Primary
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        {hasData ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700">
                            <CheckCircle className="h-3 w-3" />
                            Data available
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="h-3 w-3" />
                            No data
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {formatRefreshedAt(bd)}
                        </span>
                      </div>

                      {hasData && bd && (
                        <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                          {bd.name ? (
                            <p>
                              <strong>Name:</strong> {bd.name as string}
                            </p>
                          ) : null}
                          {bd.phone ? (
                            <p>
                              <strong>Phone:</strong> {bd.phone as string}
                            </p>
                          ) : null}
                          {(bd.address as Record<string, unknown>)?.city ? (
                            <p>
                              <strong>City:</strong>{" "}
                              {
                                (bd.address as Record<string, unknown>)
                                  .city as string
                              }
                              ,{" "}
                              {
                                (bd.address as Record<string, unknown>)
                                  .state as string
                              }
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {hasData && bd && (
                        <button
                          onClick={() =>
                            setViewingData({
                              locationName: loc.name,
                              data: bd,
                            })
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          See More
                        </button>
                      )}
                      <button
                        onClick={() => handleRefreshLocation(loc.id)}
                        disabled={isRefreshing || !hasConnections}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isRefreshing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        {isRefreshing ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {businessData.locations.length === 0 && (
              <p className="text-sm text-gray-500 py-2">
                No locations found for this organization.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-2">
            Unable to load business data.
          </p>
        )}
      </motion.div>

      {/* Business Data Detail Modal */}
      {viewingData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
            onClick={() => setViewingData(null)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-lg max-h-[80vh] rounded-2xl bg-white shadow-xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Business Data
                </h3>
                <p className="text-sm text-gray-500">
                  {viewingData.locationName}
                </p>
              </div>
              <button
                onClick={() => setViewingData(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-4">
              {(() => {
                const d = viewingData.data;
                const addr = d.address as Record<string, unknown> | undefined;
                const hours = d.hours as Record<string, { open: string; close: string } | null> | undefined;
                const categories = d.categories as string[] | undefined;

                return (
                  <>
                    {/* Basic Info */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Basic Info
                      </h4>
                      <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm">
                        <span className="text-gray-500">Name</span>
                        <span className="text-gray-900 font-medium">
                          {(d.name as string) || "—"}
                        </span>
                        <span className="text-gray-500">Phone</span>
                        <span className="text-gray-900">
                          {(d.phone as string) || "—"}
                        </span>
                        <span className="text-gray-500">Website</span>
                        <span className="text-gray-900 truncate">
                          {d.website ? (
                            <a
                              href={d.website as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {d.website as string}
                            </a>
                          ) : (
                            "—"
                          )}
                        </span>
                        <span className="text-gray-500">Place ID</span>
                        <span className="text-gray-900 font-mono text-xs break-all">
                          {(d.place_id as string) || "—"}
                        </span>
                      </div>
                    </div>

                    {/* Address */}
                    {addr && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Address
                        </h4>
                        <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm">
                          <span className="text-gray-500">Street</span>
                          <span className="text-gray-900">
                            {(addr.street as string) || "—"}
                          </span>
                          {addr.suite ? (
                            <>
                              <span className="text-gray-500">Suite</span>
                              <span className="text-gray-900">
                                {addr.suite as string}
                              </span>
                            </>
                          ) : null}
                          <span className="text-gray-500">City</span>
                          <span className="text-gray-900">
                            {(addr.city as string) || "—"}
                          </span>
                          <span className="text-gray-500">State</span>
                          <span className="text-gray-900">
                            {(addr.state as string) || "—"}
                          </span>
                          <span className="text-gray-500">ZIP</span>
                          <span className="text-gray-900">
                            {(addr.zip as string) || "—"}
                          </span>
                          <span className="text-gray-500">Country</span>
                          <span className="text-gray-900">
                            {(addr.country as string) || "—"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Categories */}
                    {categories && categories.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Categories
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {categories.map((cat, i) => (
                            <span
                              key={i}
                              className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-full"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Hours */}
                    {hours && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Business Hours
                        </h4>
                        <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm">
                          {[
                            "monday",
                            "tuesday",
                            "wednesday",
                            "thursday",
                            "friday",
                            "saturday",
                            "sunday",
                          ].map((day) => {
                            const h = hours[day];
                            return (
                              <React.Fragment key={day}>
                                <span className="text-gray-500 capitalize">
                                  {day}
                                </span>
                                <span className="text-gray-900">
                                  {h
                                    ? `${h.open} — ${h.close}`
                                    : "Closed"}
                                </span>
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Coordinates */}
                    {d.coordinates && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Coordinates
                        </h4>
                        <p className="text-sm text-gray-700 font-mono">
                          {(d.coordinates as { lat: number; lng: number }).lat},{" "}
                          {(d.coordinates as { lat: number; lng: number }).lng}
                        </p>
                      </div>
                    )}

                    {/* Description */}
                    {d.description && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Description
                        </h4>
                        <p className="text-sm text-gray-700">
                          {d.description as string}
                        </p>
                      </div>
                    )}

                    {/* Last Refreshed */}
                    <div className="pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-400">
                        Last refreshed: {formatRefreshedAt(d)}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
          </motion.div>
        </div>
      )}

      {/* Archive Organization */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
      >
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-6 py-3">
          <Archive className="h-5 w-5 text-gray-700" />
          <h3 className="font-semibold text-gray-900">Archive Organization</h3>
        </div>
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {isArchived ? "Restore this organization" : "Archive this organization"}
            </p>
            <p className="mt-0.5 max-w-2xl text-xs text-gray-500">
              {isArchived
                ? `Archived${archiveDate ? ` on ${archiveDate}` : ""}. Restoring makes the organization visible again, but custom domains stay disconnected until an admin reconnects them.`
                : "Archives connected sites, disconnects custom domains, pauses GBP automation, and blocks scheduled agents while preserving historical data."}
            </p>
          </div>
          {isArchived ? (
            <button
              type="button"
              onClick={handleUnarchive}
              disabled={isUnarchiving}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUnarchiving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setArchiveConfirm(true)}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Archive className="h-4 w-4" />
              Archive
            </button>
          )}
        </div>
      </motion.div>

      {/* Danger Zone */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-red-200 overflow-hidden"
      >
        <div className="px-6 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <h3 className="font-semibold text-red-900">Danger Zone</h3>
        </div>
        <div className="p-6 bg-white flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">
              Delete this organization
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Permanently remove this organization and all of its data.
            </p>
          </div>
          <button
            onClick={() => setDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors shrink-0"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </motion.div>

      {/* Archive Confirmation Modal */}
      {archiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
            onClick={() => !isArchiving && setArchiveConfirm(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
          >
            <button
              type="button"
              onClick={() => !isArchiving && setArchiveConfirm(false)}
              disabled={isArchiving}
              className="absolute right-4 top-4 rounded-lg p-2 transition-colors hover:bg-gray-100 disabled:opacity-50"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>

            <div className="p-6">
              <div className="mb-4 flex items-center gap-4">
                <div className="rounded-xl bg-gray-100 p-3 text-gray-700">
                  <Archive className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Archive Organization
                </h3>
              </div>

              <div className="mb-6 space-y-3 text-sm text-gray-600">
                <p>
                  Archiving "{org.name}" will hide it from the default
                  organization list, archive connected sites, disconnect custom
                  domains, and stop automation from creating new work.
                </p>
                <p className="font-medium text-gray-900">
                  Historical data stays available to admins.
                </p>
              </div>

              <label className="mb-2 block text-sm font-medium text-gray-700">
                Reason
              </label>
              <textarea
                value={archiveReason}
                onChange={(event) => setArchiveReason(event.target.value)}
                className="min-h-24 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
                placeholder="Optional offboarding note"
                disabled={isArchiving}
              />

              <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={() => setArchiveConfirm(false)}
                  disabled={isArchiving}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={isArchiving}
                  className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isArchiving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Archive Organization
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
            onClick={() => !isDeleting && setDeleteConfirm(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden"
          >
            <button
              onClick={() => !isDeleting && setDeleteConfirm(false)}
              disabled={isDeleting}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>

            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-red-50 text-red-600">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Delete Organization
                </h3>
              </div>

              <div className="space-y-4 mb-6">
                <p className="text-sm text-gray-600">
                  This will{" "}
                  <strong className="text-red-600">permanently delete</strong> "
                  {org.name}" and all associated data.
                </p>
                <p className="text-sm text-red-600 font-bold">
                  This action cannot be undone.
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type <strong>"{org.name}"</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-300"
                  placeholder={org.name}
                  disabled={isDeleting}
                  autoComplete="off"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteConfirmText !== org.name || isDeleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isDeleting && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Delete Organization
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
