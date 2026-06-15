import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Globe,
  ExternalLink,
  Clock,
  CheckCircle,
  Building2,
  FileText,
  Loader2,
  AlertCircle,
  Star,
  X,
  Code,
  Trash2,
  ChevronDown,
  RefreshCw,
  Layout,
  Image,
  Inbox,
  Newspaper,
  Menu,
  ArrowRightLeft,
  Archive,
  Wrench,
  Fingerprint,
  DollarSign,
  Plug,
} from "lucide-react";
import {
  fetchWebsiteDetail,
  deleteWebsite,
  deletePageByPath,
  linkWebsiteToOrganization,
  connectDomain,
  verifyDomainAdmin,
  disconnectDomain,
  fetchPagesGenerationStatus,
  cancelGeneration,
  fetchSlotPrefill,
  startLayoutGeneration,
  fetchLayoutsStatus,
  type LayoutsStatus,
  type DynamicSlotDef,
} from "../../api/websites";
import type { WebsiteProjectWithPages, WebsitePage, PageGenerationStatusItem } from "../../api/websites";
import { toast } from "react-hot-toast";
import {
  useAdminWebsiteDetail,
  useInvalidateAdminWebsiteDetail,
} from "../../hooks/queries/useAdminQueries";
import {
  AdminPageHeader,
  ActionButton,
} from "../../components/ui/DesignSystem";
import CreatePageModal from "../../components/Admin/page-pipeline/CreatePageModal";
import IdentityModal from "../../components/Admin/identity/IdentityModal";
import LayoutInputsModal from "../../components/Admin/page-pipeline/LayoutInputsModal";
import MediaTab from "../../components/Admin/website-tabs/MediaTab";
import CodeManagerTab from "../../components/Admin/website-tabs/CodeManagerTab";
import ConnectDomainModal from "../../components/Admin/website-tabs/ConnectDomainModal";
import RecipientsConfig from "../../components/Admin/leadgen/RecipientsConfig";
import FormSubmissionsTab from "../../components/Admin/leadgen/FormSubmissionsTab";
import PostsTab from "../../components/Admin/website-tabs/PostsTab";
import MenusTab from "../../components/Admin/website-tabs/MenusTab";
import BackupsTab from "../../components/Admin/website-tabs/BackupsTab";
import AiCommandTab from "../../components/Admin/agents/AiCommandTab";
import RedirectsTab from "../../components/Admin/website-tabs/RedirectsTab";
import ReviewsTab from "../../components/Admin/website-tabs/ReviewsTab";
import CostsTab from "../../components/Admin/website-tabs/CostsTab";
import IntegrationsTab from "../../components/Admin/website-tabs/IntegrationsTab";
import FindReplaceModal from "../../components/Admin/find-replace/FindReplaceModal";
import { fetchProjectCodeSnippets } from "../../api/codeSnippets";
import type { CodeSnippet } from "../../api/codeSnippets";
import { adminFetch } from "../../api";
import { useConfirm } from "../../components/ui/ConfirmModal";
import { logger } from "../../lib/logger";
import {
  WEBSITE_DETAIL_TABS,
  NON_POLLING_STATUSES,
  POLL_INTERVAL,
  groupPagesByPath,
  formatDate,
  getStatusStyles,
  formatStatus,
  isProcessingStatus,
  type WebsiteDetailTab,
  type OrganizationsResponse,
  type WebsiteProjectDomainFields,
} from "./websiteDetail.utils";
import { useWebsiteDetailBulkSeo } from "./useWebsiteDetailBulkSeo";
import { ThreeStepOnboarding } from "./WebsiteDetail/ThreeStepOnboarding";
import { PageGenerationStatusList } from "./WebsiteDetail/PageGenerationStatusList";
import { LayoutsTab } from "./WebsiteDetail/LayoutsTab";
import { PagesTab } from "./WebsiteDetail/PagesTab";

export type WebsiteDetailProps = {
  projectId?: string;
  embedded?: boolean;
  activeTab?: WebsiteDetailTab;
  backPath?: string;
  backLabel?: string;
  hideTabBar?: boolean;
  onTabChange?: (tab: WebsiteDetailTab) => void;
};

export default function WebsiteDetail({
  projectId,
  embedded = false,
  activeTab,
  backPath = "/admin/websites",
  backLabel = "Back to Websites",
  hideTabBar = false,
  onTabChange,
}: WebsiteDetailProps = {}) {
  const { id: routeId } = useParams<{ id: string }>();
  const id = projectId || routeId;
  const navigate = useNavigate();
  const confirm = useConfirm();
  // TanStack Query — cached initial load
  const {
    data: website,
    isLoading: loading,
    error: queryError,
  } = useAdminWebsiteDetail(id);
  const { invalidate: invalidateWebsite, setData: setWebsiteCache } =
    useInvalidateAdminWebsiteDetail();
  const error = queryError?.message ?? null;

  // Helper to update cache directly (used by polling + mutation callbacks)
  const setWebsite = (data: WebsiteProjectWithPages) => {
    if (id) setWebsiteCache(id, data);
  };
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [deletingPageId, setDeletingPageId] = useState<string | null>(null);
  const [deletingPagePath, setDeletingPagePath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState<string | null>(null);

  const [, setIsPolling] = useState(false);

  // Create page modal state
  const [showCreatePageModal, setShowCreatePageModal] = useState(false);
  const [showFindReplaceModal, setShowFindReplaceModal] = useState(false);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [showLayoutsModal, setShowLayoutsModal] = useState(false);

  // Layouts tab state (Plan B T10)
  const [layoutsStatus, setLayoutsStatus] = useState<LayoutsStatus | null>(null);
  const [layoutSlots, setLayoutSlots] = useState<DynamicSlotDef[]>([]);
  const [layoutSlotValues, setLayoutSlotValues] = useState<Record<string, string>>({});
  const [loadingLayoutSlots, setLoadingLayoutSlots] = useState(false);
  const [startingLayouts, setStartingLayouts] = useState(false);
  const layoutsPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isGeneratingPage, setIsGeneratingPage] = useState(false);

  // Bulk SEO generation state + polling (extracted hook)
  const { bulkSeoStatus, startBulkPageSeo, isBulkSeoActive } =
    useWebsiteDetailBulkSeo(id, invalidateWebsite);

  // Detail tab: persisted in URL search params so refresh preserves tab
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const detailTab: WebsiteDetailTab = activeTab
    ? activeTab
    : WEBSITE_DETAIL_TABS.includes(rawTab as WebsiteDetailTab)
      ? (rawTab as WebsiteDetailTab)
      : "pages";
  const setDetailTab = (tab: WebsiteDetailTab) => {
    if (onTabChange) {
      onTabChange(tab);
      return;
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === "pages") {
        next.delete("tab");
      } else {
        next.set("tab", tab);
      }
      return next;
    }, { replace: true });
  };

  // Code snippets state
  const [codeSnippets, setCodeSnippets] = useState<CodeSnippet[]>([]);
  const [loadingSnippets, setLoadingSnippets] = useState(false);

  // Organization linking state
  const [availableOrganizations, setAvailableOrganizations] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const orgDropdownRef = useRef<HTMLDivElement>(null);

  // Per-page generation status polling
  const [pageGenStatuses, setPageGenStatuses] = useState<PageGenerationStatusItem[]>([]);
  const [isCreatingAll, setIsCreatingAll] = useState(false);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageGenPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expectedPageCountRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  const loadCodeSnippets = useCallback(async () => {
    if (!id) return;

    try {
      setLoadingSnippets(true);
      const response = await fetchProjectCodeSnippets(id);
      setCodeSnippets(response.data);
    } catch (err) {
      logger.error("Failed to fetch code snippets:", err);
    } finally {
      setLoadingSnippets(false);
    }
  }, [id]);

  const loadAvailableOrganizations = useCallback(async () => {
    try {
      setLoadingOrgs(true);
      const response = await adminFetch("/api/admin/organizations");
      const data = (await response.json()) as OrganizationsResponse;

      // Filter to orgs without websites (or currently linked org)
      const availableOrgs = (data.organizations || [])
        .filter((org) => !org.website || org.id === website?.organization?.id)
        .map((org) => ({ id: org.id, name: org.name }));

      setAvailableOrganizations(availableOrgs);
    } catch (err) {
      logger.error("Failed to load organizations:", err);
      toast.error("Failed to load organizations");
    } finally {
      setLoadingOrgs(false);
    }
  }, [website?.organization?.id]);

  const handleLinkOrganization = async () => {
    if (!id || isLinking) return;

    try {
      setIsLinking(true);
      await linkWebsiteToOrganization(id, selectedOrgId);
      toast.success(
        selectedOrgId ? "Organization linked" : "Organization unlinked",
      );
      await loadWebsite();
      await loadAvailableOrganizations();
      setSelectedOrgId(null);
    } catch (err) {
      logger.error("Failed to link organization:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to link organization",
      );
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async () => {
    const ok = await confirm({ title: "Unlink this website from the organization?", confirmLabel: "Unlink", variant: "danger" });
    if (!ok) return;
    setSelectedOrgId(null);
    await handleLinkOrganization();
  };

  // Side-effects on mount (code snippets, cleanup refs)
  // Website data is loaded automatically by TanStack Query
  useEffect(() => {
    isMountedRef.current = true;
    if (id) {
      loadCodeSnippets();
    }
    return () => {
      isMountedRef.current = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      if (pageGenPollRef.current) clearTimeout(pageGenPollRef.current);
    };
  }, [id, loadCodeSnippets]);

  // Load available organizations when website data changes
  useEffect(() => {
    if (website) {
      loadAvailableOrganizations();
    }
  }, [website?.organization?.id, loadAvailableOrganizations]);

  // Project status polling (stops when CREATED or LIVE)
  useEffect(() => {
    if (!website) return;
    if (NON_POLLING_STATUSES.includes(website.status)) {
      setIsPolling(false);
      return;
    }
    setIsPolling(true);

    const pollStatus = async () => {
      if (!id || !isMountedRef.current) return;
      try {
        const response = await fetchWebsiteDetail(id);
        if (!isMountedRef.current) return;
        setWebsite(response.data);
        if (NON_POLLING_STATUSES.includes(response.data.status)) {
          setIsPolling(false);
          return;
        }
        pollTimeoutRef.current = setTimeout(pollStatus, POLL_INTERVAL);
      } catch (err) {
        if (!isMountedRef.current) return;
        logger.error("Polling error:", err);
        pollTimeoutRef.current = setTimeout(pollStatus, POLL_INTERVAL);
      }
    };

    pollTimeoutRef.current = setTimeout(pollStatus, POLL_INTERVAL);
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [website?.status, id]);

  // Per-page generation status polling — active while any page is queued or generating
  useEffect(() => {
    if (!website || !id) return;
    if (website.status !== "IN_PROGRESS") return;

    const hasActivePages = pageGenStatuses.some(
      (p) => p.generation_status === "queued" || p.generation_status === "generating",
    );
    if (!hasActivePages && pageGenStatuses.length > 0) return;

    const pollPages = async () => {
      if (!isMountedRef.current) return;
      try {
        const response = await fetchPagesGenerationStatus(id);
        if (!isMountedRef.current) return;
        setPageGenStatuses(response.data);
        const stillActive = response.data.some(
          (p) => p.generation_status === "queued" || p.generation_status === "generating",
        );
        if (stillActive) {
          pageGenPollRef.current = setTimeout(pollPages, POLL_INTERVAL);
        } else {
          setIsCreatingAll(false);
          // Reload website to get updated project status
          loadWebsite();
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        logger.error("Page gen polling error:", err);
        pageGenPollRef.current = setTimeout(pollPages, POLL_INTERVAL);
      }
    };

    pageGenPollRef.current = setTimeout(pollPages, POLL_INTERVAL);
    return () => {
      if (pageGenPollRef.current) clearTimeout(pageGenPollRef.current);
    };
  }, [website?.status, id, pageGenStatuses.length]);

  // Layouts tab: load initial status + slot definitions + pre-filled values (Plan B T10)
  useEffect(() => {
    if (!id || detailTab !== "layouts") return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoadingLayoutSlots(true);
        const [statusRes, prefillRes] = await Promise.all([
          fetchLayoutsStatus(id),
          fetchSlotPrefill(id, { layout: true }),
        ]);
        if (cancelled) return;
        setLayoutsStatus(statusRes.data);
        setLayoutSlots(prefillRes.data.slots || []);
        setLayoutSlotValues((prev) => ({ ...prefillRes.data.values, ...prev }));
      } catch (err) {
        logger.error("Failed to load layouts:", err);
      } finally {
        if (!cancelled) setLoadingLayoutSlots(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [id, detailTab]);

  // Layouts tab: poll status while generating
  useEffect(() => {
    if (!id) return;
    const status = layoutsStatus?.status;
    if (status !== "generating" && status !== "queued") {
      if (layoutsPollRef.current) clearTimeout(layoutsPollRef.current);
      return;
    }

    const poll = async () => {
      try {
        const res = await fetchLayoutsStatus(id);
        if (!isMountedRef.current) return;
        setLayoutsStatus(res.data);
        if (res.data.status === "generating" || res.data.status === "queued") {
          layoutsPollRef.current = setTimeout(poll, 2000);
        }
      } catch {
        layoutsPollRef.current = setTimeout(poll, 3000);
      }
    };

    layoutsPollRef.current = setTimeout(poll, 2000);
    return () => {
      if (layoutsPollRef.current) clearTimeout(layoutsPollRef.current);
    };
  }, [id, layoutsStatus?.status]);

  const updateLayoutSlotValue = useCallback((key: string, value: string) => {
    setLayoutSlotValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleStartLayouts = async () => {
    if (!id || startingLayouts) return;
    try {
      setStartingLayouts(true);
      await startLayoutGeneration(id, layoutSlotValues);
      const res = await fetchLayoutsStatus(id);
      setLayoutsStatus(res.data);
    } catch (err) {
      logger.error("Failed to start layouts:", err);
    } finally {
      setStartingLayouts(false);
    }
  };

  const handleCancelLayouts = async () => {
    if (!id) return;
    if (!(await confirm({ title: "Cancel layouts generation?", confirmLabel: "Cancel generation", variant: "danger" }))) return;
    try {
      await cancelGeneration(id);
      const res = await fetchLayoutsStatus(id);
      setLayoutsStatus(res.data);
    } catch (err) {
      logger.error("Failed to cancel layouts:", err);
    }
  };

  // Close org dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        orgDropdownRef.current &&
        !orgDropdownRef.current.contains(event.target as Node)
      ) {
        setShowOrgDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDelete = async () => {
    if (!id || isDeleting) return;
    const ok = await confirm({ title: "Delete this website project?", message: "This will also delete all its pages. This action cannot be undone.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;
    try {
      setIsDeleting(true);
      await deleteWebsite(id);
      navigate("/admin/websites");
    } catch (err) {
      logger.error("Failed to delete website:", err);
      alert(err instanceof Error ? err.message : "Failed to delete website");
      setIsDeleting(false);
    }
  };

  const handleDeletePageVersion = async (
    pageId: string,
    pageGroup: { path: string; pages: WebsitePage[] },
  ) => {
    const page = pageGroup.pages.find((p) => p.id === pageId);
    if (!page || !id) return;

    if (page.status === "published") {
      alert("Cannot delete a published page version.");
      return;
    }
    if (pageGroup.pages.length <= 1) {
      alert("Cannot delete the only version of a page.");
      return;
    }
    const okVersion = await confirm({ title: `Delete version ${page.version} of "${page.path}"?`, confirmLabel: "Delete", variant: "danger" });
    if (!okVersion) return;

    try {
      setDeletingPageId(pageId);
      const response = await adminFetch(
        `/api/admin/websites/${id}/pages/${pageId}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete page version");
      }
      invalidateWebsite(id!);
      await loadWebsite();
    } catch (err) {
      logger.error("Failed to delete page version:", err);
      alert(
        err instanceof Error ? err.message : "Failed to delete page version",
      );
    } finally {
      setDeletingPageId(null);
    }
  };

  const handleDeletePage = async (path: string, versionCount: number) => {
    if (!id) return;
    const okPage = await confirm({ title: `Delete page "${path}"?`, message: `This will delete all ${versionCount} version${versionCount !== 1 ? "s" : ""}. This cannot be undone.`, confirmLabel: "Delete", variant: "danger" });
    if (!okPage) return;

    try {
      setDeletingPagePath(path);
      await deletePageByPath(id, path);
      invalidateWebsite(id);
      await loadWebsite();
    } catch (err) {
      logger.error("Failed to delete page:", err);
      alert(err instanceof Error ? err.message : "Failed to delete page");
    } finally {
      setDeletingPagePath(null);
    }
  };

  const loadWebsite = async () => {
    if (!id) return;
    await invalidateWebsite(id);
  };

  const startPageGenerationPoll = useCallback(() => {
    if (pageGenPollRef.current) clearTimeout(pageGenPollRef.current);
    let attempts = 0;
    const maxAttempts = 20; // 20 × 3s = 60s

    const poll = async () => {
      if (!id || !isMountedRef.current) return;
      attempts++;
      try {
        const response = await fetchWebsiteDetail(id);
        if (!isMountedRef.current) return;
        setWebsite(response.data);

        if (response.data.pages.length > expectedPageCountRef.current) {
          setIsGeneratingPage(false);
          return;
        }
        if (attempts < maxAttempts) {
          pageGenPollRef.current = setTimeout(poll, POLL_INTERVAL);
        } else {
          setIsGeneratingPage(false);
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        logger.error("Page generation poll error:", err);
        if (attempts < maxAttempts) {
          pageGenPollRef.current = setTimeout(poll, POLL_INTERVAL);
        } else {
          setIsGeneratingPage(false);
        }
      }
    };

    pageGenPollRef.current = setTimeout(poll, POLL_INTERVAL);
  }, [id]);

  const handleCancelGeneration = async () => {
    if (!id) return;
    if (!(await confirm({ title: "Cancel all in-progress page generation?", confirmLabel: "Cancel all", variant: "danger" }))) return;
    try {
      await cancelGeneration(id);
      // Force immediate poll to refresh statuses
      const response = await fetchPagesGenerationStatus(id);
      setPageGenStatuses(response.data);
    } catch (err) {
      logger.error("Cancel generation error:", err);
    }
  };

  const getGbpData = () => {
    // Prefer project_identity.business (new source of truth)
    const identity = website?.project_identity as Record<string, unknown> | null | undefined;
    if (identity && typeof identity === "object") {
      const business = (identity as { business?: Record<string, unknown> }).business;
      if (business && typeof business === "object") {
        // Map identity.business shape to the Record<string, string|number|null> consumers expect
        return {
          name: (business.name as string | null) || null,
          formattedAddress: (business.address as string | null) || null,
          phone: (business.phone as string | null) || null,
          rating: (business.rating as number | null) ?? null,
          reviewCount: (business.review_count as number | null) ?? null,
          category: (business.category as string | null) || null,
          city: (business.city as string | null) || null,
          state: (business.state as string | null) || null,
        } as Record<string, string | number | null>;
      }
    }
    // Legacy fallback
    if (website?.step_gbp_scrape && typeof website.step_gbp_scrape === "object")
      return website.step_gbp_scrape as Record<string, string | number | null>;
    return null;
  };

  const togglePath = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (loading) {
    // Show skeleton loading state with grey cards
    return (
      <div className="space-y-6">
        {/* Back button skeleton */}
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>

        {/* Header skeleton */}
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="h-8 w-64 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 w-48 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-32 bg-gray-200 rounded-lg animate-pulse"></div>
            <div className="h-10 w-24 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>
        </div>

        {/* Tab bar skeleton */}
        <div className="flex gap-2 border-b border-gray-200 pb-2">
          <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-8 w-24 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
        </div>

        {/* Main content card skeleton */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="h-6 w-40 bg-gray-200 rounded animate-pulse"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
          </div>
        </div>

        {/* Additional card skeleton */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
            <div className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {!embedded && (
          <Link
            to={backPath}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        )}
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">
              Error loading website
            </p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
          <ActionButton
            label="Retry"
            onClick={loadWebsite}
            variant="danger"
            size="sm"
          />
        </div>
      </div>
    );
  }

  if (!website) {
    return (
      <div className="space-y-6">
        {!embedded && (
          <Link
            to={backPath}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        )}
        <div className="text-center py-16 text-gray-500">Website not found</div>
      </div>
    );
  }

  const gbpData = getGbpData();
  const isCreatedStatus = website.status === "CREATED";
  const isLive = website.status === "LIVE";
  const isInProgress = website.status === "IN_PROGRESS";
  const domainVerifiedAt =
    (website as WebsiteProjectDomainFields).domain_verified_at || null;
  const customDomain = website.custom_domain || null;
  const liveDomain =
    customDomain && domainVerifiedAt
      ? customDomain
      : `${website.generated_hostname}.sites.getalloro.com`;
  const pageGroups = groupPagesByPath(website.pages);

  // Pre-compute all SEO titles/descriptions for uniqueness checks in the page list
  // Use displayPage (published or latest) per group — matches list score display
  const allPageSeoMeta = (() => {
    const titles: string[] = [];
    const descriptions: string[] = [];
    for (const group of pageGroups) {
      const publishedPage = group.pages.find((p) => p.status === "published");
      const seoPage = publishedPage || group.pages[0];
      if (seoPage?.seo_data?.meta_title) titles.push(seoPage.seo_data.meta_title);
      if (seoPage?.seo_data?.meta_description) descriptions.push(seoPage.seo_data.meta_description);
    }
    return { titles, descriptions };
  })();

  const headerActionPills = (
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

  const headerActionIcons = (
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

  return (
    <div className="space-y-6">
      {/* Back link */}
      {!embedded && (
        <Link
          to={backPath}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}

      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {headerActionPills}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {headerActionIcons}
          </div>
        </div>
      ) : (
        <AdminPageHeader
          icon={<Globe className="w-6 h-6" />}
          title={
            website.display_name ||
            (gbpData?.name ? String(gbpData.name) : website.generated_hostname)
          }
          description={
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
                <Globe className="h-3 w-3" />
                {website.generated_hostname}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
                <Clock className="h-3 w-3" />
                Created {formatDate(website.created_at)}
              </span>
              {website.updated_at !== website.created_at && (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
                  <Clock className="h-3 w-3" />
                  Updated {formatDate(website.updated_at)}
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyles(website.status)}`}
              >
                {website.status === "LIVE" && (
                  <CheckCircle className="h-3 w-3" />
                )}
                {isProcessingStatus(website.status) && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                {formatStatus(website.status)}
              </span>
            </div>
          }
          actionButtons={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {headerActionPills}
              {headerActionIcons}
            </div>
          }
        />
      )}

      {/* Status Card — hidden when LIVE */}
      {!isLive && (
        <motion.div
          className="rounded-xl border border-gray-200 bg-white shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="p-5">
            {isCreatedStatus ? (
              // 3-step onboarding card
              <ThreeStepOnboarding
                website={website}
                onOpenIdentity={() => setShowIdentityModal(true)}
                onOpenLayouts={() => setDetailTab("layouts")}
                onOpenFirstPage={() => setShowCreatePageModal(true)}
              />
            ) : (
              // IN_PROGRESS — per-page generation status list
              <PageGenerationStatusList
                id={id}
                isCreatingAll={isCreatingAll}
                gbpData={gbpData}
                pageGenStatuses={pageGenStatuses}
                handleCancelGeneration={handleCancelGeneration}
              />
            )}
          </div>
        </motion.div>
      )}

      {/* Tab bar: Pages | Layouts | Code Manager | Media | Form Submissions */}
      {!hideTabBar && (
        <div
          className={
            embedded
              ? "mb-4 flex items-center gap-7 overflow-x-auto border-b border-gray-200 px-1"
              : "flex items-stretch gap-1 p-1.5 bg-gray-100 rounded-xl mb-4"
          }
        >
          {WEBSITE_DETAIL_TABS.map((tab) => {
          const isActive = detailTab === tab;
          const tabConfig: Record<string, { label: string; icon: React.ReactNode }> = {
            "pages": { label: "Pages", icon: <FileText className="w-3.5 h-3.5" /> },
            "layouts": { label: "Layouts", icon: <Layout className="w-3.5 h-3.5" /> },
            "code-manager": { label: "Code Manager", icon: <Code className="w-3.5 h-3.5" /> },
            "media": { label: "Media", icon: <Image className="w-3.5 h-3.5" /> },
            "form-submissions": { label: "Forms", icon: <Inbox className="w-3.5 h-3.5" /> },
            "posts": { label: "Posts", icon: <Newspaper className="w-3.5 h-3.5" /> },
            "menus": { label: "Menus", icon: <Menu className="w-3.5 h-3.5" /> },
            "reviews": { label: "Reviews", icon: <Star className="w-3.5 h-3.5" /> },
            "redirects": { label: "Redirects", icon: <ArrowRightLeft className="w-3.5 h-3.5" /> },
            "integrations": { label: "Integrations", icon: <Plug className="w-3.5 h-3.5" /> },
            "backups": { label: "Backups", icon: <Archive className="w-3.5 h-3.5" /> },
            "advanced-tools": { label: "Advanced Tools", icon: <Wrench className="w-3.5 h-3.5" /> },
            "costs": { label: "Costs", icon: <DollarSign className="w-3.5 h-3.5" /> },
          };
          const config = tabConfig[tab] || { label: tab, icon: null };
          return (
            <motion.button
              key={tab}
              onClick={() => setDetailTab(tab)}
              className={
                embedded
                  ? `group relative flex shrink-0 items-center gap-2 pb-3 pt-1 text-sm font-semibold transition-colors ${
                      isActive
                        ? "text-gray-900"
                        : "text-gray-500 hover:text-gray-700"
                    }`
                  : `group relative flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "text-gray-900"
                        : "text-gray-500 hover:text-gray-700"
                    }`
              }
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isActive && !embedded && (
                <motion.div
                  className="absolute inset-0 bg-white rounded-lg shadow-sm"
                  layoutId="websiteDetailTab"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              {isActive && embedded && (
                <motion.span
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-alloro-orange"
                  layoutId="websiteDetailEmbeddedTab"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {config.icon}
                {config.label}
              </span>
            </motion.button>
          );
        })}
        </div>
      )}

      {/* Pages Section — grouped by path, expandable versions */}
      {detailTab === "pages" && (
        <PagesTab
          id={id}
          website={website}
          pageGroups={pageGroups}
          allPageSeoMeta={allPageSeoMeta}
          isGeneratingPage={isGeneratingPage}
          isLive={isLive}
          isInProgress={isInProgress}
          isBulkSeoActive={isBulkSeoActive}
          bulkSeoStatus={bulkSeoStatus}
          expandedPaths={expandedPaths}
          selectedPaths={selectedPaths}
          editingName={editingName}
          nameInput={nameInput}
          savingName={savingName}
          deletingPageId={deletingPageId}
          deletingPagePath={deletingPagePath}
          confirm={confirm}
          invalidateWebsite={invalidateWebsite}
          setWebsiteCache={setWebsiteCache}
          setSelectedPaths={setSelectedPaths}
          setEditingName={setEditingName}
          setNameInput={setNameInput}
          setSavingName={setSavingName}
          setShowFindReplaceModal={setShowFindReplaceModal}
          setShowCreatePageModal={setShowCreatePageModal}
          togglePath={togglePath}
          startBulkPageSeo={startBulkPageSeo}
          handleCancelGeneration={handleCancelGeneration}
          handleDeletePage={handleDeletePage}
          handleDeletePageVersion={handleDeletePageVersion}
        />
      )}

      {/* Layouts Section */}
      {detailTab === "layouts" && (
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <LayoutsTab
            id={id}
            layoutsStatus={layoutsStatus}
            onOpenLayoutsModal={() => setShowLayoutsModal(true)}
          />
        </motion.div>
      )}

      {/* Code Manager Section */}
      {detailTab === "code-manager" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {loadingSnippets ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : (
            <CodeManagerTab
              projectId={id!}
              codeSnippets={codeSnippets}
              onSnippetsChange={loadCodeSnippets}
              isProject={true}
              pages={website.pages}
            />
          )}
        </motion.div>
      )}

      {/* Media Section */}
      {detailTab === "media" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <MediaTab projectId={id!} />
        </motion.div>
      )}

      {/* Form Submissions Section */}
      {detailTab === "form-submissions" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          {/* Submissions table */}
          <FormSubmissionsTab
            projectId={id!}
            isAdmin
            settingsContent={
              <div className="space-y-5">
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900">
                    Default Recipients
	                  </h3>
	                  <RecipientsConfig projectId={id!} />
	                </div>
	              </div>
	            }
	          />
        </motion.div>
      )}

      {/* Posts Section */}
      {detailTab === "posts" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <PostsTab projectId={id!} templateId={website.template_id} organizationId={website.organization?.id} />
        </motion.div>
      )}

      {/* Menus Section */}
      {detailTab === "menus" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <MenusTab projectId={id!} templateId={website.template_id} />
        </motion.div>
      )}

      {/* Reviews Section */}
      {detailTab === "reviews" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <ReviewsTab projectId={id!} organizationId={website.organization?.id} identity={website.project_identity} />
        </motion.div>
      )}

      {/* Redirects Section */}
      {detailTab === "redirects" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <RedirectsTab projectId={id!} />
        </motion.div>
      )}

      {/* Advanced Tools Section */}
      {detailTab === "advanced-tools" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <AiCommandTab projectId={id!} pages={website.pages} onExecutionComplete={() => invalidateWebsite(id!)} />
        </motion.div>
      )}

      {/* Integrations Section — HubSpot only in v1 */}
      {detailTab === "integrations" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <IntegrationsTab projectId={id!} />
        </motion.div>
      )}

      {/* Backups Section */}
      {detailTab === "backups" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <BackupsTab projectId={id!} projectName={website.display_name || ""} />
        </motion.div>
      )}

      {/* Costs Section — refetches when generation transitions active → idle */}
      {detailTab === "costs" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <CostsTab
            projectId={id!}
            isGenerating={pageGenStatuses.some(
              (p) =>
                p.generation_status === "queued" ||
                p.generation_status === "generating",
            )}
          />
        </motion.div>
      )}

      {/* Identity Modal */}
      {showIdentityModal && website && (
        <IdentityModal
          projectId={website.id}
          onClose={() => setShowIdentityModal(false)}
          onIdentityChanged={async () => {
            const res = await fetchWebsiteDetail(website.id);
            if (res.success) setWebsite(res.data);
          }}
        />
      )}

      {/* Layout Inputs Modal */}
      <LayoutInputsModal
        open={showLayoutsModal}
        onClose={() => setShowLayoutsModal(false)}
        status={layoutsStatus}
        slots={layoutSlots}
        values={layoutSlotValues}
        onSlotChange={updateLayoutSlotValue}
        loadingSlots={loadingLayoutSlots}
        startingLayouts={startingLayouts}
        onGenerate={handleStartLayouts}
        onCancel={handleCancelLayouts}
      />


      {/* Create Page Modal */}
      {showCreatePageModal && (
        <CreatePageModal
          projectId={website.id}
          templateId={website.template_id || undefined}
          gbpData={gbpData}
          defaultPlaceId={website.selected_place_id || ""}
          defaultWebsiteUrl={website.selected_website_url || ""}
          defaultPrimaryColor={website.primary_color || "#1E40AF"}
          defaultAccentColor={website.accent_color || "#F59E0B"}
          onSuccess={() => {
            setShowCreatePageModal(false);
            setIsGeneratingPage(true);
            expectedPageCountRef.current = website.pages.length;
            startPageGenerationPoll();
          }}
          onBlankPageCreated={(pageId) => {
            setShowCreatePageModal(false);
            navigate(`/admin/websites/${website.id}/pages/${pageId}/edit`);
          }}
          onClose={() => setShowCreatePageModal(false)}
        />
      )}

      {/* Site-wide Find & Replace Modal */}
      <FindReplaceModal
        projectId={website.id}
        isOpen={showFindReplaceModal}
        onClose={() => setShowFindReplaceModal(false)}
        onApplied={() => {
          if (id) invalidateWebsite(id);
        }}
      />

      {/* Custom Domain Modal */}
      {website && (
        <ConnectDomainModal
          isOpen={showDomainModal}
          onClose={() => setShowDomainModal(false)}
          projectId={website.id}
          currentDomain={customDomain}
          domainVerifiedAt={domainVerifiedAt}
          onDomainChange={async () => {
            const res = await fetchWebsiteDetail(website.id);
            if (res.success) setWebsite(res.data);
          }}
          onConnect={async (domain) => {
            const res = await connectDomain(website.id, domain);
            return res.data;
          }}
          onVerify={async () => {
            const res = await verifyDomainAdmin(website.id);
            return res.data;
          }}
          onDisconnect={async () => {
            await disconnectDomain(website.id);
          }}
        />
      )}
    </div>
  );
}
