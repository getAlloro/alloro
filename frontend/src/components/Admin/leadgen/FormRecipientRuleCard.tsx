import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import type { WebsiteFormCatalogItem } from "../../../api/websites";
import { FormRecipientCustomEditor } from "./FormRecipientCustomEditor";
import { FormRecipientDefaultPreview } from "./FormRecipientDefaultPreview";
import { FormRecipientRuleHeader } from "./FormRecipientRuleHeader";
import { FormRecipientRouteModePicker } from "./FormRecipientRouteModePicker";

type PendingRecipientAction =
  | { type: "add"; email: string; source: "member" | "manual" }
  | { type: "remove"; email: string }
  | { type: "mode"; mode: "default" | "custom" }
  | null;

export type FormRecipientRuleCardProps = {
  form: WebsiteFormCatalogItem;
  orgUsers: Array<{ name: string; email: string; role: string }>;
  defaultRecipients: string[];
  isSaving: boolean;
  onSave: (
    form: WebsiteFormCatalogItem,
    recipients: string[],
    isEnabled: boolean,
  ) => Promise<void>;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function FormRecipientRuleCard({
  form,
  orgUsers,
  defaultRecipients,
  isSaving,
  onSave,
}: FormRecipientRuleCardProps) {
  const [customEmail, setCustomEmail] = useState("");
  const persistedRecipients = form.rule?.recipients;
  const recipients = useMemo(
    () => persistedRecipients ?? [],
    [persistedRecipients],
  );
  const recipientKey = recipients.join("|");
  const hasCustomRoute = Boolean(form.rule?.is_enabled && recipients.length > 0);
  const [isCustomMode, setIsCustomMode] = useState(hasCustomRoute);
  const [localRecipients, setLocalRecipients] = useState(recipients);
  const [pendingAction, setPendingAction] =
    useState<PendingRecipientAction>(null);
  const formKeyRef = useRef(form.form_key);
  const availableOrgUsers = orgUsers.filter(
    (user) => !localRecipients.includes(normalizeEmail(user.email)),
  );
  const isBusy = isSaving || pendingAction !== null;

  useEffect(() => {
    const formChanged = formKeyRef.current !== form.form_key;
    formKeyRef.current = form.form_key;
    if (pendingAction && !formChanged) return;

    setCustomEmail("");
    setIsCustomMode(hasCustomRoute);
    setLocalRecipients(recipients);
    setPendingAction(null);
  }, [form.form_key, hasCustomRoute, pendingAction, recipientKey, recipients]);

  const save = (updatedRecipients: string[], nextEnabled = hasCustomRoute) =>
    onSave(form, updatedRecipients, nextEnabled);

  const useDefaultRecipients = async () => {
    const previousMode = isCustomMode;
    setIsCustomMode(false);
    if (form.rule?.is_enabled || localRecipients.length > 0) {
      setPendingAction({ type: "mode", mode: "default" });
      try {
        await save(localRecipients, false);
      } catch {
        setIsCustomMode(previousMode);
      } finally {
        setPendingAction(null);
      }
    }
  };

  const useCustomRecipients = async () => {
    const previousMode = isCustomMode;
    setIsCustomMode(true);
    if (localRecipients.length > 0 && !form.rule?.is_enabled) {
      setPendingAction({ type: "mode", mode: "custom" });
      try {
        await save(localRecipients, true);
      } catch {
        setIsCustomMode(previousMode);
      } finally {
        setPendingAction(null);
      }
    }
  };

  const addEmail = async (email: string, source: "member" | "manual" = "manual") => {
    const normalized = normalizeEmail(email);
    if (!normalized) return;
    if (!EMAIL_REGEX.test(normalized)) {
      toast.error("Enter a valid email");
      return;
    }
    if (localRecipients.includes(normalized)) {
      toast.error("Already added");
      return;
    }
    const previousRecipients = localRecipients;
    const previousCustomEmail = customEmail;
    const nextRecipients = [...localRecipients, normalized];

    setCustomEmail("");
    setIsCustomMode(true);
    setLocalRecipients(nextRecipients);
    setPendingAction({ type: "add", email: normalized, source });
    try {
      await save(nextRecipients, true);
    } catch {
      setLocalRecipients(previousRecipients);
      if (source === "manual") setCustomEmail(previousCustomEmail);
    } finally {
      setPendingAction(null);
    }
  };

  const removeEmail = async (email: string) => {
    const nextRecipients = localRecipients.filter(
      (recipient) => recipient !== email,
    );
    setPendingAction({ type: "remove", email });
    try {
      await save(nextRecipients, nextRecipients.length > 0);
      setLocalRecipients(nextRecipients);
      if (nextRecipients.length === 0) setIsCustomMode(false);
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <FormRecipientRuleHeader form={form} />

      <div className="space-y-5 p-5">
        <FormRecipientRouteModePicker
          isCustomMode={isCustomMode}
          isSaving={isBusy}
          pendingMode={
            pendingAction?.type === "mode" ? pendingAction.mode : null
          }
          onUseDefault={useDefaultRecipients}
          onUseCustom={useCustomRecipients}
        />

        {!isCustomMode ? (
          <FormRecipientDefaultPreview recipients={defaultRecipients} />
        ) : (
          <FormRecipientCustomEditor
            formKey={form.form_key}
            formName={form.form_name}
            recipients={localRecipients}
            availableOrgUsers={availableOrgUsers}
            customEmail={customEmail}
            isSaving={isBusy}
            pendingAddEmail={
              pendingAction?.type === "add" ? pendingAction.email : null
            }
            pendingRemoveEmail={
              pendingAction?.type === "remove" ? pendingAction.email : null
            }
            isManualAddPending={
              pendingAction?.type === "add" && pendingAction.source === "manual"
            }
            onCustomEmailChange={setCustomEmail}
            onAddEmail={addEmail}
            onRemoveEmail={removeEmail}
          />
        )}
      </div>
    </div>
  );
}
