import { Link2 } from "lucide-react";
import type { SubmissionDetail } from "../../../../types/leadgen";

/**
 * "Source" block — referrer + UTM breakdown. Hidden entirely when every
 * source field is null (most direct-traffic sessions). Referrer is
 * displayed as its hostname to avoid swallowing the panel with long URLs.
 */
export default function SourceBlock({
  session: s,
}: {
  session: SubmissionDetail["session"];
}) {
  const hasAny =
    s.referrer ||
    s.utm_source ||
    s.utm_medium ||
    s.utm_campaign ||
    s.utm_term ||
    s.utm_content;
  if (!hasAny) return null;

  const referrerDomain = (() => {
    if (!s.referrer) return null;
    try {
      return new URL(s.referrer).hostname;
    } catch {
      return s.referrer;
    }
  })();

  const rows: Array<[string, string]> = [];
  if (referrerDomain)
    rows.push(["Referrer", referrerDomain]);
  if (s.utm_source) rows.push(["UTM source", s.utm_source]);
  if (s.utm_medium) rows.push(["UTM medium", s.utm_medium]);
  if (s.utm_campaign) rows.push(["UTM campaign", s.utm_campaign]);
  if (s.utm_term) rows.push(["UTM term", s.utm_term]);
  if (s.utm_content) rows.push(["UTM content", s.utm_content]);

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-gray-600">
        <Link2 className="h-3.5 w-3.5" />
        <span>Source</span>
      </div>
      <dl className="text-xs text-gray-500 space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="font-medium text-gray-600 shrink-0">{label}:</dt>
            <dd
              className="break-all"
              title={label === "Referrer" && s.referrer ? s.referrer : undefined}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
