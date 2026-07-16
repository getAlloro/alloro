import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Shield } from "lucide-react";
import type { UserRole } from "../../../api/settingsUsers";

type UserRoleMeta = {
  label: string;
  hint: string;
};

const USER_ROLE_META: Record<UserRole, UserRoleMeta> = {
  viewer: { label: "Viewer", hint: "Read only" },
  manager: { label: "Manager", hint: "Can edit" },
  admin: { label: "Admin", hint: "Full access" },
};

export type UserRoleSelectProps = {
  value: UserRole;
  options: UserRole[];
  onChange: (value: UserRole) => void;
  ariaLabel: string;
  placement: "table" | "invite";
  fullWidth?: boolean;
  autoFocus?: boolean;
};

export function UserRoleSelect({
  value,
  options,
  onChange,
  ariaLabel,
  placement,
  fullWidth = false,
  autoFocus = false,
}: UserRoleSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const reduceMotion = useReducedMotion();
  const selectedIndex = Math.max(
    options.findIndex((option) => option === value),
    0,
  );
  const selected = options[selectedIndex];
  const anchorClass =
    placement === "invite"
      ? "[anchor-name:--invite-role-trigger]"
      : "[anchor-name:--table-role-trigger]";
  const positionClass =
    placement === "invite"
      ? "[position-anchor:--invite-role-trigger]"
      : "[position-anchor:--table-role-trigger]";

  const closeMenu = useCallback((restoreFocus = true) => {
    setIsOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const chooseOption = useCallback(
    (option: UserRole) => {
      onChange(option);
      closeMenu();
    },
    [closeMenu, onChange],
  );

  useEffect(() => {
    if (!isOpen) return;
    setHighlightIndex(selectedIndex);
    const menu = menuRef.current;
    if (menu && typeof menu.showPopover === "function") menu.showPopover();
  }, [isOpen, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        closeMenu(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeMenu();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setHighlightIndex((current) => (current + step + options.length) % options.length);
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const option = options[highlightIndex];
        if (option) chooseOption(option);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [chooseOption, closeMenu, highlightIndex, isOpen, options]);

  const handleTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      setIsOpen(true);
    }
  };

  return (
    <div className={fullWidth ? "w-full" : "w-[148px]"}>
      <button
        ref={triggerRef}
        id={`${listboxId}-trigger`}
        type="button"
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen ? `${listboxId}-option-${highlightIndex}` : undefined}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        className={`${anchorClass} flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-xl border border-line-medium bg-alloro-surface px-3 py-2 text-left text-[11px] font-black uppercase tracking-[0.1em] text-alloro-navy transition hover:border-alloro-orange/50 focus:outline-none focus:ring-4 focus:ring-alloro-orange/15`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Shield className="h-3.5 w-3.5 shrink-0 text-alloro-orange" />
          <span className="truncate">
            {selected ? USER_ROLE_META[selected].label : "Select role"}
          </span>
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
          className="shrink-0 text-ink-muted"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={menuRef}
                id={listboxId}
                popover="manual"
                role="listbox"
                aria-label={ariaLabel}
                initial={reduceMotion ? false : { opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: reduceMotion ? 0 : 0.14, ease: "easeOut" }}
                className={`${positionClass} fixed left-[anchor(left)] top-[anchor(bottom)] m-0 mt-2 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line-medium bg-alloro-surface p-1 shadow-2xl [inset:auto] [position-try-fallbacks:flip-block,flip-inline]`}
              >
                {options.map((option, index) => (
                  <button
                    key={option}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={option === value}
                    onClick={() => chooseOption(option)}
                    onMouseEnter={() => setHighlightIndex(index)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 ${
                      index === highlightIndex ? "bg-accent-soft" : "bg-alloro-surface"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-black text-alloro-navy">
                        {USER_ROLE_META[option].label}
                      </span>
                      <span className="block truncate text-[10px] font-bold text-ink-muted">
                        {USER_ROLE_META[option].hint}
                      </span>
                    </span>
                    {option === value && (
                      <Check className="h-4 w-4 shrink-0 text-alloro-orange" />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
