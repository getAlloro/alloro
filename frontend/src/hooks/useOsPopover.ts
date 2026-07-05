import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Self-closing popover state for OS pickers (category/owner/tags): closes on
 * outside pointerdown and Escape. The ref goes on the popover's positioning
 * wrapper (trigger + panel).
 */
export function useOsPopover<T extends HTMLElement>(): {
  isOpen: boolean;
  setIsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  ref: RefObject<T | null>;
} {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return { isOpen, setIsOpen, ref };
}
