import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Globe,
  ExternalLink,
  Clock,
  CheckCircle,
  Check,
  Building2,
  FileText,
  Loader2,
  AlertCircle,
  Star,
  X,
  Code,
  Trash2,
  Pencil,
  ChevronDown,
  Hash,
  Sparkles,
  RefreshCw,
  RotateCcw,
  Layout,
  Image,
  Inbox,
  Newspaper,
  Menu,
  ArrowRightLeft,
  Archive,
  Wrench,
  Fingerprint,
  Lock,
  Eye,
  DollarSign,
  Plug,
  Search,
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
  startBulkSeoGenerate,
  getBulkSeoStatus,
  getActiveBulkSeoJob,
  updatePageDisplayName,
} from "../../api/websites";
import type { WebsiteProjectWithPages, WebsitePage, PageGenerationStatusItem, BulkSeoStatus } from "../../api/websites";
import { toast } from "react-hot-toast";
import {
  useAdminWebsiteDetail,
  useInvalidateAdminWebsiteDetail,
} from "../../hooks/queries/useAdminQueries";
import {
  AdminPageHeader,
  ActionButton,
  BulkActionBar,
} from "../../components/ui/DesignSystem";
import CreatePageModal from "../../components/Admin/CreatePageModal";
import IdentityModal from "../../components/Admin/IdentityModal";
import LayoutInputsModal from "../../components/Admin/LayoutInputsModal";
import MediaTab from "../../components/Admin/MediaTab";
import CodeManagerTab from "../../components/Admin/CodeManagerTab";
import ConnectDomainModal from "../../components/Admin/ConnectDomainModal";
import RecipientsConfig from "../../components/Admin/RecipientsConfig";
import FormSubmissionsTab from "../../components/Admin/FormSubmissionsTab";
import PostsTab from "../../components/Admin/PostsTab";
import MenusTab from "../../components/Admin/MenusTab";
import BackupsTab from "../../components/Admin/BackupsTab";
import AiCommandTab from "../../components/Admin/AiCommandTab";
import RedirectsTab from "../../components/Admin/RedirectsTab";
import ReviewsTab from "../../components/Admin/ReviewsTab";
import CostsTab from "../../components/Admin/CostsTab";
import IntegrationsTab from "../../components/Admin/IntegrationsTab";
import FindReplaceModal from "../../components/Admin/FindReplaceModal";
import { fetchProjectCodeSnippets } from "../../api/codeSnippets";
import type { CodeSnippet } from "../../api/codeSnippets";
import { adminFetch } from "../../api";
import { useConfirm } from "../../components/ui/ConfirmModal";

type OrganizationListItem = {
  id: number;
  name: string;
  website?: unknown | null;
};

type OrganizationsResponse = {
  organizations?: OrganizationListItem[];
};

type WebsiteProjectDomainFields = WebsiteProjectWithPages & {
  domain_verified_at?: string | null;
};

const WEBSITE_DETAIL_TABS = [
  "pages",
  "layouts",
  "code-manager",
  "media",
  "form-submissions",
  "posts",
  "menus",
  "reviews",
  "redirects",
  "integrations",
  "backups",
  "advanced-tools",
  "costs",
] as const;

type WebsiteDetailTab = (typeof WEBSITE_DETAIL_TABS)[number];

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * SEO score matching SeoPanel's calculateScores exactly.
 * Uses sibling titles/descriptions for uniqueness checks.
 * Uses wrapper HTML for page-speed and housekeeping checks.
 */
function computeSeoScore(
  seoData: WebsitePage["seo_data"],
  siblingTitles: string[],
  siblingDescriptions: string[],
  wrapperHtml: string
): {
  score: number;
  max: number;
  pct: number;
  colorClass: string;
  barClass: string;
} {
  if (!seoData) return { score: 0, max: 100, pct: 0, colorClass: "text-gray-400", barClass: "bg-gray-300" };

  const title = seoData.meta_title || "";
  const desc = seoData.meta_description || "";
  const canonical = seoData.canonical_url || "";
  const robots = seoData.robots || "";
  const ogTitle = seoData.og_title || "";
  const ogDesc = seoData.og_description || "";
  const ogImage = seoData.og_image || "";
  const ogType = seoData.og_type || "";
  const schema = seoData.schema_json || [];
  const maxPreview = seoData.max_image_preview || "";

  const titleIsUnique = title ? !siblingTitles.includes(title) : false;
  const descIsUnique = desc ? !siblingDescriptions.includes(desc) : false;

  const hasViewport = /meta.*viewport/i.test(wrapperHtml);
  const hasCharset = /charset.*utf-8/i.test(wrapperHtml);
  const hasLang = /lang\s*=\s*["']en/i.test(wrapperHtml);
  const hasDeferScripts = /defer|async/i.test(wrapperHtml);
  const hasPreload = /rel\s*=\s*["']preload/i.test(wrapperHtml);

  let score = 0;

  // Critical (30) — exact match with SeoPanel
  if (canonical.length > 0) score += 8;
  if (title.length >= 20) score += 7;
  if (titleIsUnique) score += 6;
  if (title.length >= 50 && title.length <= 60) score += 5;
  if (robots.includes("index") || robots === "") score += 4;

  // High Impact (25)
  if (desc.length > 0) score += 6;
  if (desc.length > 40) score += 5;
  if (desc.length >= 140 && desc.length <= 160) score += 5;
  if (descIsUnique) score += 5;
  if (maxPreview === "large") score += 4;

  // Significant (22)
  if (schema.some((s) => s["@type"] === "LocalBusiness")) score += 6;
  if (schema.some((s) => s["@type"] === "FAQPage")) score += 5;
  if (schema.some((s) => s["@type"] === "Organization")) score += 4;
  if (schema.some((s) => s["@type"] === "Service")) score += 4;
  if (schema.some((s) => s["@type"] === "BreadcrumbList")) score += 3;

  // Moderate (13)
  if (ogImage.length > 0) score += 4;
  if (ogImage.length > 0) score += 4; // "Real photo, not logo" — same check as SeoPanel
  if (ogTitle.length > 0) score += 3;
  score += 2; // "OG URL matches canonical" — always true in SeoPanel

  // Page Speed Tags (7)
  if (hasViewport) score += 3;
  if (hasDeferScripts) score += 3;
  if (hasPreload) score += 1;

  // Housekeeping (3)
  if (hasCharset) score += 1;
  if (hasLang) score += 1;
  if (ogType.length > 0) score += 0.5;
  if (ogDesc.length > 0) score += 0.5;

  const max = 100;
  const pct = Math.round((score / max) * 100);

  let colorClass: string;
  let barClass: string;
  if (pct >= 90) { colorClass = "text-green-600"; barClass = "bg-green-500"; }
  else if (pct >= 75) { colorClass = "text-lime-600"; barClass = "bg-lime-500"; }
  else if (pct >= 55) { colorClass = "text-orange-500"; barClass = "bg-orange-500"; }
  else if (pct >= 35) { colorClass = "text-red-500"; barClass = "bg-red-500"; }
  else { colorClass = "text-gray-400"; barClass = "bg-gray-300"; }

  return { score, max, pct, colorClass, barClass };
}

/**
 * Group pages by path for the expandable list.
 * Returns { path: string, pages: WebsitePage[] }[] sorted by path,
 * with each group's pages sorted by version desc.
 */
function groupPagesByPath(pages: WebsitePage[]) {
  const map = new Map<string, WebsitePage[]>();
  for (const page of pages) {
    const group = map.get(page.path) || [];
    group.push(page);
    map.set(page.path, group);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, pages]) => ({
      path,
      pages: pages.sort((a, b) => b.version - a.version),
    }));
}

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

  // Bulk SEO generation state
  const [, setBulkSeoJobId] = useState<string | null>(null);
  const [bulkSeoStatus, setBulkSeoStatus] = useState<BulkSeoStatus | null>(null);
  const bulkSeoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopBulkSeoPoll = useCallback(() => {
    if (bulkSeoIntervalRef.current) {
      clearInterval(bulkSeoIntervalRef.current);
      bulkSeoIntervalRef.current = null;
    }
  }, []);

  const pollBulkSeo = useCallback(async (jobId: string) => {
    if (!id) return;
    try {
      const res = await getBulkSeoStatus(id, jobId);
      setBulkSeoStatus(res.data);
      if (res.data.status === "completed" || res.data.status === "failed") {
        stopBulkSeoPoll();
        if (res.data.status === "completed") {
          invalidateWebsite(id!);
          setTimeout(() => {
            setBulkSeoStatus(null);
            setBulkSeoJobId(null);
          }, 2000);
        }
      }
    } catch {
      stopBulkSeoPoll();
    }
  }, [id, stopBulkSeoPoll, invalidateWebsite]);

  const startBulkPageSeo = useCallback(async (paths?: string[]) => {
    if (!id) return;
    try {
      const res = await startBulkSeoGenerate(id, "page", undefined, paths);
      setBulkSeoJobId(res.job_id);
      setBulkSeoStatus({ id: res.job_id, status: "queued", total_count: 0, completed_count: 0, failed_count: 0, failed_items: null });
      stopBulkSeoPoll();
      await pollBulkSeo(res.job_id);
      bulkSeoIntervalRef.current = setInterval(() => pollBulkSeo(res.job_id), 2000);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to start SEO generation"));
    }
  }, [id, pollBulkSeo, stopBulkSeoPoll]);

  useEffect(() => {
    return () => stopBulkSeoPoll();
  }, [stopBulkSeoPoll]);

  // On mount: check for active page SEO job and resume polling
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getActiveBulkSeoJob(id, "page");
        if (cancelled) return;
        if (res.data && (res.data.status === "queued" || res.data.status === "processing")) {
          setBulkSeoJobId(res.data.id);
          setBulkSeoStatus(res.data);
          bulkSeoIntervalRef.current = setInterval(() => pollBulkSeo(res.data!.id), 2000);
        }
      } catch {
        // Silently ignore
      }
    })();
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isBulkSeoActive = bulkSeoStatus !== null && (bulkSeoStatus.status === "queued" || bulkSeoStatus.status === "processing");

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

  const NON_POLLING_STATUSES = ["CREATED", "LIVE"];
  const POLL_INTERVAL = 3000;

  const loadCodeSnippets = useCallback(async () => {
    if (!id) return;

    try {
      setLoadingSnippets(true);
      const response = await fetchProjectCodeSnippets(id);
      setCodeSnippets(response.data);
    } catch (err) {
      console.error("Failed to fetch code snippets:", err);
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
      console.error("Failed to load organizations:", err);
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
      console.error("Failed to link organization:", err);
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
        console.error("Polling error:", err);
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
        console.error("Page gen polling error:", err);
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
        console.error("Failed to load layouts:", err);
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
      console.error("Failed to start layouts:", err);
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
      console.error("Failed to cancel layouts:", err);
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
      console.error("Failed to delete website:", err);
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
      console.error("Failed to delete page version:", err);
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
      console.error("Failed to delete page:", err);
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
        console.error("Page generation poll error:", err);
        if (attempts < maxAttempts) {
          pageGenPollRef.current = setTimeout(poll, POLL_INTERVAL);
        } else {
          setIsGeneratingPage(false);
        }
      }
    };

    pageGenPollRef.current = setTimeout(poll, POLL_INTERVAL);
  }, [id]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusStyles = (status: string): string => {
    switch (status) {
      case "LIVE":
        return "border-green-200 bg-green-100 text-green-700";
      case "IN_PROGRESS":
        return "border-purple-200 bg-purple-100 text-purple-700";
      case "CREATED":
        return "border-gray-200 bg-gray-100 text-gray-700";
      default:
        return "border-gray-200 bg-gray-100 text-gray-700";
    }
  };

  const getGenStatusStyles = (genStatus: string): string => {
    switch (genStatus) {
      case "ready":
        return "border-green-200 bg-green-100 text-green-700";
      case "generating":
        return "border-amber-200 bg-amber-100 text-amber-700";
      case "queued":
        return "border-gray-200 bg-gray-100 text-gray-500";
      case "failed":
        return "border-red-200 bg-red-100 text-red-700";
      case "cancelled":
        return "border-gray-300 bg-gray-200 text-gray-600";
      default:
        return "border-gray-200 bg-gray-100 text-gray-500";
    }
  };

  const handleCancelGeneration = async () => {
    if (!id) return;
    if (!(await confirm({ title: "Cancel all in-progress page generation?", confirmLabel: "Cancel all", variant: "danger" }))) return;
    try {
      await cancelGeneration(id);
      // Force immediate poll to refresh statuses
      const response = await fetchPagesGenerationStatus(id);
      setPageGenStatuses(response.data);
    } catch (err) {
      console.error("Cancel generation error:", err);
    }
  };

  const formatStatus = (status: string): string =>
    status
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ");

  const getPageStatusStyles = (status: string): string => {
    switch (status) {
      case "published":
        return "border-green-200 bg-green-100 text-green-700";
      case "draft":
        return "border-yellow-200 bg-yellow-100 text-yellow-700";
      case "inactive":
        return "border-gray-200 bg-gray-100 text-gray-500";
      default:
        return "border-gray-200 bg-gray-100 text-gray-700";
    }
  };

  const isProcessingStatus = (status: string): boolean =>
    status === "IN_PROGRESS";

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
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 text-alloro-orange animate-spin" />
                    <span className="text-sm font-medium text-gray-900">
                      {isCreatingAll ? "Creating pages…" : "Pages in progress"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {gbpData?.name && (
                      <span className="text-xs text-gray-500 truncate max-w-[200px]">
                        {String(gbpData.name)}
                      </span>
                    )}
                    {pageGenStatuses.some((p) => p.generation_status === "queued" || p.generation_status === "generating") && (
                      <button
                        onClick={handleCancelGeneration}
                        className="text-xs font-medium text-red-600 hover:text-red-800 px-2 py-1 rounded border border-red-200 hover:bg-red-50 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {/* Project-level progress bar */}
                {pageGenStatuses.length > 0 && (() => {
                  const readyCount = pageGenStatuses.filter((p) => p.generation_status === "ready").length;
                  const totalCount = pageGenStatuses.length;
                  const pct = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{readyCount} of {totalCount} pages complete</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-alloro-orange rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {pageGenStatuses.length > 0 ? (
                  <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 overflow-hidden">
                    {pageGenStatuses.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-2.5 bg-white">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                          <span className="text-sm text-gray-700 truncate">
                            {p.template_page_name || p.path}
                          </span>
                          <span className="text-xs text-gray-400">{p.path}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {(p.generation_status === "generating" || p.generation_status === "queued") && (
                            <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />
                          )}
                          {p.generation_status === "ready" && (
                            <Check className="h-3.5 w-3.5 text-green-500 stroke-[3]" />
                          )}
                          {p.generation_status === "cancelled" && (
                            <X className="h-3.5 w-3.5 text-gray-500 stroke-[3]" />
                          )}
                          {/* Per-page component progress */}
                          {p.generation_status === "generating" && p.generation_progress && (
                            <span className="text-[10px] text-amber-600 font-medium">
                              {p.generation_progress.current_component} ({p.generation_progress.completed}/{p.generation_progress.total})
                            </span>
                          )}
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getGenStatusStyles(p.generation_status)}`}>
                            {p.generation_status}
                          </span>
                          {(p.generation_status === "ready" || p.generation_status === "generating") && (
                            <Link
                              to={`/admin/websites/${id}/pages/${p.id}/edit`}
                              className="text-xs text-alloro-orange hover:underline font-medium"
                            >
                              {p.generation_status === "generating" ? "Preview" : "View"}
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Waiting for page generation status…</p>
                )}
              </div>
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
                <span className="flex items-center gap-1.5 text-xs text-alloro-orange font-medium">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  SEO {bulkSeoStatus.completed_count}/{bulkSeoStatus.total_count}
                </span>
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
                          console.error(`Failed to publish ${path}:`, err);
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
      )}

      {/* Layouts Section */}
      {detailTab === "layouts" && (
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {/* Generate Layouts summary card — opens modal for inputs */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">Generate Layouts</h3>
                  {layoutsStatus?.generated_at &&
                    layoutsStatus?.status !== "generating" &&
                    layoutsStatus?.status !== "queued" && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                        <Check className="h-3 w-3" /> Ready
                      </span>
                    )}
                  {(layoutsStatus?.status === "generating" ||
                    layoutsStatus?.status === "queued") && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      <Loader2 className="h-3 w-3 animate-spin" /> Generating
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Wrapper, header, and footer — generated once, reused across pages.
                </p>
              </div>
              <button
                onClick={() => setShowLayoutsModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              >
                {layoutsStatus?.status === "generating" ||
                layoutsStatus?.status === "queued" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    View progress
                  </>
                ) : layoutsStatus?.generated_at ? (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Regenerate
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Existing per-layout editor links */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h3 className="text-lg font-semibold text-gray-900">Edit Layouts Directly</h3>
            <p className="text-xs text-gray-500 mt-1">
              Fine-tune wrapper, header, and footer manually.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {(["wrapper", "header", "footer"] as const).map((field) => (
              <Link
                key={field}
                to={`/admin/websites/${id}/layout/${field}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Code className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900 capitalize">
                      {field}
                    </p>
                    <p className="text-xs text-gray-500">
                      {field === "wrapper"
                        ? "HTML shell with {{slot}} placeholder"
                        : field === "header"
                          ? "Site header rendered on all pages"
                          : "Site footer rendered on all pages"}
                    </p>
                  </div>
                </div>
                <Pencil className="h-4 w-4 text-gray-400" />
              </Link>
            ))}
          </div>
          </div>
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

// ---------------------------------------------------------------------------
// ThreeStepOnboarding — shown on CREATED projects as a visual progress guide
// ---------------------------------------------------------------------------

function ThreeStepOnboarding({
  website,
  onOpenIdentity,
  onOpenLayouts,
  onOpenFirstPage,
}: {
  website: WebsiteProjectWithPages;
  onOpenIdentity: () => void;
  onOpenLayouts: () => void;
  onOpenFirstPage: () => void;
}) {
  const identityStatus = website.project_identity?.meta?.warmup_status || null;
  const identityReady = identityStatus === "ready";
  const identityRunning = identityStatus === "running" || identityStatus === "queued";
  const layoutsReady = !!website.wrapper && website.wrapper.length > 100;
  const hasPages = (website.pages?.length || 0) > 0;

  return (
    <div className="flex flex-col divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
      <StepRow
        title="Project Identity"
        state={identityReady ? "ready" : identityRunning ? "running" : "active"}
        onStart={onOpenIdentity}
        startLabel={identityReady ? "Edit" : identityRunning ? "Warming up…" : "Start"}
      />
      <StepRow
        title="Generate Layouts"
        state={layoutsReady ? "ready" : identityReady ? "active" : "locked"}
        onStart={onOpenLayouts}
        startLabel={layoutsReady ? "Regenerate" : "Start"}
        disabled={!identityReady && !layoutsReady}
      />
      <StepRow
        title="Generate First Page"
        state={hasPages ? "ready" : layoutsReady ? "active" : "locked"}
        onStart={onOpenFirstPage}
        startLabel={hasPages ? "View pages" : "Start"}
        disabled={!layoutsReady && !hasPages}
      />
    </div>
  );
}

type StepState = "active" | "active-soon" | "running" | "ready" | "locked";

function StepRow({
  title,
  state,
  onStart,
  startLabel,
  disabled,
}: {
  title: string;
  state: StepState;
  onStart: () => void;
  startLabel: string;
  disabled?: boolean;
}) {
  const isReady = state === "ready";
  const isRunning = state === "running";
  const isLocked = state === "locked";

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
            isReady
              ? "border-green-500 bg-green-500 text-white"
              : isRunning
                ? "border-amber-400 bg-amber-50 text-amber-600"
                : isLocked
                  ? "border-gray-200 bg-gray-50 text-gray-300"
                  : "border-gray-300 bg-white"
          }`}
        >
          {isReady && <Check className="h-3 w-3 stroke-[3]" strokeWidth={3} />}
          {isRunning && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          {isLocked && <Lock className="h-2.5 w-2.5" />}
        </div>
        <span className={`text-sm ${isLocked ? "text-gray-400" : "text-gray-800"}`}>
          {title}
        </span>
      </div>
      <button
        onClick={onStart}
        disabled={disabled || isRunning}
        className={`text-xs font-medium transition ${
          isLocked || disabled
            ? "text-gray-300 cursor-not-allowed"
            : isRunning
              ? "text-amber-600 cursor-default"
              : isReady
                ? "text-gray-500 hover:text-alloro-orange"
                : "text-alloro-orange hover:underline"
        }`}
      >
        {startLabel}
      </button>
    </div>
  );
}
