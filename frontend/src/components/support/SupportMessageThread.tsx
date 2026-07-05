import type { SupportTicketMessage } from "../../api/support";

export type SupportMessageThreadProps = {
  messages: SupportTicketMessage[];
  maskStaffName?: boolean;
};

export function SupportMessageThread({
  messages,
  maskStaffName = false,
}: SupportMessageThreadProps) {
  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const isClient = message.authorRole === "client";
        return (
          <article
            key={message.id}
            className={`rounded-xl border p-3.5 ${
              isClient
                ? "border-slate-200 bg-white"
                : "border-alloro-orange/20 bg-alloro-orange/5"
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {isClient
                  ? "You"
                  : maskStaffName
                    ? "Alloro"
                    : message.authorName || "Alloro Support"}
              </p>
              <time className="text-xs font-medium text-slate-400">
                {formatDate(message.createdAt)}
              </time>
            </div>
            <p className="whitespace-pre-wrap text-[13px] font-medium leading-relaxed text-alloro-navy">
              {message.body}
            </p>
          </article>
        );
      })}
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
