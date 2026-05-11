import { FileText, Mail } from "lucide-react";
import type { WebsiteFormCatalogItem } from "../../api/websites";

export type FormRecipientSourcePillsProps = {
  form: WebsiteFormCatalogItem;
};

export function FormRecipientSourcePills({
  form,
}: FormRecipientSourcePillsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {form.sources.submissions && (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          <Mail className="h-3 w-3" /> Submitted
        </span>
      )}
      {form.sources.markup && (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
          <FileText className="h-3 w-3" /> Markup
        </span>
      )}
    </div>
  );
}
