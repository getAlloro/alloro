import type { FormEvent } from "react";
import type {
  AdminSupportAssignee,
  AdminSupportTicketUpdatePayload,
} from "../../../api/support";
import {
  AdminInput,
  AdminSelect,
  AdminTextarea,
} from "./AdminSupportFormFields";
import {
  getSignalMeta,
  priorityOptions,
  severityOptions,
  ticketStatusOptions,
} from "./supportTriageMeta";

export type AdminSupportTriageFormProps = {
  form: AdminSupportTicketUpdatePayload;
  assignees: AdminSupportAssignee[];
  isUpdating: boolean;
  onFormChange: (form: AdminSupportTicketUpdatePayload) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AdminSupportTriageForm({
  form,
  assignees,
  isUpdating,
  onFormChange,
  onSubmit,
}: AdminSupportTriageFormProps) {
  const isResolutionRequired =
    form.status === "resolved" ||
    form.status === "wont_fix" ||
    form.status === "archived";
  const assigneeOptions = [
    { value: null, label: "Unassigned" },
    ...assignees.map((assignee) => ({
      value: assignee.id,
      label: assignee.displayName,
      hint: assignee.email,
    })),
  ];

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <AdminSelect
          label="Status"
          value={form.status || "new"}
          options={ticketStatusOptions.map((option) => ({
            ...option,
            meta: getSignalMeta("status", option.value),
          }))}
          onChange={(status) => onFormChange({ ...form, status })}
        />
        <AdminSelect
          label="Client impact"
          value={form.severity || "medium"}
          options={severityOptions.map((option) => ({
            ...option,
            meta: getSignalMeta("severity", option.value),
          }))}
          onChange={(severity) => onFormChange({ ...form, severity })}
        />
        <AdminSelect
          label="Internal priority"
          value={form.priority || "p2"}
          options={priorityOptions.map((option) => ({
            ...option,
            meta: getSignalMeta("priority", option.value),
          }))}
          onChange={(priority) => onFormChange({ ...form, priority })}
        />
        <AdminInput
          label="Target sprint (optional)"
          value={String(form.targetSprint || "")}
          onChange={(targetSprint) => onFormChange({ ...form, targetSprint })}
        />
        <AdminSelect
          label="Assignee (optional)"
          value={form.assignedToUserId ?? null}
          options={assigneeOptions}
          onChange={(assignedToUserId) =>
            onFormChange({ ...form, assignedToUserId })
          }
        />
        <AdminTextarea
          label="Internal notes (optional)"
          value={String(form.internalNotes || "")}
          onChange={(internalNotes) => onFormChange({ ...form, internalNotes })}
        />
        <AdminTextarea
          label={
            isResolutionRequired
              ? "Resolution notes"
              : "Resolution notes (optional)"
          }
          value={String(form.resolutionNotes || "")}
          onChange={(resolutionNotes) =>
            onFormChange({ ...form, resolutionNotes })
          }
        />
      </div>
      <div className="flex justify-start border-t border-slate-100 pt-4">
        <button
          type="submit"
          disabled={isUpdating}
          className="inline-flex min-w-[140px] items-center justify-center rounded-xl bg-alloro-orange px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_10px_24px_rgba(214,104,83,0.20)] transition hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isUpdating ? "Saving" : "Save"}
        </button>
      </div>
    </form>
  );
}
