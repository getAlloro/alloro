import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { Editor } from "@tiptap/core";

export type OsEditorPopoverPosition = {
  top: number;
  right: number;
};

export type UseOsEditorPopoverOptions = {
  editor: Editor;
  containerRef: RefObject<HTMLDivElement | null>;
};

type SetIsOpen = Dispatch<SetStateAction<boolean>>;
type SetPosition = Dispatch<SetStateAction<OsEditorPopoverPosition | null>>;

function activeTableElement(editor: Editor): HTMLElement | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name !== "table") continue;
    const element = editor.view.nodeDOM($from.before(depth));
    return element instanceof HTMLElement ? element : null;
  }
  return null;
}

function listenForDismissal(
  rootRef: RefObject<HTMLDivElement | null>,
  setIsOpen: SetIsOpen,
): () => void {
  const handlePointerDown = (event: PointerEvent) => {
    if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
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
}

function observeActiveTable(
  editor: Editor,
  containerRef: RefObject<HTMLDivElement | null>,
  setPosition: SetPosition,
  setIsOpen: SetIsOpen,
): () => void {
  let frame = 0;
  const measure = () => {
    const container = containerRef.current;
    const table = editor.isActive("table") ? activeTableElement(editor) : null;
    if (!container || !table) {
      setPosition(null);
      setIsOpen(false);
      return;
    }
    const tableBox = table.getBoundingClientRect();
    const containerBox = container.getBoundingClientRect();
    setPosition({
      top: tableBox.top - containerBox.top,
      right: containerBox.right - tableBox.right,
    });
  };
  const scheduleMeasure = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  };
  scheduleMeasure();
  editor.on("selectionUpdate", scheduleMeasure);
  editor.on("update", scheduleMeasure);
  window.addEventListener("resize", scheduleMeasure);
  return () => {
    cancelAnimationFrame(frame);
    editor.off("selectionUpdate", scheduleMeasure);
    editor.off("update", scheduleMeasure);
    window.removeEventListener("resize", scheduleMeasure);
  };
}

/** Owns the active table popover's measured position and dismissal state. */
export function useOsEditorPopover({
  editor,
  containerRef,
}: UseOsEditorPopoverOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<OsEditorPopoverPosition | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    return listenForDismissal(rootRef, setIsOpen);
  }, [isOpen]);

  useEffect(
    () => observeActiveTable(editor, containerRef, setPosition, setIsOpen),
    [containerRef, editor],
  );

  return { isOpen, setIsOpen, position, rootRef };
}
