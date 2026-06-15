import React, { useState, useEffect, useRef } from "react";
// Note: useEffect is still used by AnimatedDropdown for click-outside
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  RefreshCw,
  AlertCircle,
  Check,
  X,
  Loader2,
  Eye,
  Archive,
  ArchiveRestore,
  ListTodo,
  Calendar,
  Building2,
  CheckCircle,
  Circle,
  ChevronDown,
} from "lucide-react";
import {
  updateTask,
  updateTaskCategory,
  archiveTask,
  unarchiveTask,
  bulkArchiveTasks,
  bulkUnarchiveTasks,
  bulkApproveTasks,
  bulkUpdateStatus,
} from "../../api/tasks";
import type {
  ActionItem,
  FetchActionItemsRequest,
  AgentType,
} from "../../types/tasks";
import { CreateTaskModal } from "./CreateTaskModal";
import { TaskDetailsModal } from "../tasks/TaskDetailsModal";
import { AgentTypePill } from "../tasks/AgentTypePill";
import { parseHighlightTags } from "../../utils/textFormatting";
import {
  AdminPageHeader,
  ActionButton,
  BulkActionBar,
  FilterBar,
  EmptyState,
} from "../ui/DesignSystem";
import { ConfirmModal } from "@/components/settings/ConfirmModal";
import { AlertModal } from "@/components/ui/AlertModal";
import {
  useAdminActionItems,
  useAdminActionItemOrgs,
  useInvalidateAdminActionItems,
} from "../../hooks/queries/useAdminStandaloneQueries";

// Approval Switch Component
interface ApprovalSwitchProps {
  isApproved: boolean;
  isLoading: boolean;
  disabled: boolean;
  onToggle: () => void;
}

const ApprovalSwitch: React.FC<ApprovalSwitchProps> = ({
  isApproved,
  isLoading,
  disabled,
  onToggle,
}) => {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={disabled || isLoading}
      className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span
        className={`text-xs font-medium w-16 text-right ${
          isApproved ? "text-green-600" : "text-gray-500"
        }`}
      >
        {isLoading ? "Updating..." : isApproved ? "Approved" : "Pending"}
      </span>
      <motion.div
        className={`relative w-10 h-5 rounded-full transition-colors ${
          isApproved ? "bg-green-500" : "bg-gray-300"
        }`}
        whileTap={{ scale: 0.95 }}
      >
        <motion.div
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm flex items-center justify-center"
          initial={false}
          animate={{ x: isApproved ? 22 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        >
          {isLoading && (
            <Loader2 className="w-2.5 h-2.5 text-gray-400 animate-spin" />
          )}
        </motion.div>
      </motion.div>
    </button>
  );
};

// Animated Dropdown Component
interface DropdownOption {
  value: string;
  label: string;
  color?: string;
}

interface AnimatedDropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  variant?: "category" | "status";
}

const AnimatedDropdown: React.FC<AnimatedDropdownProps> = ({
  value,
  options,
  onChange,
  disabled = false,
  isLoading = false,
  variant = "status",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOption = options.find((opt) => opt.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const getOptionStyles = (option: DropdownOption, isSelected: boolean) => {
    const baseStyles =
      "w-full px-3 py-2 text-left text-xs font-semibold transition-colors";
    if (isSelected) {
      return `${baseStyles} ${option.color || "bg-gray-100 text-gray-900"}`;
    }
    return `${baseStyles} hover:bg-gray-50 text-gray-700`;
  };

  const getTriggerStyles = () => {
    if (variant === "category") {
      return value === "ALLORO"
        ? "border-purple-200 bg-purple-50 text-purple-700"
        : "border-blue-200 bg-blue-50 text-blue-700";
    }
    // Status variant
    switch (value) {
      case "pending":
        return "border-yellow-200 bg-yellow-50 text-yellow-700";
      case "in_progress":
        return "border-blue-200 bg-blue-50 text-blue-700";
      case "complete":
        return "border-green-200 bg-green-50 text-green-700";
      case "archived":
        return "border-gray-200 bg-gray-100 text-gray-500";
      default:
        return "border-gray-200 bg-gray-100 text-gray-700";
    }
  };

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
        <Loader2 className="h-3 w-3 animate-spin" />
        Updating...
      </span>
    );
  }

  return (
    <div
      ref={dropdownRef}
      className="relative"
      onClick={(e) => e.stopPropagation()}
    >
      <motion.button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${getTriggerStyles()}`}
        whileHover={{ scale: disabled ? 1 : 1.02 }}
        whileTap={{ scale: disabled ? 1 : 0.98 }}
      >
        {currentOption?.label || value}
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="h-3 w-3" />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-1 z-50 min-w-[120px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
          >
            {options.map((option) => (
              <motion.button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={getOptionStyles(option, option.value === value)}
                whileHover={{ backgroundColor: "rgba(0,0,0,0.03)" }}
              >
                <div className="flex items-center gap-2">
                  {option.value === value && (
                    <Check className="h-3 w-3 text-alloro-orange" />
                  )}
                  <span className={option.value === value ? "ml-0" : "ml-5"}>
                    {option.label}
                  </span>
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Category and Status options
const CATEGORY_OPTIONS: DropdownOption[] = [
  { value: "ALLORO", label: "ALLORO" },
  { value: "USER", label: "USER" },
];

const STATUS_OPTIONS: DropdownOption[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
  { value: "archived", label: "Archived" },
];

// Filter Dropdown Component (larger, for filter bar)
interface FilterDropdownOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  value: string;
  options: FilterDropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  icon?: React.ReactNode;
  label?: string;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select...",
  icon,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOption = options.find((opt) => opt.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1">
          {icon}
          {label}
        </span>
      )}
      <div ref={dropdownRef} className="relative">
        <motion.button
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px] justify-between"
          whileHover={{ scale: disabled ? 1 : 1.01 }}
          whileTap={{ scale: disabled ? 1 : 0.99 }}
        >
          <span className="truncate">{currentOption?.label || placeholder}</span>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </motion.div>
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 mt-1 z-50 min-w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto"
            >
              {options.map((option) => (
                <motion.button
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm font-medium transition-colors ${
                    option.value === value
                      ? "bg-alloro-orange/10 text-alloro-orange"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                  whileHover={{ backgroundColor: option.value === value ? undefined : "rgba(0,0,0,0.03)" }}
                >
                  <div className="flex items-center gap-2">
                    {option.value === value && (
                      <Check className="h-3.5 w-3.5 text-alloro-orange" />
                    )}
                    <span className={option.value === value ? "ml-0" : "ml-5"}>
                      {option.label}
                    </span>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export function ActionItemsHub() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ActionItem | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Modal state for confirm/alert replacements
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: "danger" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: "error" | "success" | "info";
  }>({ isOpen: false, title: "", message: "" });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Multi-select state
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(
    new Set()
  );
  const [bulkOperationLoading, setBulkOperationLoading] = useState(false);

  // Loading states for individual operations
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
  const [updatingApprovalId, setUpdatingApprovalId] = useState<number | null>(
    null
  );
  const [updatingCategoryId, setUpdatingCategoryId] = useState<number | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Filter states
  const [filters, setFilters] = useState<FetchActionItemsRequest>({
    limit: pageSize,
    offset: 0,
  });
  const [selectedOrganization, setSelectedOrganization] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedAgentType, setSelectedAgentType] = useState<string>("all");
  const [selectedApproval, setSelectedApproval] = useState<string>("all");

  // TanStack Query — replaces useEffect + useState + 3s polling
  const {
    data: taskData,
    isLoading: loading,
    error: queryError,
  } = useAdminActionItems(filters);
  const { data: organizations = [] } = useAdminActionItemOrgs();
  const { invalidateAll: invalidateActionItems } = useInvalidateAdminActionItems();

  const tasks = taskData?.tasks ?? [];
  const total = taskData?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const error = queryError?.message ?? null;

  const loadTasks = () => invalidateActionItems();

  const applyFilters = () => {
    const newFilters: FetchActionItemsRequest = {
      limit: pageSize,
      offset: 0,
    };

    if (selectedOrganization !== "all") {
      newFilters.organization_id = parseInt(selectedOrganization, 10);
    }
    if (selectedStatus !== "all") {
      newFilters.status = selectedStatus as
        | "pending"
        | "in_progress"
        | "complete"
        | "archived";
    }
    if (selectedCategory !== "all") {
      newFilters.category = selectedCategory as "ALLORO" | "USER";
    }
    if (selectedAgentType !== "all") {
      newFilters.agent_type = selectedAgentType as AgentType;
    }
    if (selectedApproval !== "all") {
      newFilters.is_approved = selectedApproval === "true";
    }

    setCurrentPage(1);
    setFilters(newFilters);
  };

  const resetFilters = () => {
    setSelectedOrganization("all");
    setSelectedStatus("all");
    setSelectedCategory("all");
    setSelectedAgentType("all");
    setSelectedApproval("all");
    setCurrentPage(1);
    setFilters({ limit: pageSize, offset: 0 });
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    setFilters((prev) => ({
      ...prev,
      offset: (newPage - 1) * pageSize,
    }));
    setSelectedTaskIds(new Set()); // Clear selection on page change
  };

  const handleViewDetails = (task: ActionItem) => {
    setSelectedTask(task);
    setShowDetailsModal(true);
  };

  const handleApprove = async (taskId: number, currentApproval: boolean) => {
    if (updatingApprovalId) return;

    try {
      setUpdatingApprovalId(taskId);
      await updateTask(taskId, { is_approved: !currentApproval });
      await loadTasks();
    } catch (err) {
      setAlertModal({ isOpen: true, title: "Approval Error", message: err instanceof Error ? err.message : "Failed to update task", type: "error" });
    } finally {
      setUpdatingApprovalId(null);
    }
  };

  const handleStatusChange = async (taskId: number, newStatus: string) => {
    if (updatingStatusId) return;

    try {
      setUpdatingStatusId(taskId);
      await updateTask(taskId, {
        status: newStatus as
          | "pending"
          | "in_progress"
          | "complete"
          | "archived",
      });
      await loadTasks();
    } catch (err) {
      setAlertModal({ isOpen: true, title: "Status Error", message: err instanceof Error ? err.message : "Failed to update status", type: "error" });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleCategoryChange = async (taskId: number, newCategory: string) => {
    if (updatingCategoryId) return;

    try {
      setUpdatingCategoryId(taskId);
      await updateTaskCategory(taskId, newCategory as "ALLORO" | "USER");
      await loadTasks();
    } catch (err) {
      setAlertModal({ isOpen: true, title: "Category Error", message: err instanceof Error ? err.message : "Failed to update category", type: "error" });
    } finally {
      setUpdatingCategoryId(null);
    }
  };

  const handleArchive = (taskId: number) => {
    if (deletingId) return;

    setConfirmModal({
      isOpen: true,
      title: "Archive Task",
      message: "Are you sure you want to archive this task?",
      type: "danger",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          setDeletingId(taskId);
          await archiveTask(taskId);
          await loadTasks();
        } catch (err) {
          setAlertModal({ isOpen: true, title: "Archive Error", message: err instanceof Error ? err.message : "Failed to archive task", type: "error" });
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const handleUnarchive = (taskId: number) => {
    if (deletingId) return;

    setConfirmModal({
      isOpen: true,
      title: "Restore Task",
      message: "Are you sure you want to restore this task?",
      type: "warning",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          setDeletingId(taskId);
          await unarchiveTask(taskId);
          await loadTasks();
        } catch (err) {
          setAlertModal({ isOpen: true, title: "Restore Error", message: err instanceof Error ? err.message : "Failed to restore task", type: "error" });
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  // Multi-select handlers
  const toggleSelectAll = () => {
    if (selectedTaskIds.size === tasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(tasks.map((t) => t.id)));
    }
  };

  const toggleSelectTask = (taskId: number) => {
    const newSelected = new Set(selectedTaskIds);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTaskIds(newSelected);
  };

  // Bulk operations
  const handleBulkArchive = () => {
    if (selectedTaskIds.size === 0) return;

    setConfirmModal({
      isOpen: true,
      title: "Bulk Archive",
      message: `Are you sure you want to archive ${selectedTaskIds.size} task(s)?`,
      type: "danger",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          setBulkOperationLoading(true);
          await bulkArchiveTasks(Array.from(selectedTaskIds));
          setSelectedTaskIds(new Set());
          await loadTasks();
        } catch (err) {
          setAlertModal({ isOpen: true, title: "Bulk Archive Error", message: err instanceof Error ? err.message : "Failed to archive tasks", type: "error" });
        } finally {
          setBulkOperationLoading(false);
        }
      },
    });
  };

  const handleBulkUnarchive = () => {
    if (selectedTaskIds.size === 0) return;

    setConfirmModal({
      isOpen: true,
      title: "Bulk Restore",
      message: `Are you sure you want to restore ${selectedTaskIds.size} task(s)?`,
      type: "warning",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          setBulkOperationLoading(true);
          await bulkUnarchiveTasks(Array.from(selectedTaskIds));
          setSelectedTaskIds(new Set());
          await loadTasks();
        } catch (err) {
          setAlertModal({ isOpen: true, title: "Bulk Restore Error", message: err instanceof Error ? err.message : "Failed to restore tasks", type: "error" });
        } finally {
          setBulkOperationLoading(false);
        }
      },
    });
  };

  const handleBulkApprove = async (approve: boolean) => {
    if (selectedTaskIds.size === 0) return;

    try {
      setBulkOperationLoading(true);
      await bulkApproveTasks(Array.from(selectedTaskIds), approve);
      setSelectedTaskIds(new Set());
      await loadTasks();
    } catch (err) {
      setAlertModal({ isOpen: true, title: "Bulk Approval Error", message: err instanceof Error ? err.message : "Failed to update task approval", type: "error" });
    } finally {
      setBulkOperationLoading(false);
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    if (selectedTaskIds.size === 0) return;

    try {
      setBulkOperationLoading(true);
      await bulkUpdateStatus(
        Array.from(selectedTaskIds),
        status as "pending" | "in_progress" | "complete" | "archived"
      );
      setSelectedTaskIds(new Set());
      await loadTasks();
    } catch (err) {
      setAlertModal({ isOpen: true, title: "Bulk Status Error", message: err instanceof Error ? err.message : "Failed to update task status", type: "error" });
    } finally {
      setBulkOperationLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Check if all selected items are archived (for showing correct bulk action button)
  const allSelectedAreArchived =
    selectedTaskIds.size > 0 &&
    Array.from(selectedTaskIds).every((id) => {
      const task = tasks.find((t) => t.id === id);
      return task?.status === "archived";
    });

  // Check if any selected items are not archived
  const anySelectedNotArchived =
    selectedTaskIds.size > 0 &&
    Array.from(selectedTaskIds).some((id) => {
      const task = tasks.find((t) => t.id === id);
      return task?.status !== "archived";
    });

  // Build bulk actions for BulkActionBar
  const bulkActions = [];

  bulkActions.push({
    label: "Approve",
    icon: <Check className="w-4 h-4" />,
    onClick: () => handleBulkApprove(true),
    variant: "primary" as const,
    disabled: bulkOperationLoading,
  });

  bulkActions.push({
    label: "Unapprove",
    icon: <X className="w-4 h-4" />,
    onClick: () => handleBulkApprove(false),
    variant: "secondary" as const,
    disabled: bulkOperationLoading,
  });

  if (anySelectedNotArchived) {
    bulkActions.push({
      label: bulkOperationLoading ? "Archiving..." : "Archive",
      icon: bulkOperationLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Archive className="w-4 h-4" />
      ),
      onClick: handleBulkArchive,
      variant: "danger" as const,
      disabled: bulkOperationLoading,
    });
  }

  if (allSelectedAreArchived) {
    bulkActions.push({
      label: bulkOperationLoading ? "Restoring..." : "Restore",
      icon: bulkOperationLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <ArchiveRestore className="w-4 h-4" />
      ),
      onClick: handleBulkUnarchive,
      variant: "primary" as const,
      disabled: bulkOperationLoading,
    });
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        icon={<ListTodo className="w-6 h-6" />}
        title="Action Items Hub"
        description="Manage and track all tasks across clients"
        actionButtons={
          <div className="flex items-center gap-3">
            <ActionButton
              label={loading ? "Loading" : "Refresh"}
              icon={
                loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )
              }
              onClick={() => loadTasks()}
              variant="secondary"
              disabled={loading}
            />
            <ActionButton
              label="Create Task"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowCreateModal(true)}
              variant="primary"
            />
          </div>
        }
      />

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedTaskIds.size > 0 && (
          <BulkActionBar
            selectedCount={selectedTaskIds.size}
            onClear={() => setSelectedTaskIds(new Set())}
            actions={bulkActions}
            extraContent={
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkStatusChange(e.target.value);
                    e.target.value = "";
                  }
                }}
                disabled={bulkOperationLoading}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Change Status...</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="complete">Complete</option>
              </select>
            }
          />
        )}
      </AnimatePresence>

      {/* Filters Bar */}
      <FilterBar>
        <div className="flex flex-wrap items-end gap-3">
          <FilterDropdown
            value={selectedOrganization}
            onChange={(value) => setSelectedOrganization(value)}
            label="Organization"
            placeholder="All Organizations"
            options={[
              { value: "all", label: "All Organizations" },
              ...organizations.map((org) => ({
                value: String(org.id),
                label: org.name,
              })),
            ]}
          />
          <FilterDropdown
            value={selectedStatus}
            onChange={(value) => setSelectedStatus(value)}
            label="Status"
            placeholder="All Statuses"
            options={[
              { value: "all", label: "All Statuses" },
              { value: "pending", label: "Pending" },
              { value: "in_progress", label: "In Progress" },
              { value: "complete", label: "Complete" },
              { value: "archived", label: "Archived" },
            ]}
          />
          <FilterDropdown
            value={selectedCategory}
            onChange={(value) => setSelectedCategory(value)}
            label="Category"
            placeholder="All Categories"
            options={[
              { value: "all", label: "All Categories" },
              { value: "ALLORO", label: "ALLORO" },
              { value: "USER", label: "USER" },
            ]}
          />
          <FilterDropdown
            value={selectedAgentType}
            onChange={(value) => setSelectedAgentType(value)}
            label="Agent Type"
            placeholder="All Types"
            options={[
              { value: "all", label: "All Types" },
              { value: "GBP_OPTIMIZATION", label: "GBP Copy" },
              { value: "OPPORTUNITY", label: "Opportunity" },
              { value: "CRO_OPTIMIZER", label: "CRO" },
              { value: "REFERRAL_ENGINE_ANALYSIS", label: "Referral Engine" },
              { value: "MANUAL", label: "Manual" },
            ]}
          />
          <FilterDropdown
            value={selectedApproval}
            onChange={(value) => setSelectedApproval(value)}
            label="Approval"
            placeholder="All"
            options={[
              { value: "all", label: "All" },
              { value: "true", label: "Approved" },
              { value: "false", label: "Pending" },
            ]}
          />
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
            onClick={toggleSelectAll}
            disabled={tasks.length === 0}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {selectedTaskIds.size === tasks.length && tasks.length > 0 ? (
              <CheckCircle className="h-4 w-4 text-blue-600" />
            ) : (
              <Circle className="h-4 w-4 text-gray-400" />
            )}
            {selectedTaskIds.size === tasks.length && tasks.length > 0
              ? "Deselect All"
              : "Select All"}
          </button>
        </div>
      </FilterBar>

      {/* Task Cards */}
      {loading && tasks.length === 0 ? (
        <motion.div
          className="flex items-center justify-center h-64"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading tasks...
          </div>
        </motion.div>
      ) : error ? (
        <motion.div
          className="flex flex-col items-center justify-center gap-4 rounded-xl border border-red-200 bg-red-50 p-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-red-600 font-medium">{error}</p>
          <ActionButton
            label="Retry"
            onClick={() => loadTasks()}
            variant="primary"
          />
        </motion.div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<ListTodo className="w-12 h-12" />}
          title="No tasks found"
          description="No tasks match the selected filters. Try adjusting your filters or create a new task."
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((task, index) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
              onClick={() => toggleSelectTask(task.id)}
              className={`rounded-xl border bg-white shadow-sm transition-all hover:shadow-md cursor-pointer ${
                selectedTaskIds.has(task.id)
                  ? "border-blue-300 ring-2 ring-blue-100"
                  : "border-gray-200"
              } ${task.status === "archived" ? "opacity-60" : ""}`}
            >
              <div className="p-4">
                <div className="flex items-start gap-4">
                  {/* Selection checkbox */}
                  <motion.div
                    className="mt-1 flex-shrink-0"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {selectedTaskIds.has(task.id) ? (
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-300" />
                    )}
                  </motion.div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    {/* Top row: Title and badges */}
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 line-clamp-1">
                          {parseHighlightTags(task.title, "underline")}
                        </h3>
                        {task.description && (
                          <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                            {parseHighlightTags(task.description, "underline")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Approval Switch */}
                        <ApprovalSwitch
                          isApproved={task.is_approved}
                          isLoading={updatingApprovalId === task.id}
                          disabled={updatingApprovalId !== null}
                          onToggle={() => handleApprove(task.id, task.is_approved)}
                        />
                      </div>
                    </div>

                    {/* Metadata row */}
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {/* Organization + Location */}
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Building2 className="h-3.5 w-3.5 text-gray-400" />
                        <span className="font-medium">
                          {task.organization_id
                            ? organizations.find((o) => o.id === task.organization_id)?.name || `Org #${task.organization_id}`
                            : "Unassigned"}
                          {task.location_name ? ` · ${task.location_name}` : ""}
                        </span>
                      </div>

                      {/* Date */}
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        <span>{formatDate(task.created_at)}</span>
                      </div>

                      {/* Agent Type */}
                      <AgentTypePill agentType={task.agent_type ?? null} />

                      {/* Category */}
                      <AnimatedDropdown
                        value={task.category}
                        options={CATEGORY_OPTIONS}
                        onChange={(value) =>
                          handleCategoryChange(task.id, value)
                        }
                        disabled={updatingCategoryId !== null}
                        isLoading={updatingCategoryId === task.id}
                        variant="category"
                      />

                      {/* Status */}
                      <AnimatedDropdown
                        value={task.status}
                        options={STATUS_OPTIONS}
                        onChange={(value) =>
                          handleStatusChange(task.id, value)
                        }
                        disabled={updatingStatusId !== null}
                        isLoading={updatingStatusId === task.id}
                        variant="status"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <motion.button
                      onClick={() => handleViewDetails(task)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </motion.button>
                    {task.status === "archived" ? (
                      deletingId === task.id ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Restoring...
                        </span>
                      ) : (
                        <motion.button
                          onClick={() => handleUnarchive(task.id)}
                          disabled={deletingId !== null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-600 transition hover:border-green-300 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          Restore
                        </motion.button>
                      )
                    ) : deletingId === task.id ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Archiving...
                      </span>
                    ) : (
                      <motion.button
                        onClick={() => handleArchive(task.id)}
                        disabled={deletingId !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-600 transition hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Archive
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
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
            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
            variant="secondary"
            disabled={currentPage === 1 || loading}
          />
          <span className="text-sm text-gray-600">
            Page {currentPage} of {totalPages} ({total} total)
          </span>
          <ActionButton
            label="Next"
            onClick={() =>
              handlePageChange(Math.min(totalPages, currentPage + 1))
            }
            variant="secondary"
            disabled={currentPage === totalPages || loading}
          />
        </motion.div>
      )}

      {/* Summary Stats */}
      {!loading && !error && tasks.length > 0 && (
        <motion.div
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-sm text-gray-600">
            Showing {tasks.length} of {total} task{total !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-yellow-400" />
              <span className="text-gray-600">
                <strong className="text-gray-900">
                  {tasks.filter((t) => !t.is_approved).length}
                </strong>{" "}
                pending approval
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-400" />
              <span className="text-gray-600">
                <strong className="text-gray-900">
                  {
                    tasks.filter(
                      (t) => t.status !== "complete" && t.status !== "archived"
                    ).length
                  }
                </strong>{" "}
                active
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          loadTasks();
        }}
        organizations={organizations}
      />

      {/* Task Details Modal */}
      <TaskDetailsModal
        task={selectedTask}
        isOpen={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedTask(null);
        }}
      />

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
      />

      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
}
