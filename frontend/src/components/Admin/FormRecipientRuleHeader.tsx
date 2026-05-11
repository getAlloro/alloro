import type { WebsiteFormCatalogItem } from "../../api/websites";
import { FormRecipientSourcePills } from "./FormRecipientSourcePills";

export type FormRecipientRuleHeaderProps = {
  form: WebsiteFormCatalogItem;
};

function formatLastSeen(value: string | null): string {
  if (!value) return "No submissions yet";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function FormRecipientRuleHeader({
  form,
}: FormRecipientRuleHeaderProps) {
  const label = form.display_label || form.form_name;

  return (
    <div className="border-b border-gray-100 p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="truncate text-base font-semibold text-gray-900">
            {label}
          </h4>
          <FormRecipientSourcePills form={form} />
        </div>
        <p className="mt-0.5 truncate text-[11px] text-gray-400">
          {form.form_name}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {form.submission_count} submission
          {form.submission_count === 1 ? "" : "s"} ·{" "}
          {formatLastSeen(form.last_seen)}
        </p>
      </div>
    </div>
  );
}
