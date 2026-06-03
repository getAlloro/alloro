import { useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox,
  Mail,
  MailOpen,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  X,
  Download,
  ShieldAlert,
  CheckCircle2,
  FileText,
  Image,
  Circle,
  CheckCircle,
  Send,
  Loader2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  fetchFormSubmissions,
  fetchFormSubmission,
  markAllFormSubmissionsRead,
  toggleFormSubmissionRead,
  deleteFormSubmission,
  sendFormSubmissionEmail,
  bulkSendFormSubmissionsEmail,
  bulkDeleteFormSubmissions,
  bulkToggleFormSubmissionsRead,
} from "../../api/websites";
import type {
  FileValue,
  FormContents,
  FormSection,
  FormSubmission,
  FormSubmissionsResponse,
} from "../../api/websites";
import {
  type FetchFormRecipientCatalogFn,
  type UpdateFormCatalogPreferencesFn,
  type FetchWebsiteRecipientsFn,
  type UpdateFormRecipientRuleFn,
  useAdminWebsiteRecipients,
  useUpdateWebsiteFormCatalogPreferences,
  useWebsiteFormRecipientCatalog,
} from "../../hooks/queries/useWebsiteFormRecipientRouting";
import { BulkActionBar } from "../ui/DesignSystem";
import { FormSubmissionsSettingsModal } from "./FormSubmissionsSettingsModal";
import { FormSubmissionsSidebar } from "./FormSubmissionsSidebar";
import {
  FormSubmissionsViewTabs,
  type FormSubmissionsView,
} from "./FormSubmissionsViewTabs";
import { SelectedFormRoutingSettings } from "./SelectedFormRoutingSettings";

function isFileValue(value: unknown): value is FileValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "s3Key" in value &&
    "name" in value
  );
}

function isSectionsFormat(contents: FormContents): contents is FormSection[] {
  return Array.isArray(contents);
}

/** Extract preview text from either format */
function previewFields(contents: FormContents): string {
  if (isSectionsFormat(contents)) {
    // Grab first 2 text fields from first section
    const textFields: string[] = [];
    for (const section of contents) {
      for (const [k, v] of section.fields) {
        if (typeof v === "string" && v.trim()) {
          textFields.push(`${k}: ${v}`);
          if (textFields.length >= 2) break;
        }
      }
      if (textFields.length >= 2) break;
    }
    return textFields.join(" \u00b7 ");
  }
  // Legacy flat format
  const textEntries = Object.entries(contents).filter(
    ([, v]) => typeof v === "string",
  ) as [string, string][];
  return textEntries.slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" \u00b7 ");
}

interface Props {
  projectId: string;
  isAdmin?: boolean;
  fetchSubmissionsFn?: FetchSubmissionsFn;
  fetchFormCatalogFn?: FetchFormRecipientCatalogFn;
  fetchRecipientsFn?: FetchWebsiteRecipientsFn;
  updateFormRecipientRuleFn?: UpdateFormRecipientRuleFn;
  updateFormPreferencesFn?: UpdateFormCatalogPreferencesFn;
  markAllReadFn?: MarkAllReadFn;
  formCatalogQueryScope?: "admin" | "client";
  toggleReadFn?: typeof toggleFormSubmissionRead;
  deleteSubmissionFn?: typeof deleteFormSubmission;
  onExport?: () => void;
  settingsContent?: ReactNode;
}

type FormSubmissionsResult = FormSubmissionsResponse & {
  error?: string;
  errorMessage?: string;
};

type FetchSubmissionsFn = (
  projectId: string,
  page: number,
  limit: number,
  filter?: string,
  formName?: string,
) => Promise<FormSubmissionsResult>;

type MarkAllReadFn = (
  projectId: string,
  formName?: string,
) => Promise<unknown>;

type TabFilter = "all" | "verified" | "flagged";

export default function FormSubmissionsTab({
  projectId,
  isAdmin = false,
  fetchSubmissionsFn,
  fetchFormCatalogFn,
  fetchRecipientsFn,
  updateFormRecipientRuleFn,
  updateFormPreferencesFn,
  markAllReadFn,
  formCatalogQueryScope = "admin",
  toggleReadFn,
  deleteSubmissionFn,
  onExport,
  settingsContent,
}: Props) {
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [allCount, setAllCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [activeView, setActiveView] =
    useState<FormSubmissionsView>("submissions");
  const [selectedFormKey, setSelectedFormKey] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [detailSubmission, setDetailSubmission] = useState<FormSubmission | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [sendingSubmissionIds, setSendingSubmissionIds] = useState<Set<string>>(
    new Set(),
  );
  const catalogQueryKey = useMemo(
    () => [formCatalogQueryScope, "website", projectId, "form-catalog"],
    [formCatalogQueryScope, projectId],
  );
  const catalogQuery = useWebsiteFormRecipientCatalog(projectId, {
    fetchCatalogFn: fetchFormCatalogFn,
    queryKey: catalogQueryKey,
    refetchInterval: 5000,
  });
  const recipientsQueryKey = useMemo(
    () => [formCatalogQueryScope, "website", projectId, "recipients"],
    [formCatalogQueryScope, projectId],
  );
  const recipientsQuery = useAdminWebsiteRecipients(projectId, {
    fetchRecipientsFn,
    queryKey: recipientsQueryKey,
  });
  const updateFormPreferences = useUpdateWebsiteFormCatalogPreferences(
    projectId,
    {
      updatePreferencesFn: updateFormPreferencesFn,
      catalogQueryKey,
    },
  );
  const forms = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const selectedForm = useMemo(
    () =>
      forms.find((form) => form.form_key === selectedFormKey) ??
      forms[0] ??
      null,
    [forms, selectedFormKey],
  );
  const selectedFormName = selectedForm?.form_name ?? null;

  useEffect(() => {
    if (forms.length === 0) {
      setSelectedFormKey(null);
      return;
    }

    if (!selectedFormKey || !forms.some((form) => form.form_key === selectedFormKey)) {
      setSelectedFormKey(forms[0].form_key);
    }
  }, [forms, selectedFormKey]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (catalogQuery.isLoading) return;
    if (!selectedFormName) {
      setSubmissions([]);
      setTotalPages(1);
      setAllCount(0);
      setUnreadCount(0);
      setFlaggedCount(0);
      setVerifiedCount(0);
      setLoading(false);
      return;
    }

    try {
      if (!options?.silent) setLoading(true);
      const fetchFn: FetchSubmissionsFn =
        fetchSubmissionsFn ??
        (fetchFormSubmissions as FetchSubmissionsFn);
      const filterParam = activeTab === "all" ? undefined : activeTab;
      const res = await fetchFn(
        projectId,
        page,
        20,
        filterParam,
        selectedFormName,
      );
      if (res.error || res.success === false) {
        if (!options?.silent) {
          toast.error(res.error || res.errorMessage || "Failed to load submissions");
        }
        return;
      }
      setSubmissions(res.data || []);
      setTotalPages(res.pagination?.totalPages || 1);
      setAllCount(res.allCount ?? res.pagination?.total ?? 0);
      setUnreadCount(res.unreadCount || 0);
      setFlaggedCount(res.flaggedCount || 0);
      setVerifiedCount(res.verifiedCount || 0);
    } catch {
      if (!options?.silent) toast.error("Failed to load submissions");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [
    projectId,
    page,
    activeTab,
    fetchSubmissionsFn,
    catalogQuery.isLoading,
    selectedFormName,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      load({ silent: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [load]);

  const buildPreferencePayload = useCallback(
    (nextForms: typeof forms) => ({
      preferences: nextForms.map((form, index) => ({
        formName: form.form_name,
        displayLabel: form.display_label,
        sortOrder: index,
      })),
    }),
    [],
  );

  const handleRenameForm = async (formKey: string, label: string) => {
    const form = forms.find((item) => item.form_key === formKey);
    if (!form) return;

    const trimmedLabel = label.trim();
    const displayLabel =
      !trimmedLabel || trimmedLabel === form.form_name ? null : trimmedLabel;
    const nextForms = forms.map((item) =>
      item.form_key === formKey
        ? { ...item, display_label: displayLabel }
        : item,
    );

    try {
      await updateFormPreferences.mutateAsync(
        buildPreferencePayload(nextForms),
      );
      toast.success("Form label updated");
    } catch {
      toast.error("Failed to update form label");
    }
  };

  const handleReorderForms = async (orderedKeys: string[]) => {
    const byKey = new Map(forms.map((form) => [form.form_key, form]));
    const nextForms = orderedKeys
      .map((key) => byKey.get(key))
      .filter((form): form is (typeof forms)[number] => Boolean(form));
    if (nextForms.length !== forms.length) return;

    try {
      await updateFormPreferences.mutateAsync(
        buildPreferencePayload(nextForms),
      );
    } catch {
      toast.error("Failed to reorder forms");
    }
  };

  /** Check if contents has any file values that need pre-signed URLs */
  const hasFiles = (contents: FormContents): boolean => {
    if (isSectionsFormat(contents)) {
      return contents.some((s) => s.fields.some(([, v]) => isFileValue(v)));
    }
    return Object.values(contents).some(isFileValue);
  };

  const handleSelect = async (sub: FormSubmission) => {
    if (selectedId === sub.id) {
      setSelectedId(null);
      setDetailSubmission(null);
      return;
    }

    setSelectedId(sub.id);
    if (!sub.is_read) handleToggleRead(sub);

    if (hasFiles(sub.contents)) {
      setDetailLoading(true);
      try {
        const res = await fetchFormSubmission(projectId, sub.id);
        if (res.success && res.data) {
          setDetailSubmission(res.data);
        } else {
          setDetailSubmission(sub);
        }
      } catch {
        setDetailSubmission(sub);
      } finally {
        setDetailLoading(false);
      }
    } else {
      setDetailSubmission(sub);
    }
  };

  const handleTabChange = (tab: TabFilter) => {
    setActiveTab(tab);
    setPage(1);
    setSelectedId(null);
    setDetailSubmission(null);
    setSelectedIds(new Set());
  };

  const handleToggleRead = async (sub: FormSubmission) => {
    try {
      const toggleFn = toggleReadFn || toggleFormSubmissionRead;
      await toggleFn(projectId, sub.id, !sub.is_read);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === sub.id ? { ...s, is_read: !s.is_read } : s)),
      );
      setUnreadCount((c) => (sub.is_read ? c + 1 : Math.max(0, c - 1)));
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const deleteFn = deleteSubmissionFn || deleteFormSubmission;
      await deleteFn(projectId, id);
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
      setAllCount((count) => Math.max(0, count - 1));
      if (selectedId === id) {
        setSelectedId(null);
        setDetailSubmission(null);
      }
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleMarkAllRead = async () => {
    if (!selectedForm?.form_name || unreadCount === 0) return;

    try {
      const markAllFn = markAllReadFn || markAllFormSubmissionsRead;
      await markAllFn(projectId, selectedForm.form_name);
      setSubmissions((prev) => prev.map((sub) => ({ ...sub, is_read: true })));
      setUnreadCount(0);
      await catalogQuery.refetch();
      await load({ silent: true });
      toast.success("Marked all as read");
    } catch {
      toast.error("Failed to mark submissions read");
    }
  };

  const handleSendSingle = async (sub: FormSubmission, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sendingSubmissionIds.has(sub.id)) return;

    setSendingSubmissionIds((prev) => new Set(prev).add(sub.id));
    try {
      await sendFormSubmissionEmail(projectId, sub.id);
      toast.success("Sent to current recipients");
    } catch {
      toast.error("Failed to send");
    } finally {
      setSendingSubmissionIds((prev) => {
        const next = new Set(prev);
        next.delete(sub.id);
        return next;
      });
    }
  };

  // Multi-select helpers
  const toggleSelectItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Derived bulk state
  const selectedList = Array.from(selectedIds);
  const anySelectedUnread = selectedList.some(
    (id) => !submissions.find((s) => s.id === id)?.is_read,
  );

  const handleBulkSend = async () => {
    if (selectedIds.size === 0 || bulkLoading) return;
    try {
      setBulkLoading(true);
      const res = await bulkSendFormSubmissionsEmail(projectId, selectedList);
      const { sent, skipped } = res.data;
      toast.success(`Sent ${sent} submission${sent !== 1 ? "s" : ""}${skipped > 0 ? `, skipped ${skipped}` : ""}`);
      clearSelection();
    } catch {
      toast.error("Failed to send submissions");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || bulkLoading) return;
    try {
      setBulkLoading(true);
      await bulkDeleteFormSubmissions(projectId, selectedList);
      setSubmissions((prev) => prev.filter((s) => !selectedIds.has(s.id)));
      setAllCount((count) => Math.max(0, count - selectedIds.size));
      if (selectedId && selectedIds.has(selectedId)) {
        setSelectedId(null);
        setDetailSubmission(null);
      }
      toast.success(`Deleted ${selectedIds.size} submission${selectedIds.size !== 1 ? "s" : ""}`);
      clearSelection();
    } catch {
      toast.error("Failed to delete submissions");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkToggleRead = async (markAsRead: boolean) => {
    if (selectedIds.size === 0 || bulkLoading) return;
    try {
      setBulkLoading(true);
      await bulkToggleFormSubmissionsRead(projectId, selectedList, markAsRead);
      setSubmissions((prev) =>
        prev.map((s) => selectedIds.has(s.id) ? { ...s, is_read: markAsRead } : s),
      );
      const delta = selectedIds.size;
      setUnreadCount((c) => markAsRead ? Math.max(0, c - delta) : c + delta);
      toast.success(`Marked ${delta} as ${markAsRead ? "read" : "unread"}`);
      clearSelection();
    } catch {
      toast.error("Failed to update submissions");
    } finally {
      setBulkLoading(false);
    }
  };

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const currentDetail = detailSubmission && detailSubmission.id === selectedId ? detailSubmission : null;
  const currentDetailForm = useMemo(
    () =>
      currentDetail
        ? forms.find((form) => form.form_name === currentDetail.form_name) ?? null
        : null,
    [currentDetail, forms],
  );
  const currentDetailFormRecipients =
    currentDetailForm?.rule?.is_enabled &&
    currentDetailForm.rule.recipients.length > 0
      ? currentDetailForm.rule.recipients
      : null;
  const currentConfiguredRecipients =
    currentDetailFormRecipients ?? recipientsQuery.data?.recipients ?? [];
  const detailResendRecipients =
    currentConfiguredRecipients.length > 0
      ? currentConfiguredRecipients
      : currentDetail?.recipients_sent_to ?? [];
  const isShowingCurrentRecipients = currentConfiguredRecipients.length > 0;
  const isCurrentDetailSending = currentDetail
    ? sendingSubmissionIds.has(currentDetail.id)
    : false;
  const canUseBulkActions = isAdmin;
  const canResendSubmission = isAdmin;

  const bulkActions = [
    {
      label: "Resend",
      icon: <Send size={14} />,
      onClick: handleBulkSend,
      variant: "primary" as const,
      disabled: bulkLoading,
    },
    {
      label: anySelectedUnread ? "Mark Read" : "Mark Unread",
      icon: anySelectedUnread ? <Eye size={14} /> : <EyeOff size={14} />,
      onClick: () => handleBulkToggleRead(anySelectedUnread),
      variant: "secondary" as const,
      disabled: bulkLoading,
    },
    {
      label: "Delete",
      icon: <Trash2 size={14} />,
      onClick: handleBulkDelete,
      variant: "danger" as const,
      disabled: bulkLoading,
    },
  ];
  const tabs: Array<{
    key: TabFilter;
    label: string;
    count: number;
    icon: ReactNode;
    title: string;
  }> = [
    {
      key: "all",
      label: "All",
      count: allCount,
      icon: <Inbox size={14} />,
      title: "All submissions for this form",
    },
    {
      key: "verified",
      label: "Verified",
      count: verifiedCount,
      icon: <CheckCircle2 size={14} />,
      title: "Submissions for this form that were not flagged by AI",
    },
    {
      key: "flagged",
      label: "Flagged",
      count: flaggedCount,
      icon: <ShieldAlert size={14} />,
      title: "Submissions for this form held from email delivery",
    },
  ];

  return (
    <>
      <div className="grid overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:grid-cols-[300px_minmax(0,1fr)]">
        <FormSubmissionsSidebar
          forms={forms}
          selectedFormKey={selectedForm?.form_key ?? null}
          isLoading={catalogQuery.isLoading}
          onSelectForm={(formKey) => {
            setSelectedFormKey(formKey);
            setPage(1);
            setActiveTab("all");
            setSelectedId(null);
            setDetailSubmission(null);
            setSelectedIds(new Set());
          }}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onRenameForm={handleRenameForm}
          onReorderForms={handleReorderForms}
          isUpdatingPreferences={updateFormPreferences.isPending}
        />

        <section className="min-w-0">
          {/* Header */}
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-alloro-orange/10 text-alloro-orange">
                  <Inbox size={18} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    {selectedForm?.display_label ||
                      selectedForm?.form_name ||
                      "Form Submissions"}
                  </h3>
                  {selectedForm && (
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {selectedForm.form_name}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                      {allCount} total
                    </span>
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-alloro-orange px-2.5 py-1 text-xs font-medium text-white">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {onExport && allCount > 0 && activeView === "submissions" && (
                  <button
                    onClick={onExport}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                    title="Export submissions as CSV"
                  >
                    <Download size={14} />
                    Export
                  </button>
                )}
                <FormSubmissionsViewTabs
                  activeView={activeView}
                  onChange={setActiveView}
                />
              </div>
            </div>
          </div>

          {/* Tabs */}
          {activeView === "submissions" && (
            <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => handleTabChange(tab.key)}
                      title={tab.title}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        isActive
                          ? "border-alloro-orange bg-alloro-orange/10 text-alloro-orange"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                          isActive
                            ? "bg-white text-alloro-orange"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                title="Mark all submissions for this form as read"
              >
                <CheckCircle2 size={14} />
                Mark all as read
              </button>
            </div>
          )}

          {activeView === "settings" ? (
            <SelectedFormRoutingSettings
              projectId={projectId}
              form={selectedForm}
              fetchRecipientsFn={fetchRecipientsFn}
              updateRuleFn={updateFormRecipientRuleFn}
              queryScope={formCatalogQueryScope}
              catalogQueryKey={catalogQueryKey}
            />
          ) : (
            <>
              {/* Content */}
              {catalogQuery.isLoading || loading ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-16 animate-pulse rounded-lg bg-gray-100"
                    />
                  ))}
                </div>
              ) : !selectedForm ? (
                <div className="p-8 text-center">
                  <Inbox className="mx-auto mb-3 text-gray-300" size={32} />
                  <p className="text-sm text-gray-400">
                    No forms detected yet.
                  </p>
                </div>
              ) : submissions.length === 0 ? (
                <div className="p-8 text-center">
                  <Inbox className="mx-auto mb-3 text-gray-300" size={32} />
                  <p className="text-gray-400 text-sm">
                    {activeTab === "verified"
                      ? "No verified submissions for this form"
                      : activeTab === "flagged"
                        ? "No flagged submissions for this form"
                        : "No submissions for this form yet"}
                  </p>
                </div>
              ) : (
                <>
                  {/* Table */}
            <div className="divide-y divide-gray-100">
              {submissions.map((sub) => {
                const isMultiSelected = selectedIds.has(sub.id);
                const isSending = sendingSubmissionIds.has(sub.id);
                return (
                  <div
                    key={sub.id}
                    className={`flex cursor-pointer items-center gap-3 px-5 py-4 transition hover:bg-gray-50 ${
                      isMultiSelected
                        ? "bg-blue-50 border-l-2 border-blue-400"
                        : !sub.is_read
                          ? "bg-alloro-orange/5"
                          : sub.is_flagged
                            ? "bg-amber-50/50"
                            : ""
                    }`}
                    onClick={() => handleSelect(sub)}
                  >
                    {canUseBulkActions && (
                      <button
                        onClick={(e) => toggleSelectItem(sub.id, e)}
                        className="flex-shrink-0 text-gray-300 transition hover:text-blue-500"
                        title={isMultiSelected ? "Deselect" : "Select"}
                        aria-label={isMultiSelected ? "Deselect submission" : "Select submission"}
                      >
                        {isMultiSelected ? (
                          <CheckCircle size={16} className="text-blue-500" />
                        ) : (
                          <Circle size={16} />
                        )}
                      </button>
                    )}

                    <div className="flex-shrink-0">
                      {sub.is_flagged ? (
                        <ShieldAlert size={16} className="text-amber-500" />
                      ) : sub.is_read ? (
                        <MailOpen size={16} className="text-gray-300" />
                      ) : (
                        <Mail size={16} className="text-alloro-orange" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm ${!sub.is_read ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                          {sub.form_name}
                        </span>
                        <SubmissionStatusChip submission={sub} />
                        {sub.recipients_sent_to.length > 0 ? (
                          <span
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500"
                            title={sub.recipients_sent_to.join(", ")}
                          >
                            {sub.recipients_sent_to.length} recipient{sub.recipients_sent_to.length === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span
                            className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600"
                            title="No recipients were resolved when this submission was saved"
                          >
                            no email
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm text-gray-500">
                        {previewFields(sub.contents)}
                      </p>
                    </div>

                    <div className="hidden flex-shrink-0 text-xs text-gray-400 sm:block">
                      {relativeTime(sub.submitted_at)}
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-1">
                      {canResendSubmission && (
                        <button
                          onClick={(e) => handleSendSingle(sub, e)}
                          disabled={isSending}
                          className={`p-1.5 rounded-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${sub.is_flagged ? "hover:bg-amber-50 text-amber-400 hover:text-amber-600" : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"}`}
                          title={
                            isSending
                              ? "Resending to current configured recipients"
                              : "Resend to current configured recipients"
                          }
                          aria-label={isSending ? "Resending submission" : "Resend submission"}
                        >
                          {isSending ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Send size={14} />
                          )}
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleRead(sub); }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
                        title={sub.is_read ? "Mark unread" : "Mark read"}
                        aria-label={sub.is_read ? "Mark unread" : "Mark read"}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(sub.id); }}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition"
                        title="Delete"
                        aria-label="Delete submission"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detail modal */}
            <AnimatePresence>
              {currentDetail && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-50 flex items-center justify-center p-4"
                  onClick={() => { setSelectedId(null); setDetailSubmission(null); }}
                >
                  {/* Backdrop */}
                  <div className="absolute inset-0 bg-alloro-navy/40 backdrop-blur-sm" />

                  {/* Modal content */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="relative flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Modal header */}
                    <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate font-semibold text-gray-900">{currentDetail.form_name}</h4>
                          <SubmissionStatusChip submission={currentDetail} />
                        </div>
                        <p className="mt-1 text-xs text-gray-400">
                          {new Date(currentDetail.submitted_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {canResendSubmission && (
                          <button
                            onClick={(e) => handleSendSingle(currentDetail, e)}
                            disabled={isCurrentDetailSending}
                            title={
                              isCurrentDetailSending
                                ? "Resending to current configured recipients"
                                : "Resend to current configured recipients"
                            }
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition text-sm font-medium border disabled:cursor-not-allowed disabled:opacity-60 ${currentDetail.is_flagged ? "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200" : "bg-gray-50 text-gray-600 hover:bg-gray-100 border-gray-200"}`}
                          >
                            {isCurrentDetailSending ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Send size={13} />
                            )}
                            {isCurrentDetailSending ? "Sending..." : "Resend"}
                          </button>
                        )}
                        <button
                          onClick={() => { setSelectedId(null); setDetailSubmission(null); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
                          aria-label="Close submission details"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Modal body */}
                    <div className="flex-1 overflow-y-auto px-5 py-4">
                      {currentDetail.is_flagged && currentDetail.flag_reason && (
                        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-start gap-2">
                          <ShieldAlert size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-amber-700">Flagged by AI</p>
                            <p className="text-xs text-amber-600 mt-0.5">{currentDetail.flag_reason}</p>
                          </div>
                        </div>
                      )}

                      <RecipientsSummary
                        recipients={detailResendRecipients}
                        title={
                          isShowingCurrentRecipients
                            ? "Current resend recipients"
                            : "Original recipients"
                        }
                        emptyMessage="No recipients are configured for this form."
                      />

                      {detailLoading ? (
                        <div className="text-sm text-gray-400 py-4">Loading file details...</div>
                      ) : isSectionsFormat(currentDetail.contents) ? (
                        <SectionsView sections={currentDetail.contents} />
                      ) : (
                        <FlatView contents={currentDetail.contents} />
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setPage((p) => Math.max(1, p - 1)); setSelectedIds(new Set()); }}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 text-gray-500"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); setSelectedIds(new Set()); }}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 text-gray-500"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
              </>
            )}
          </>
        )}
        </section>
      </div>

      <FormSubmissionsSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      >
        {settingsContent}
      </FormSubmissionsSettingsModal>

      {/* Floating bulk action bar */}
      {canUseBulkActions && activeView === "submissions" && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          totalCount={submissions.length}
          actions={bulkActions}
          onClear={clearSelection}
        />
      )}
    </>
  );
}

function SubmissionStatusChip({ submission }: { submission: FormSubmission }) {
  if (submission.is_flagged) {
    return (
      <span
        className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700"
        title={submission.flag_reason || "Flagged by AI; email was held"}
      >
        flagged
      </span>
    );
  }

  if (!submission.is_read) {
    return (
      <span
        className="rounded-full bg-alloro-orange/10 px-2 py-0.5 text-[11px] font-medium text-alloro-orange"
        title="Unread submission"
      >
        new
      </span>
    );
  }

  return (
    <span
      className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500"
      title="Read submission"
    >
      read
    </span>
  );
}

function RecipientsSummary({
  recipients,
  title = "Saved recipients",
  emptyMessage = "No recipients were saved.",
}: {
  recipients: string[];
  title?: string;
  emptyMessage?: string;
}) {
  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-500">{title}</p>
      {recipients.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {recipients.map((email) => (
            <span
              key={email}
              className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200"
            >
              {email}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-red-600">{emptyMessage}</p>
      )}
    </div>
  );
}

/** Render sections-format contents with grouped headers */
function SectionsView({ sections }: { sections: FormSection[] }) {
  return (
    <div className="space-y-5">
      {sections.map((section, si) => (
        <div key={si}>
          <h5 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-1.5 mb-2">
            {section.title}
          </h5>
          <div className="space-y-1.5">
            {section.fields.map(([key, value], fi) => (
              <div key={fi} className="flex gap-3">
                <span className="text-sm text-gray-400 w-44 flex-shrink-0">{key}</span>
                {isFileValue(value) ? (
                  <FileValueDisplay file={value} />
                ) : (
                  <span className="text-sm text-gray-900 font-medium">{value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Render legacy flat key-value contents */
function FlatView({ contents }: { contents: Record<string, string | FileValue> }) {
  return (
    <div className="space-y-2">
      {Object.entries(contents).map(([key, value]) => (
        <div key={key} className="flex gap-3">
          <span className="text-sm text-gray-400 w-40 flex-shrink-0">{key}</span>
          {isFileValue(value) ? (
            <FileValueDisplay file={value} />
          ) : (
            <span className="text-sm text-gray-900 font-medium">{value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function FileValueDisplay({ file }: { file: FileValue }) {
  const isImage = file.type.startsWith("image/");

  if (isImage && file.url) {
    return (
      <div className="flex flex-col gap-2">
        <img
          src={file.url}
          alt={file.name}
          className="max-w-48 max-h-32 rounded-lg border border-gray-200 object-contain"
        />
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-alloro-orange hover:text-orange-700 font-medium transition"
        >
          <Download size={14} />
          {file.name}
        </a>
      </div>
    );
  }

  return (
    <a
      href={file.url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-sm font-medium transition ${
        file.url
          ? "text-alloro-orange hover:text-orange-700"
          : "text-gray-400 cursor-not-allowed"
      }`}
    >
      {file.type === "application/pdf" ? <FileText size={14} /> : <Image size={14} />}
      {file.name}
      {file.url && <Download size={12} />}
    </a>
  );
}
