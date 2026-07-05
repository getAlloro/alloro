import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

/**
 * OS custom filter dropdown (plans/07042026-alloro-os-admin-port, P3 Rev 4 —
 * User QA: replace the native <select> that rendered the OS/browser dark menu
 * with an on-brand animated dropdown, reused across every Library filter + sort).
 * Button shows the active option's label; the menu is a framer-motion popover
 * with keyboard + click-outside dismissal. Light-mode OS tokens throughout.
 */

export type OsFilterOption = { value: string; label: string };

export function OsFilterSelect({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: OsFilterOption[];
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const isDefault = value === "" || value === options[0]?.value;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={`flex h-8 items-center gap-1.5 rounded-lg border bg-white px-2.5 text-[12px] transition-colors duration-150 ${
          isOpen
            ? "border-alloro-orange text-gray-800"
            : isDefault
              ? "border-gray-200 text-gray-600 hover:border-gray-300"
              : "border-alloro-orange/40 text-gray-800"
        }`}
      >
        <span className="max-w-[130px] truncate">{selected?.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.ul
            role="listbox"
            aria-label={ariaLabel}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute left-0 top-full z-30 mt-1.5 max-h-64 min-w-[180px] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-premium"
          >
            {options.map((option) => {
              const isActive = option.value === value;
              return (
                <li key={option.value || "__all"}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors duration-150 ${
                      isActive
                        ? "bg-accent-soft font-semibold text-alloro-orange"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Check
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isActive ? "text-alloro-orange" : "text-transparent"
                      }`}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    <span className="truncate">{option.label}</span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
