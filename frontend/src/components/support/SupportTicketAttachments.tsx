import toast from "react-hot-toast";
import { Download, FileText, ImageIcon, Paperclip } from "lucide-react";
import type { SupportTicketAttachment } from "../../api/support";
import { useSupportAttachmentUrl } from "../../hooks/queries/useSupportQueries";

export type SupportTicketAttachmentsProps = {
  ticketId: string;
  attachments: SupportTicketAttachment[];
  isAdmin?: boolean;
};

export function SupportTicketAttachments({
  ticketId,
  attachments,
  isAdmin = false,
}: SupportTicketAttachmentsProps) {
  const urlMutation = useSupportAttachmentUrl(isAdmin);

  if (attachments.length === 0) return null;

  const handleOpen = (attachmentId: string, download = false) => {
    urlMutation.mutate(
      { ticketId, attachmentId, download },
      {
        onSuccess: (data) => window.open(data.url, "_blank", "noopener"),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
        <Paperclip className="h-3.5 w-3.5 text-alloro-orange" />
        Attachments
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {attachments.map((attachment) => {
          const Icon = attachment.mimeType.startsWith("image/")
            ? ImageIcon
            : FileText;
          return (
            <article
              key={attachment.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0 text-alloro-orange" />
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-alloro-navy">
                    {attachment.filename}
                  </p>
                  <p className="text-[11px] font-medium text-slate-400">
                    {formatBytes(attachment.sizeBytes)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleOpen(attachment.id, true)}
                aria-label={`Download ${attachment.filename}`}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-alloro-orange/50 hover:text-alloro-navy focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
              >
                <Download className="h-4 w-4" />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
