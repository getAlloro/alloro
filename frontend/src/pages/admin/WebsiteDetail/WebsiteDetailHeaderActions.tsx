import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  ExternalLink,
  Building2,
  Loader2,
  X,
  Trash2,
  ChevronDown,
  RefreshCw,
  Fingerprint,
} from "lucide-react";
import { linkWebsiteToOrganization } from "../../../api/websites";
import type { WebsiteProjectWithPages } from "../../../api/websites";
import { toast } from "react-hot-toast";

/**
 * Header action pills + icons for WebsiteDetail.
 * Moved verbatim from WebsiteDetail — identical JSX, classNames, handlers,
 * and strings. Local variables that the markup referenced are passed as props.
 */

export function HeaderActionPills({
  website,
  id,
  customDomain,
  domainVerifiedAt,
  showOrgDropdown,
  isLinking,
  loadingOrgs,
  availableOrganizations,
  orgDropdownRef,
  setShowIdentityModal,
  setShowOrgDropdown,
  setShowDomainModal,
  setSelectedOrgId,
  setIsLinking,
  handleUnlink,
  loadWebsite,
  loadAvailableOrganizations,
}: {
  website: WebsiteProjectWithPages;
  id: string | undefined;
  customDomain: string | null;
  domainVerifiedAt: string | null;
  showOrgDropdown: boolean;
  isLinking: boolean;
  loadingOrgs: boolean;
  availableOrganizations: Array<{ id: number; name: string }>;
  orgDropdownRef: React.RefObject<HTMLDivElement | null>;
  setShowIdentityModal: (value: boolean) => void;
  setShowOrgDropdown: (value: boolean) => void;
  setShowDomainModal: (value: boolean) => void;
  setSelectedOrgId: (value: number | null) => void;
  setIsLinking: (value: boolean) => void;
  handleUnlink: () => void;
  loadWebsite: () => Promise<void>;
  loadAvailableOrganizations: () => Promise<void>;
}) {
  return (
    <>
      <button
        onClick={() => setShowIdentityModal(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        title="Project Identity — business data, brand, voice, and content context for the AI"
      >
        <Fingerprint className="h-4 w-4" />
        Identity
        {website?.project_identity?.meta?.warmup_status === "ready" && (
          <span className="ml-1 h-1.5 w-1.5 rounded-full bg-green-500" />
        )}
        {(website?.project_identity?.meta?.warmup_status === "running" ||
          website?.project_identity?.meta?.warmup_status === "queued") && (
          <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
        )}
      </button>

      <div className="relative" ref={orgDropdownRef}>
        <button
          onClick={() => setShowOrgDropdown(!showOrgDropdown)}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <Building2 className="h-4 w-4" />
          {website?.organization ? website.organization.name : "No Organization"}
          <ChevronDown
            className={`h-3 w-3 transition-transform ${showOrgDropdown ? "rotate-180" : ""}`}
          />
        </button>

        <AnimatePresence>
          {showOrgDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50"
            >
              {website?.organization ? (
                <>
                  <Link
                    to="/admin/organization-management"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setShowOrgDropdown(false)}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Organization
                  </Link>
                  <button
                    onClick={() => {
                      setShowOrgDropdown(false);
                      handleUnlink();
                    }}
                    disabled={isLinking}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    {isLinking ? "Unlinking..." : "Unlink Organization"}
                  </button>
                </>
              ) : (
                <>
                  {loadingOrgs ? (
                    <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </div>
                  ) : availableOrganizations.length === 0 ? (
                    <div className="px-4 py-2 text-sm text-gray-500">
                      No available organizations
                    </div>
                  ) : (
                    <>
                      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                        Link to Organization
                      </div>
                      {availableOrganizations.map((org) => (
                        <button
                          key={org.id}
                          onClick={async () => {
                            setSelectedOrgId(org.id);
                            setShowOrgDropdown(false);
                            setIsLinking(true);
                            try {
                              await linkWebsiteToOrganization(id!, org.id);
                              toast.success("Organization linked");
                              await loadWebsite();
                              await loadAvailableOrganizations();
                            } catch (err) {
                              toast.error(
                                err instanceof Error
                                  ? err.message
                                  : "Failed to link",
                              );
                            } finally {
                              setIsLinking(false);
                              setSelectedOrgId(null);
                            }
                          }}
                          disabled={isLinking}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 w-full text-left disabled:opacity-50"
                        >
                          <Building2 className="h-4 w-4" />
                          {org.name}
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        onClick={() => setShowDomainModal(true)}
        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
          customDomain && domainVerifiedAt
            ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
            : customDomain
              ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              : "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
        }`}
      >
        <Globe className="h-4 w-4" />
        {customDomain || "Custom Domain"}
      </button>
    </>
  );
}

export function HeaderActionIcons({
  isLive,
  isDeleting,
  liveDomain,
  loadWebsite,
  handleDelete,
}: {
  isLive: boolean;
  isDeleting: boolean;
  liveDomain: string;
  loadWebsite: () => void;
  handleDelete: () => void;
}) {
  return (
    <>
      <button
        onClick={loadWebsite}
        title="Refresh"
        aria-label="Refresh website"
        className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
      >
        <RefreshCw className="h-4 w-4" />
      </button>
      {isLive && (
        <a
          href={`https://${liveDomain}`}
          target="_blank"
          rel="noopener noreferrer"
          title="View Live Site"
          aria-label="View live site"
          className="inline-flex items-center justify-center rounded-lg p-2 text-green-600 transition hover:bg-green-50 hover:text-green-700"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        title={isDeleting ? "Deleting..." : "Delete"}
        aria-label={isDeleting ? "Deleting website" : "Delete website"}
        className="inline-flex items-center justify-center rounded-lg p-2 text-red-500 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>
    </>
  );
}
