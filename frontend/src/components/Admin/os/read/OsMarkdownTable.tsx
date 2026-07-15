import type { ComponentPropsWithoutRef } from "react";

export type OsMarkdownTableProps = ComponentPropsWithoutRef<"table">;

const OS_TABLE_SCROLL_CLASSES = [
  "max-w-full overflow-x-auto rounded-lg",
  "[scrollbar-color:var(--color-alloro-orange)_transparent] [scrollbar-width:thin]",
  "[&::-webkit-scrollbar]:h-2",
  "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-alloro-orange",
  "[&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-accent-soft",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/30",
].join(" ");

/** Keep wide GFM tables semantic while containing horizontal overflow. */
export function OsMarkdownTable({
  children,
  className,
  ...rest
}: OsMarkdownTableProps) {
  return (
    <div
      role="region"
      aria-label="Scrollable table"
      tabIndex={0}
      className={OS_TABLE_SCROLL_CLASSES}
    >
      <table
        {...rest}
        className={["w-full min-w-max border-collapse", className]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </table>
    </div>
  );
}
