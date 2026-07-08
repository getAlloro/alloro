import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Designed empty state for OS surfaces (D13) — icon in a hairline circle,
 * Spectral heading, Jakarta body, optional action, mono footer line. Mirrors
 * the P1 placeholder composition so empty screens stay consistent.
 */
export function OsEmptyState({
  icon: Icon,
  title,
  body,
  action,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
  footer?: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center pt-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-alloro-surface">
        <Icon className="h-5 w-5 text-gray-400" strokeWidth={1.5} />
      </div>
      <h2 className="mt-5 font-display text-xl text-alloro-textDark">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">{body}</p>
      {action && <div className="mt-6">{action}</div>}
      {footer && (
        <p className="mt-10 w-full border-t border-line-soft pt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-gray-400">
          {footer}
        </p>
      )}
    </div>
  );
}
