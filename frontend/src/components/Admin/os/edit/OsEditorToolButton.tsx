import type { LucideIcon } from "lucide-react";

export type OsEditorToolButtonProps = {
  label: string;
  icon: LucideIcon;
  isActive?: boolean;
  disabled: boolean;
  onClick: () => void;
};

export function OsEditorToolButton({
  label,
  icon: Icon,
  isActive,
  disabled,
  onClick,
}: OsEditorToolButtonProps) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={isActive}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-[7px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/40 disabled:opacity-40 ${
          isActive
            ? "bg-accent-soft text-alloro-orange"
            : "text-gray-500 hover:bg-accent-soft/60 hover:text-gray-800"
        }`}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-40 mt-2 -translate-x-1/2 translate-y-1 scale-95 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition duration-150 ease-out motion-reduce:transition-none group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
