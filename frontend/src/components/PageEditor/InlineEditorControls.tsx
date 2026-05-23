import type { ReactNode } from "react";

export type InlineIconButtonProps = {
  label: string;
  disabled?: boolean;
  emphasis?: boolean;
  children: ReactNode;
  onClick: () => void;
};

export function InlineIconButton({
  label,
  disabled,
  emphasis,
  children,
  onClick,
}: InlineIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${
        emphasis
          ? "bg-alloro-orange text-white hover:bg-alloro-orange/90"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

export type InlineSmallButtonProps = {
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
};

export function InlineSmallButton({
  active,
  disabled,
  children,
  onClick,
}: InlineSmallButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-alloro-orange text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}
