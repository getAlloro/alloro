import { useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, Send } from "lucide-react";
import type {
  CreateSupportTicketPayload,
  SupportTicketType,
} from "../../api/support";
import { SupportTicketAttachmentPicker } from "./SupportTicketAttachmentPicker";
import { SupportTypeSelector } from "./SupportTypeSelector";
import {
  formatFieldLabel,
  getSupportFieldConfig,
  initialSupportAnswers,
} from "./supportTicketComposerFields";

export type SupportTicketComposerProps = {
  locationId?: number | null;
  isSubmitting: boolean;
  errorMessage?: string | null;
  initialType?: SupportTicketType;
  initialFiles?: File[];
  animatedFileNames?: string[];
  sourceUrl?: string;
  onCreateTicket: (payload: CreateSupportTicketPayload, files: File[]) => void;
};

const EMPTY_FILES: File[] = [];
const EMPTY_FILE_NAMES: string[] = [];

export function SupportTicketComposer({
  locationId,
  isSubmitting,
  errorMessage,
  initialType = "bug_report",
  initialFiles = EMPTY_FILES,
  animatedFileNames = EMPTY_FILE_NAMES,
  sourceUrl,
  onCreateTicket,
}: SupportTicketComposerProps) {
  const [type, setType] = useState<SupportTicketType>(initialType);
  const [answers, setAnswers] = useState(initialSupportAnswers);
  const [additionalContext, setAdditionalContext] = useState("");
  const [requestedCompletionDate, setRequestedCompletionDate] = useState("");
  const [files, setFiles] = useState<File[]>(initialFiles);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onCreateTicket(
      {
        type,
        guidedAnswers: answers[type],
        additionalContext,
        requestedCompletionDate:
          type === "website_edit" ? requestedCompletionDate : undefined,
        currentPageUrl: sourceUrl ?? window.location.href,
        locationId,
      },
      files,
    );
  };

  const handleAnswerChange = (field: string, value: string) => {
    setAnswers((current) => ({
      ...current,
      [type]: {
        ...current[type],
        [field]: value,
      },
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          Ticket type
        </p>
        <SupportTypeSelector value={type} onChange={setType} />
      </div>

      {errorMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {errorMessage}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {renderFields(type, answers[type], handleAnswerChange)}
        {type === "website_edit" && (
          <label className="space-y-1.5 text-left">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              When do you need this by?
            </span>
            <input
              required
              type="date"
              value={requestedCompletionDate}
              onChange={(event) =>
                setRequestedCompletionDate(event.target.value)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-alloro-navy focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
            />
          </label>
        )}
      </div>

      <SupportTicketAttachmentPicker
        files={files}
        animatedFileNames={animatedFileNames}
        isDisabled={isSubmitting}
        onFilesChange={setFiles}
      />

      <label className="block space-y-1.5 text-left">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Additional context (optional)
        </span>
        <textarea
          value={additionalContext}
          onChange={(event) => setAdditionalContext(event.target.value)}
          rows={4}
          placeholder="Add exact copy, links, business context, or anything the team should know."
          className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-alloro-navy placeholder:text-slate-400 focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
        />
      </label>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-alloro-orange px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_10px_24px_rgba(214,104,83,0.22)] transition hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Sending" : "Create ticket"}
          <Send className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function renderFields(
  type: SupportTicketType,
  values: Record<string, string>,
  onChange: (field: string, value: string) => void,
) {
  const fields = getSupportFieldConfig(type);
  return fields.map((field) => (
    <label
      key={field.name}
      className={`space-y-1.5 text-left ${
        field.kind === "textarea" ? "sm:col-span-2" : ""
      }`}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {formatFieldLabel(field)}
      </span>
      {field.kind === "input" ? (
        <input
          required={field.required}
          value={values[field.name] || ""}
          onChange={(event) => onChange(field.name, event.target.value)}
          placeholder={field.placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-alloro-navy placeholder:text-slate-400 focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
        />
      ) : field.kind === "select" ? (
        <select
          required={field.required}
          value={values[field.name] || ""}
          onChange={(event) => onChange(field.name, event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-alloro-navy focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
        >
          <option value="">{field.placeholder}</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <textarea
          required={field.required}
          value={values[field.name] || ""}
          onChange={(event) => onChange(field.name, event.target.value)}
          rows={field.rows}
          placeholder={field.placeholder}
          className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-alloro-navy placeholder:text-slate-400 focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
        />
      )}
    </label>
  ));
}
