import { Shield, Plus, X, Loader2, Ban, Trash2 } from "lucide-react";
import { ActionButton } from "../../../ui/DesignSystem";
import { type PlatformCredential } from "../../../../api/minds";

interface CredentialsSectionProps {
  credentials: PlatformCredential[];
  loadingCreds: boolean;
  showAddCred: boolean;
  setShowAddCred: (value: boolean) => void;
  newCredPlatform: string;
  setNewCredPlatform: (value: string) => void;
  newCredLabel: string;
  setNewCredLabel: (value: string) => void;
  newCredKey: string;
  setNewCredKey: (value: string) => void;
  addingCred: boolean;
  handleAddCredential: () => void;
  handleRevokeCredential: (credId: string) => void;
  handleDeleteCredential: (credId: string) => void;
}

export function CredentialsSection({
  credentials,
  loadingCreds,
  showAddCred,
  setShowAddCred,
  newCredPlatform,
  setNewCredPlatform,
  newCredLabel,
  setNewCredLabel,
  newCredKey,
  setNewCredKey,
  addingCred,
  handleAddCredential,
  handleRevokeCredential,
  handleDeleteCredential,
}: CredentialsSectionProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Platform Credentials
          </h3>
        </div>
        <ActionButton
          label="Add Credential"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setShowAddCred(true)}
          variant="secondary"
          size="sm"
        />
      </div>
      <p className="text-xs text-gray-400 mb-4 leading-relaxed">
        Store API keys for publish targets (X, Instagram, etc.). Credentials
        are encrypted and never shown after creation.
      </p>

      {showAddCred && (
        <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-600">New Credential</span>
            <button onClick={() => setShowAddCred(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            <select
              value={newCredPlatform}
              onChange={(e) => setNewCredPlatform(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange bg-white"
            >
              <option value="">Select platform...</option>
              <option value="x">X (Twitter)</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="youtube">YouTube</option>
              <option value="google_business">Google Business Profile</option>
              <option value="other">Other</option>
            </select>
            <input
              type="text"
              value={newCredLabel}
              onChange={(e) => setNewCredLabel(e.target.value)}
              placeholder="Label (optional)"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange"
            />
            <textarea
              value={newCredKey}
              onChange={(e) => setNewCredKey(e.target.value)}
              placeholder="Paste API key or credentials..."
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange resize-none"
            />
            <div className="flex justify-end">
              <ActionButton
                label="Save Credential"
                onClick={handleAddCredential}
                variant="primary"
                size="sm"
                disabled={!newCredPlatform || !newCredKey.trim()}
                loading={addingCred}
              />
            </div>
          </div>
        </div>
      )}

      {loadingCreds ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : credentials.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          No credentials stored yet.
        </p>
      ) : (
        <div className="space-y-2">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">
                    {cred.platform}
                  </span>
                  {cred.label && (
                    <span className="text-xs text-gray-400">
                      {cred.label}
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-full ${
                      cred.status === "active"
                        ? "bg-green-50 text-green-600"
                        : cred.status === "revoked"
                          ? "bg-red-50 text-red-500"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {cred.status}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Added {new Date(cred.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-3">
                {cred.status === "active" && (
                  <button
                    onClick={() => handleRevokeCredential(cred.id)}
                    className="text-gray-400 hover:text-amber-500"
                    title="Revoke"
                  >
                    <Ban className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => handleDeleteCredential(cred.id)}
                  className="text-gray-400 hover:text-red-500"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
