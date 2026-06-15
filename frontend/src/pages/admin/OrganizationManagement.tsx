import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Users,
  ChevronRight,
  Building,
  Edit2,
  RefreshCw,
  Plus,
  X,
  Archive,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  AdminPageHeader,
  Badge,
  EmptyState,
  TabBar,
} from "../../components/ui/DesignSystem";
import {
  cardVariants,
  staggerContainer,
} from "../../lib/animations";
import {
  adminUpdateOrganizationName,
  type AdminOrganizationListView,
  type AdminOrganization,
} from "../../api/admin-organizations";
import {
  useAdminOrganizations,
  useInvalidateOrganizations,
} from "../../hooks/queries/useAdminQueries";
import { CreateOrganizationModal } from "../../components/Admin/org/CreateOrganizationModal";

export function OrganizationManagement() {
  const [organizationListView, setOrganizationListView] =
    useState<AdminOrganizationListView>("active");
  const { data: organizations = [], isLoading: loading } =
    useAdminOrganizations(organizationListView);
  const { invalidateAll: refetchOrganizations } = useInvalidateOrganizations();

  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  // Create Organization modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const emptyTitle =
    organizationListView === "archived"
      ? "No archived organizations"
      : "No active organizations";
  const emptyDescription =
    organizationListView === "archived"
      ? "Archived organizations will appear here after an admin archives them from Organization Settings."
      : "No active organizations have been created yet.";

  const organizationListTabs = [
    {
      id: "active",
      label: "Active",
      description: "Default view",
      icon: <Building className="h-4 w-4" />,
    },
    {
      id: "archived",
      label: "Archived",
      description: "Hidden accounts",
      icon: <Archive className="h-4 w-4" />,
    },
  ];

  const startEditing = (e: React.MouseEvent, org: AdminOrganization) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingOrgId(org.id);
    setEditName(org.name);
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingOrgId(null);
    setEditName("");
  };

  const handleUpdateName = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editingOrgId || !editName.trim()) return;

    try {
      const response = await adminUpdateOrganizationName(editingOrgId, editName);
      if (response.success) {
        toast.success("Organization updated");
        setEditingOrgId(null);
        await refetchOrganizations();
      } else {
        toast.error("Failed to update organization");
      }
    } catch {
      toast.error("Failed to update organization");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <motion.div
          className="flex items-center gap-3 text-gray-500"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <RefreshCw className="h-5 w-5 animate-spin" />
          Loading organizations...
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<Building className="w-6 h-6" />}
        title="Organizations"
        description="Manage accounts and their integrations"
        actionButtons={
          <div className="flex items-center gap-3">
            <Badge label={`${organizations.length} total`} color="blue" />
            {organizationListView === "active" && (
              <motion.button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 rounded-xl bg-alloro-orange px-4 py-2 text-sm font-bold text-white hover:bg-alloro-navy transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Plus className="h-4 w-4" />
                Create Organization
              </motion.button>
            )}
          </div>
        }
      />

      <div className="flex">
        <TabBar
          tabs={organizationListTabs}
          activeTab={organizationListView}
          onTabChange={(tabId) =>
            setOrganizationListView(tabId as AdminOrganizationListView)
          }
        />
      </div>

      {organizations.length === 0 ? (
        <EmptyState
          icon={<Building className="w-8 h-8" />}
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        <motion.div
          className="space-y-3"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {organizations.map((org, index) => (
            <Link
              key={org.id}
              to={`/admin/organizations/${org.id}`}
              className="block no-underline"
            >
              <motion.div
                custom={index}
                variants={cardVariants}
                className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden transition-all hover:shadow-lg hover:border-alloro-orange/30"
              >
                <div className="flex items-center gap-4 p-5">
                  <motion.div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-alloro-navy/5 text-alloro-navy"
                    whileHover={{ scale: 1.05, rotate: 5 }}
                  >
                    <Building className="h-6 w-6" />
                  </motion.div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {editingOrgId === org.id ? (
                        <motion.div
                          className="flex items-center gap-2"
                          onClick={(e) => e.preventDefault()}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                        >
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                            autoFocus
                          />
                          <motion.button
                            onClick={handleUpdateName}
                            className="rounded-lg bg-alloro-orange p-1.5 text-white hover:bg-alloro-navy transition-colors"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            ✓
                          </motion.button>
                          <motion.button
                            onClick={cancelEditing}
                            className="rounded-lg bg-gray-100 p-1.5 text-gray-600 hover:bg-gray-200 transition-colors"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <X className="h-4 w-4" />
                          </motion.button>
                        </motion.div>
                      ) : (
                        <div className="group/name flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 text-lg">
                            {org.name}
                          </h3>
                          <Badge variant="orange">DFY</Badge>
                          {org.archived_at && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-700">
                              <Archive className="h-3 w-3" />
                              Archived
                            </span>
                          )}
                          {/* Billing status badge */}
                          {!org.archived_at && org.subscription_status === "inactive" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-50 text-red-700 border border-red-200">
                              🔒 Locked
                            </span>
                          ) : !org.archived_at && org.stripe_customer_id ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-50 text-green-700 border border-green-200">
                              ✓ Active
                            </span>
                          ) : !org.archived_at && org.subscription_status === "active" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              ⚠ No Billing
                            </span>
                          ) : null}
                          <motion.button
                            onClick={(e) => startEditing(e, org)}
                            className="opacity-0 transition-opacity group-hover/name:opacity-100 p-1.5 text-gray-400 hover:text-alloro-orange rounded-lg hover:bg-alloro-orange/10"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </motion.button>
                        </div>
                      )}
                      {org.domain && (
                        <Badge label={org.domain} color="gray" />
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4" />
                        {org.userCount} users
                      </span>
                      <span className="text-gray-300">|</span>
                      <span
                        className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg ${
                          org.connections.gbp
                            ? "text-green-700 bg-green-50"
                            : "text-gray-400 bg-gray-50"
                        }`}
                      >
                        {org.connections.gbp ? "✓" : "○"} GBP
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>
              </motion.div>
            </Link>
          ))}
        </motion.div>
      )}

      <CreateOrganizationModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={refetchOrganizations}
      />
    </div>
  );
}
