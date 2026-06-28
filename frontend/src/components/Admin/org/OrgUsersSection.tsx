import { useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Key,
  X,
  Loader2,
  Check,
  Copy,
  LogIn,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "../../../api";
import { getErrorMessage } from "../../../lib/errorMessage";
import {
  adminSetUserPassword,
  type AdminOrganizationDetail,
  type AdminUser,
} from "../../../api/admin-organizations";

interface OrgUsersSectionProps {
  org: AdminOrganizationDetail;
  orgId: number;
  onRefresh: () => Promise<void>;
}

export function OrgUsersSection({
  org,
  orgId,
  onRefresh,
}: OrgUsersSectionProps) {
  const navigate = useNavigate();
  const [passwordModalUser, setPasswordModalUser] = useState<AdminUser | null>(
    null,
  );
  const [notifyUser, setNotifyUser] = useState(true);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const closePasswordModal = () => {
    setPasswordModalUser(null);
    setGeneratedPassword(null);
    setNotifyUser(true);
    setCopied(false);
  };

  const handleCopyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSetPassword = async () => {
    if (!passwordModalUser) return;
    setIsSettingPassword(true);
    try {
      const response = await adminSetUserPassword(
        passwordModalUser.id,
        notifyUser,
      );
      if (response.success) {
        setGeneratedPassword(response.temporaryPassword);
        toast.success(response.message);
        await onRefresh();
      }
    } catch (error: unknown) {
      const message =
        (isAxiosError(error) ? error.response?.data?.error : undefined) ||
        getErrorMessage(error) ||
        "Failed to set password";
      toast.error(message);
    } finally {
      setIsSettingPassword(false);
    }
  };

  const handlePilotSession = (userId: number) => {
    navigate(`/admin/organizations/${orgId}?section=pilot&userId=${userId}`);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-gray-200 bg-white p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-alloro-navy" />
          <h3 className="font-semibold text-gray-900">Users & Roles</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(org.users || []).map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 hover:border-alloro-orange/30 transition-colors"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-alloro-navy/10 text-sm font-semibold text-alloro-navy">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {user.name}
                  </p>
                  {user.has_password ? (
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-green-50 text-green-600 border border-green-200"
                      title="Password set"
                    >
                      <Key className="h-2.5 w-2.5" /> PW
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-600 border border-amber-200"
                      title="No password"
                    >
                      <Key className="h-2.5 w-2.5" /> No PW
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-gray-500">{user.email}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => {
                    setPasswordModalUser(user);
                    setGeneratedPassword(null);
                    setNotifyUser(true);
                    setCopied(false);
                  }}
                  className="p-2 text-gray-400 hover:text-alloro-orange hover:bg-alloro-orange/10 rounded-lg transition-colors"
                  title="Set password"
                >
                  <Key className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handlePilotSession(user.id)}
                  className="p-2 text-gray-400 hover:text-alloro-orange hover:bg-alloro-orange/10 rounded-lg transition-colors"
                  title="Pilot as this user"
                >
                  <LogIn className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Set Password Modal */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
            onClick={() => !isSettingPassword && closePasswordModal()}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden"
          >
            <button
              onClick={() => !isSettingPassword && closePasswordModal()}
              disabled={isSettingPassword}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>

            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-alloro-orange/10 text-alloro-orange">
                  <Key className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Set Temporary Password
                  </h3>
                  <p className="text-sm text-gray-500">
                    {passwordModalUser.email}
                  </p>
                </div>
              </div>

              {!generatedPassword ? (
                <>
                  <div className="space-y-4 mb-6">
                    <p className="text-sm text-gray-600">
                      This will generate a temporary password for{" "}
                      <strong>{passwordModalUser.name}</strong>.
                      {passwordModalUser.has_password
                        ? " Their existing password will be replaced."
                        : " They currently have no password set (Google-only account)."}
                    </p>

                    <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-alloro-orange/30 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifyUser}
                        onChange={(e) => setNotifyUser(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-alloro-orange focus:ring-alloro-orange"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Notify user via email
                        </p>
                        <p className="text-xs text-gray-500">
                          Send an email with the temporary password and a link
                          to change it
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={closePasswordModal}
                      disabled={isSettingPassword}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSetPassword}
                      disabled={isSettingPassword}
                      className="px-4 py-2 text-sm font-medium text-white bg-alloro-orange hover:bg-alloro-orange/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSettingPassword && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      Set Temporary Password
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-4 mb-6">
                    <p className="text-sm text-gray-600">
                      Temporary password has been set
                      {notifyUser ? " and emailed to the user" : ""}.
                    </p>

                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-2">
                        Temporary Password
                      </p>
                      <div className="flex items-center gap-3">
                        <code className="text-lg font-mono font-bold text-gray-900 tracking-wider flex-1">
                          {generatedPassword}
                        </code>
                        <button
                          onClick={handleCopyPassword}
                          className="p-2 text-gray-400 hover:text-alloro-orange hover:bg-alloro-orange/10 rounded-lg transition-colors"
                          title="Copy to clipboard"
                        >
                          {copied ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {!notifyUser && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        The user was not notified. Make sure to communicate the
                        password through another channel.
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end pt-4 border-t border-gray-200">
                    <button
                      onClick={closePasswordModal}
                      className="px-4 py-2 text-sm font-medium text-white bg-alloro-navy hover:bg-alloro-navy/90 rounded-lg transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
