import { useState } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw,
  Bell,
  Plus,
  X,
  Loader2,
  Mail,
  MailOpen,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { createAdminNotification } from "../../api/notifications";
import {
  useAdminOrgNotifications,
  useInvalidateAdminOrgNotifications,
} from "../../hooks/queries/useAdminOrgTabQueries";

interface OrgNotificationsTabProps {
  organizationId: number;
  locationId: number | null;
}

const TYPE_COLORS: Record<string, string> = {
  task: "bg-blue-100 text-blue-700",
  pms: "bg-green-100 text-green-700",
  agent: "bg-purple-100 text-purple-700",
  ranking: "bg-amber-100 text-amber-700",
  system: "bg-gray-100 text-gray-700",
};

export function OrgNotificationsTab({
  organizationId,
  locationId,
}: OrgNotificationsTabProps) {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newType, setNewType] = useState<string>("system");

  // TanStack Query — replaces useEffect + useState
  const { data, isLoading: loading } = useAdminOrgNotifications({
    organizationId,
    locationId,
    page,
    pageSize,
  });
  const { invalidateForOrg } = useInvalidateAdminOrgNotifications();

  const notifications = data?.notifications ?? [];
  const total = data?.total ?? 0;

  const loadNotifications = () => invalidateForOrg(organizationId);

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      toast.error("Title is required");
      return;
    }

    setCreating(true);
    try {
      const response = await createAdminNotification({
        organization_id: organizationId,
        location_id: locationId ?? undefined,
        title: newTitle.trim(),
        message: newMessage.trim() || undefined,
        type: newType,
      });
      if (response.success) {
        toast.success("Notification created");
        setNewTitle("");
        setNewMessage("");
        setNewType("system");
        setShowCreate(false);
        loadNotifications();
      }
    } catch {
      toast.error("Failed to create notification");
    } finally {
      setCreating(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-alloro-orange" />
          <h3 className="font-semibold text-gray-900">Notifications</h3>
          <span className="text-sm text-gray-500">({total})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-alloro-orange rounded-lg hover:bg-alloro-orange/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create
          </button>
          <button
            onClick={loadNotifications}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="rounded-xl border border-alloro-orange/20 bg-alloro-orange/5 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">
              New Notification
            </h4>
            <button
              onClick={() => setShowCreate(false)}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Notification title"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloro-orange/50"
          />

          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Message (optional)"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloro-orange/50 resize-none"
          />

          <div className="flex items-center gap-3">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloro-orange/50"
            >
              <option value="system">System</option>
              <option value="task">Task</option>
              <option value="pms">PMS</option>
              <option value="agent">Agent</option>
              <option value="ranking">Ranking</option>
            </select>

            <button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-alloro-orange rounded-lg hover:bg-alloro-orange/90 transition-colors disabled:opacity-50"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Send
            </button>
          </div>
        </motion.div>
      )}

      {/* Loading */}
      {loading && notifications.length === 0 && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading notifications...
        </div>
      )}

      {/* Empty State */}
      {!loading && notifications.length === 0 && (
        <div className="text-center py-12">
          <Bell className="h-8 w-8 mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500 text-sm">No notifications found</p>
        </div>
      )}

      {/* Notification List */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                notif.read
                  ? "border-gray-100 bg-white"
                  : "border-alloro-orange/20 bg-alloro-orange/5"
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {notif.read ? (
                  <MailOpen className="h-4 w-4 text-gray-400" />
                ) : (
                  <Mail className="h-4 w-4 text-alloro-orange" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {notif.title}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded ${
                      TYPE_COLORS[notif.type] || TYPE_COLORS.system
                    }`}
                  >
                    {notif.type}
                  </span>
                </div>

                {notif.message && (
                  <p className="text-xs text-gray-500 line-clamp-2">
                    {notif.message}
                  </p>
                )}

                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-gray-400">
                    {new Date(notif.created_at).toLocaleString()}
                  </span>
                  {notif.location_name && (
                    <span className="text-[10px] text-gray-400">
                      {notif.location_name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
