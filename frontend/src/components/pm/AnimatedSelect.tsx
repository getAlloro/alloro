import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

type SelectValue = string | number | null;
export type AnimatedSelectOption<T extends SelectValue> = {
  value: T;
  label: string;
  hint?: string;
  isDisabled?: boolean;
};
export type AnimatedSelectProps<T extends SelectValue> = {
  value: T;
  options: AnimatedSelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
  id?: string;
  isDisabled?: boolean;
  menuPlacement?: "top" | "bottom";
  placeholder?: string;
  size?: "sm" | "md";
  triggerClassName?: string;
};
function findEnabledIndex(
  options: ReadonlyArray<{ isDisabled?: boolean }>,
  start: number,
  direction: 1 | -1,
): number {
  if (!options.length) return -1;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (start + direction * offset + options.length) % options.length;
    if (!options[index]?.isDisabled) return index;
  }
  return -1;
}
function findBoundaryIndex(options: ReadonlyArray<{ isDisabled?: boolean }>, direction: 1 | -1): number {
  const start = direction === 1 ? -1 : 0;
  return findEnabledIndex(options, start, direction);
}

export function AnimatedSelect<T extends SelectValue>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  id,
  isDisabled = false,
  menuPlacement = "bottom",
  placeholder = "Select…",
  size = "md",
  triggerClassName = "",
}: AnimatedSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const generatedId = useId();
  const shouldReduceMotion = useReducedMotion();
  const triggerId = id ?? `pm-select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!isOpen) return;
    const initialIndex = selected?.isDisabled
      ? findBoundaryIndex(options, 1)
      : selectedIndex >= 0
        ? selectedIndex
        : findBoundaryIndex(options, 1);
    setHighlightIndex(initialIndex);
    listboxRef.current?.focus();
  }, [isOpen, options, selected?.isDisabled, selectedIndex]);
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);
  useEffect(() => {
    if (isDisabled) setIsOpen(false);
  }, [isDisabled]);

  const handleSelect = (index: number) => {
    const option = options[index];
    if (!option || option.isDisabled) return;
    onChange(option.value);
    setIsOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };
  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setIsOpen(true);
  };
  const handleListboxKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    if (event.key === "Tab") return setIsOpen(false);
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      return triggerRef.current?.focus();
    }
    let nextIndex = highlightIndex;
    if (event.key === "ArrowDown") nextIndex = findEnabledIndex(options, highlightIndex, 1);
    else if (event.key === "ArrowUp") nextIndex = findEnabledIndex(options, highlightIndex, -1);
    else if (event.key === "Home") nextIndex = findBoundaryIndex(options, 1);
    else if (event.key === "End") nextIndex = findBoundaryIndex(options, -1);
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      return handleSelect(highlightIndex);
    }
    else return;
    event.preventDefault();
    setHighlightIndex(nextIndex);
  };
  const sizeClass = size === "sm" ? "min-h-8 px-2.5 py-1.5 text-[12px]" : "min-h-10 px-3 py-2 text-sm";
  const placementClass = menuPlacement === "top" ? "bottom-full mb-1" : "top-full mt-1";
  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-label={ariaLabel ?? placeholder}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        disabled={isDisabled}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={handleTriggerKeyDown}
        className={`flex w-full items-center justify-between rounded-lg border border-pm-border bg-pm-bg-primary text-left text-pm-text-primary transition-colors hover:border-pm-border-hover focus:border-pm-accent focus:outline-none focus:ring-2 focus:ring-pm-accent/40 disabled:cursor-not-allowed disabled:opacity-50 ${sizeClass} ${triggerClassName}`}
      >
        <span className={`truncate ${selected ? "text-pm-text-primary" : "text-pm-text-muted"}`}>
          {selected?.label ?? placeholder}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
          className="ml-2 shrink-0 text-pm-text-muted"
          aria-hidden="true"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.ul
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel ?? placeholder}
            aria-activedescendant={highlightIndex >= 0 ? `${listboxId}-option-${highlightIndex}` : undefined}
            onKeyDown={handleListboxKeyDown}
            initial={shouldReduceMotion ? false : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.12, ease: "easeOut" }}
            className={`pm-scrollbar absolute left-0 right-0 z-50 max-h-64 overflow-y-auto rounded-lg border border-pm-border bg-pm-bg-secondary py-1 shadow-lg outline-none ${placementClass}`}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightIndex;
              return (
                <li key={`${String(option.value)}-${index}`}>
                  <button
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={isSelected}
                    aria-disabled={option.isDisabled || undefined}
                    disabled={option.isDisabled}
                    onClick={() => handleSelect(index)}
                    onMouseEnter={() => !option.isDisabled && setHighlightIndex(index)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-pm-text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${isHighlighted ? "bg-pm-bg-hover" : "bg-transparent"}`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{option.label}</span>
                      {option.hint && <span className="truncate text-[11px] text-pm-text-muted">{option.hint}</span>}
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-pm-accent" aria-hidden="true" />}
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
