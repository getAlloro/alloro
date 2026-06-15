import { useState, useEffect } from "react";
import { X, Plus, Mail, Users, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { fetchRecipients, updateRecipients } from "../../api/websites";
import { getErrorMessage } from "../../lib/errorMessage";

interface Props {
  projectId: string;
  fetchRecipientsFn?: (projectId: string) => Promise<any>;
  updateRecipientsFn?: (projectId: string, recipients: string[]) => Promise<any>;
}

export default function RecipientsConfig({ projectId, fetchRecipientsFn, updateRecipientsFn }: Props) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [orgUsers, setOrgUsers] = useState<{ name: string; email: string; role: string }[]>([]);
  const [customEmail, setCustomEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecipients();
  }, [projectId]);

  const loadRecipients = async () => {
    try {
      setLoading(true);
      const fetchFn = fetchRecipientsFn || fetchRecipients;
      const res = await fetchFn(projectId);
      setRecipients(res.data.recipients);
      setOrgUsers(res.data.orgUsers);
    } catch {
      toast.error("Failed to load recipients");
    } finally {
      setLoading(false);
    }
  };

  const save = async (updated: string[]) => {
    try {
      setSaving(true);
      const updateFn = updateRecipientsFn || updateRecipients;
      await updateFn(projectId, updated);
      setRecipients(updated);
      toast.success("Recipients updated");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const addEmail = async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    if (recipients.includes(trimmed)) {
      toast.error("Already added");
      return;
    }
    setSavingEmail(trimmed);
    setCustomEmail("");
    await save([...recipients, trimmed]);
    setSavingEmail(null);
  };

  const removeEmail = async (email: string) => {
    setSavingEmail(email);
    await save(recipients.filter((r) => r !== email));
    setSavingEmail(null);
  };

  const availableOrgUsers = orgUsers.filter(
    (u) => !recipients.includes(u.email.toLowerCase()),
  );

  if (loading) {
    return <div className="text-sm text-gray-400 py-4">Loading recipients...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Mail size={14} />
        <span>
          {recipients.length === 0
            ? "No recipients configured — form submissions will be sent to org admins by default."
            : `${recipients.length} recipient${recipients.length > 1 ? "s" : ""} configured`}
        </span>
      </div>

      {/* Current recipients */}
      {recipients.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {recipients.map((email) => (
            <span
              key={email}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm transition-opacity ${savingEmail === email ? "opacity-50" : ""}`}
            >
              {email}
              {savingEmail === email ? (
                <Loader2 size={14} className="animate-spin text-gray-400" />
              ) : (
                <button
                  onClick={() => removeEmail(email)}
                  disabled={saving}
                  className="text-gray-400 hover:text-red-500 transition"
                >
                  <X size={14} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Add from org users */}
      {availableOrgUsers.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
            <Users size={12} /> Organization members
          </p>
          <div className="flex flex-wrap gap-2">
            {availableOrgUsers.map((user) => (
              <button
                key={user.email}
                onClick={() => addEmail(user.email)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-gray-300 text-gray-500 rounded-full text-sm hover:border-gray-400 hover:text-gray-700 transition disabled:opacity-50"
              >
                {savingEmail === user.email.toLowerCase() ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Plus size={12} />
                )}
                {user.name} ({user.email})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom email input */}
      <div className="flex gap-2">
        <input
          type="email"
          placeholder="Add custom email..."
          value={customEmail}
          onChange={(e) => setCustomEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEmail(customEmail);
            }
          }}
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange"
        />
        <button
          onClick={() => addEmail(customEmail)}
          disabled={!customEmail.trim() || saving}
          className="px-4 py-2 text-sm font-medium text-white bg-alloro-orange rounded-lg hover:bg-alloro-orange/90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1.5"
        >
          {saving && savingEmail && !recipients.includes(savingEmail) ? (
            <Loader2 size={14} className="animate-spin" />
          ) : null}
          Add
        </button>
      </div>
    </div>
  );
}
