import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Globe2,
  Loader2,
  Mail,
  Plus,
  Users,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  adminUpdateRecipientSettings,
  type AdminRecipientSettingsData,
  type RecipientChannel,
  type RecipientChannelState,
  type RecipientSource,
} from "../../api/admin-organizations";
import { useAdminOrganizationRecipientSettings } from "../../hooks/queries/useAdminQueries";
import { QUERY_KEYS } from "../../lib/queryClient";

interface OrgRecipientSettingsSectionProps {
  orgId: number;
}

const CHANNELS: Array<{
  channel: RecipientChannel;
  title: string;
  description: string;
  icon: typeof Globe2;
}> = [
  {
    channel: "website_form",
    title: "Website Form Recipients",
    description: "Receives contact forms and confirmed newsletter signups.",
    icon: Globe2,
  },
  {
    channel: "agent_notifications",
    title: "Agent Notification Recipients",
    description: "Receives monthly agent and referral insight emails.",
    icon: Bell,
  },
];

const SOURCE_LABELS: Record<RecipientSource, string> = {
  configured: "Configured",
  legacy_project: "Website project",
  org_admins: "Org admins",
  google_connection: "Google account",
  env_fallback: "Environment fallback",
  none: "No fallback",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return fallback;
}

export function OrgRecipientSettingsSection({
  orgId,
}: OrgRecipientSettingsSectionProps) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdminOrganizationRecipientSettings(orgId);
  const [savingChannel, setSavingChannel] = useState<RecipientChannel | null>(
    null
  );
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [customEmails, setCustomEmails] = useState<
    Record<RecipientChannel, string>
  >({
    website_form: "",
    agent_notifications: "",
  });

  const save = async (
    channel: RecipientChannel,
    recipients: string[],
    activeEmail?: string
  ) => {
    try {
      setSavingChannel(channel);
      setSavingEmail(activeEmail ?? null);

      const response = await adminUpdateRecipientSettings(
        orgId,
        channel,
        recipients
      );
      if (!response.success) {
        throw new Error("Failed to update recipients");
      }

      queryClient.setQueryData(
        QUERY_KEYS.organizationRecipientSettings(orgId),
        response.data
      );
      toast.success("Recipients updated");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update recipients"));
    } finally {
      setSavingChannel(null);
      setSavingEmail(null);
    }
  };

  const setCustomEmail = (channel: RecipientChannel, value: string) => {
    setCustomEmails((current) => ({ ...current, [channel]: value }));
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading recipient settings...
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="mb-5 flex items-center gap-2">
        <Mail className="h-5 w-5 text-gray-700" />
        <h3 className="font-semibold text-gray-900">Recipient Settings</h3>
      </div>

      <div className="divide-y divide-gray-100">
        {CHANNELS.map((config) => (
          <RecipientChannelEditor
            key={config.channel}
            config={config}
            data={data}
            customEmail={customEmails[config.channel]}
            saving={savingChannel === config.channel}
            savingEmail={savingEmail}
            onCustomEmailChange={(value) =>
              setCustomEmail(config.channel, value)
            }
            onSave={(recipients, activeEmail) =>
              save(config.channel, recipients, activeEmail)
            }
          />
        ))}
      </div>
    </div>
  );
}

function RecipientChannelEditor({
  config,
  data,
  customEmail,
  saving,
  savingEmail,
  onCustomEmailChange,
  onSave,
}: {
  config: (typeof CHANNELS)[number];
  data: AdminRecipientSettingsData;
  customEmail: string;
  saving: boolean;
  savingEmail: string | null;
  onCustomEmailChange: (value: string) => void;
  onSave: (recipients: string[], activeEmail?: string) => void;
}) {
  const state = data.channels[config.channel];
  const recipients = state?.recipients ?? [];
  const availableOrgUsers = data.orgUsers.filter(
    (user) => !recipients.includes(normalizeEmail(user.email))
  );
  const Icon = config.icon;

  const addEmail = (email: string) => {
    const normalized = normalizeEmail(email);
    if (!normalized) return;

    if (!EMAIL_REGEX.test(normalized)) {
      toast.error("Enter a valid email");
      return;
    }

    if (recipients.includes(normalized)) {
      toast.error("Already added");
      return;
    }

    onCustomEmailChange("");
    onSave([...recipients, normalized], normalized);
  };

  const removeEmail = (email: string) => {
    onSave(
      recipients.filter((recipient) => recipient !== email),
      email
    );
  };

  return (
    <div className="py-5 first:pt-0 last:pb-0">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-gray-900">
              {config.title}
            </h4>
            <p className="mt-0.5 text-xs text-gray-500">
              {config.description}
            </p>
          </div>
        </div>
        <SourceBadge state={state} />
      </div>

      <div className="space-y-4">
        <RecipientChips
          recipients={recipients}
          saving={saving}
          savingEmail={savingEmail}
          onRemove={removeEmail}
        />

        {recipients.length === 0 && <FallbackPreview state={state} />}

        {availableOrgUsers.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs text-gray-400">
              <Users className="h-3 w-3" /> Organization members
            </p>
            <div className="flex flex-wrap gap-2">
              {availableOrgUsers.map((user) => {
                const email = normalizeEmail(user.email);
                return (
                  <button
                    key={`${config.channel}-${user.email}`}
                    type="button"
                    onClick={() => addEmail(user.email)}
                    disabled={saving}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 transition hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving && savingEmail === email ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    <span className="truncate">
                      {user.name} ({user.email})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            placeholder="Add custom email..."
            value={customEmail}
            onChange={(event) => onCustomEmailChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addEmail(customEmail);
              }
            }}
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
          />
          <button
            type="button"
            onClick={() => addEmail(customEmail)}
            disabled={!customEmail.trim() || saving}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-medium text-white transition hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && customEmail && savingEmail === normalizeEmail(customEmail) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function RecipientChips({
  recipients,
  saving,
  savingEmail,
  onRemove,
}: {
  recipients: string[];
  saving: boolean;
  savingEmail: string | null;
  onRemove: (email: string) => void;
}) {
  if (recipients.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Mail className="h-4 w-4" />
        No explicit recipients configured.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {recipients.map((email) => (
        <span
          key={email}
          className={`inline-flex max-w-full items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-opacity ${
            saving && savingEmail === email ? "opacity-50" : ""
          }`}
        >
          <span className="truncate">{email}</span>
          {saving && savingEmail === email ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" />
          ) : (
            <button
              type="button"
              aria-label={`Remove ${email}`}
              onClick={() => onRemove(email)}
              disabled={saving}
              className="shrink-0 text-gray-400 transition hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

function SourceBadge({
  state,
}: {
  state: RecipientChannelState | undefined;
}) {
  const source = state?.effectiveSource ?? "none";
  const isConfigured = source === "configured";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
        isConfigured
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-gray-200 bg-gray-50 text-gray-600"
      }`}
    >
      {SOURCE_LABELS[source]}
    </span>
  );
}

function FallbackPreview({
  state,
}: {
  state: RecipientChannelState | undefined;
}) {
  const effectiveRecipients = state?.effectiveRecipients ?? [];
  const source = state?.effectiveSource ?? "none";

  if (source === "configured") return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-600">
        Fallback: {SOURCE_LABELS[source]}
      </p>
      {effectiveRecipients.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {effectiveRecipients.map((email) => (
            <span
              key={email}
              className="inline-flex max-w-full items-center rounded-full bg-white px-2.5 py-1 text-xs text-gray-600 ring-1 ring-gray-200"
            >
              <span className="truncate">{email}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-amber-700">
          No fallback recipients resolved.
        </p>
      )}
    </div>
  );
}
