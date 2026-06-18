import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  fetchWebsiteDetail,
  deleteWebsite,
  deletePageByPath,
  linkWebsiteToOrganization,
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
  type WebsiteDetailTab,
  type OrganizationsResponse,
  type WebsiteProjectDomainFields,
} from "./websiteDetail.utils";
import { useWebsiteDetailBulkSeo } from "./useWebsiteDetailBulkSeo";
import { ThreeStepOnboarding } from "./WebsiteDetail/ThreeStepOnboarding";
import { PageGenerationStatusList } from "./WebsiteDetail/PageGenerationStatusList";
import {
  WebsiteDetailLoading,
  WebsiteDetailError,
  WebsiteDetailNotFound,
} from "./WebsiteDetail/WebsiteDetailStates";
import {
  HeaderActionPills,
  HeaderActionIcons,
} from "./WebsiteDetail/WebsiteDetailHeaderActions";
import { WebsiteDetailTabContent } from "./WebsiteDetail/WebsiteDetailTabContent";
import {
  WebsiteDetailHeader,
  WebsiteDetailTabBar,
} from "./WebsiteDetail/WebsiteDetailHeader";
import { WebsiteDetailModals } from "./WebsiteDetail/WebsiteDetailModals";

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
    return <WebsiteDetailLoading />;
  }

  if (error) {
    return (
      <WebsiteDetailError
        embedded={embedded}
        backPath={backPath}
        backLabel={backLabel}
        error={error}
        loadWebsite={loadWebsite}
      />
    );
  }

  if (!website) {
    return (
      <WebsiteDetailNotFound
        embedded={embedded}
        backPath={backPath}
        backLabel={backLabel}
      />
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
    <HeaderActionPills
      website={website}
      id={id}
      customDomain={customDomain}
      domainVerifiedAt={domainVerifiedAt}
      showOrgDropdown={showOrgDropdown}
      isLinking={isLinking}
      loadingOrgs={loadingOrgs}
      availableOrganizations={availableOrganizations}
      orgDropdownRef={orgDropdownRef}
      setShowIdentityModal={setShowIdentityModal}
      setShowOrgDropdown={setShowOrgDropdown}
      setShowDomainModal={setShowDomainModal}
      setSelectedOrgId={setSelectedOrgId}
      setIsLinking={setIsLinking}
      handleUnlink={handleUnlink}
      loadWebsite={loadWebsite}
      loadAvailableOrganizations={loadAvailableOrganizations}
    />
  );

  const headerActionIcons = (
    <HeaderActionIcons
      isLive={isLive}
      isDeleting={isDeleting}
      liveDomain={liveDomain}
      loadWebsite={loadWebsite}
      handleDelete={handleDelete}
    />
  );

  return (
    <div className="space-y-6">
      <WebsiteDetailHeader
        embedded={embedded}
        backPath={backPath}
        backLabel={backLabel}
        website={website}
        gbpData={gbpData}
        headerActionPills={headerActionPills}
        headerActionIcons={headerActionIcons}
      />

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

      <WebsiteDetailTabBar
        embedded={embedded}
        hideTabBar={hideTabBar}
        detailTab={detailTab}
        setDetailTab={setDetailTab}
      />

      <WebsiteDetailTabContent
        detailTab={detailTab}
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
        layoutsStatus={layoutsStatus}
        setShowLayoutsModal={setShowLayoutsModal}
        loadingSnippets={loadingSnippets}
        codeSnippets={codeSnippets}
        loadCodeSnippets={loadCodeSnippets}
        pageGenStatuses={pageGenStatuses}
      />

      <WebsiteDetailModals
        website={website}
        id={id}
        gbpData={gbpData}
        showIdentityModal={showIdentityModal}
        showLayoutsModal={showLayoutsModal}
        showCreatePageModal={showCreatePageModal}
        showFindReplaceModal={showFindReplaceModal}
        showDomainModal={showDomainModal}
        layoutsStatus={layoutsStatus}
        layoutSlots={layoutSlots}
        layoutSlotValues={layoutSlotValues}
        loadingLayoutSlots={loadingLayoutSlots}
        startingLayouts={startingLayouts}
        customDomain={customDomain}
        domainVerifiedAt={domainVerifiedAt}
        setShowIdentityModal={setShowIdentityModal}
        setShowLayoutsModal={setShowLayoutsModal}
        setShowCreatePageModal={setShowCreatePageModal}
        setShowFindReplaceModal={setShowFindReplaceModal}
        setShowDomainModal={setShowDomainModal}
        setWebsite={setWebsite}
        setIsGeneratingPage={setIsGeneratingPage}
        expectedPageCountRef={expectedPageCountRef}
        navigate={navigate}
        invalidateWebsite={invalidateWebsite}
        updateLayoutSlotValue={updateLayoutSlotValue}
        handleStartLayouts={handleStartLayouts}
        handleCancelLayouts={handleCancelLayouts}
        startPageGenerationPoll={startPageGenerationPoll}
      />
    </div>
  );
}
