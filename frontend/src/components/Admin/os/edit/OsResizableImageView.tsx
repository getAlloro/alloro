import { useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { MoveDiagonal2 } from "lucide-react";
import { osAssetSrc } from "../shared/osFormat";
import { parseOsImageSource } from "../shared/osMarkdown";
import { OsImageDeleteControl } from "./OsImageDeleteControl";

const OS_IMAGE_MIN_WIDTH = 80;

export function OsResizableImageView({
  node,
  updateAttributes,
  deleteNode,
  selected,
  editor,
}: NodeViewProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [confirmationFlash, setConfirmationFlash] = useState(0);
  const rawSrc = typeof node.attrs.src === "string" ? node.attrs.src : "";
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
  const image = parseOsImageSource(rawSrc);

  useEffect(() => {
    if (!selected || !editor.isEditable) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setIsConfirmingDelete(true);
        setConfirmationFlash((value) => value + 1);
      } else if (event.key === "Escape") {
        setIsConfirmingDelete(false);
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [editor, selected]);

  useEffect(() => {
    if (!selected) setIsConfirmingDelete(false);
  }, [selected]);

  const handleResizeStart = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = imageRef.current?.offsetWidth ?? 0;
    const editorWidth =
      imageRef.current?.closest<HTMLElement>(".ProseMirror")?.clientWidth ??
      Number.MAX_SAFE_INTEGER;
    const handleMove = (moveEvent: PointerEvent) => {
      const requestedWidth = Math.round(
        startWidth + (moveEvent.clientX - startX),
      );
      const width = Math.max(
        OS_IMAGE_MIN_WIDTH,
        Math.min(requestedWidth, editorWidth),
      );
      updateAttributes({ src: `${image.src}#w=${width}` });
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const imageClassName = [
    "max-w-full rounded-lg border border-line-medium",
    selected
      ? "ring-2 ring-alloro-orange ring-offset-2 ring-offset-alloro-surface"
      : "",
  ].join(" ");

  return (
    <NodeViewWrapper
      className="group relative my-4 w-fit"
      onPointerLeave={() => setIsConfirmingDelete(false)}
    >
      <img
        ref={imageRef}
        src={osAssetSrc(image.src)}
        alt={alt}
        width={image.width}
        draggable={false}
        className={imageClassName}
      />
      {editor.isEditable && (
        <>
          <OsImageDeleteControl
            isConfirming={isConfirmingDelete}
            confirmationFlash={confirmationFlash}
            onRequest={() => {
              setIsConfirmingDelete(true);
              setConfirmationFlash((value) => value + 1);
            }}
            onConfirm={() => deleteNode()}
            onCancel={() => setIsConfirmingDelete(false)}
          />
          <span
            role="presentation"
            onPointerDown={handleResizeStart}
            title="Drag to resize"
            className={`absolute -bottom-2 -right-2 inline-flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded-full border-2 border-alloro-surface bg-alloro-orange text-white shadow-sm transition-opacity ${
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <MoveDiagonal2 className="h-3 w-3" aria-hidden="true" />
          </span>
        </>
      )}
    </NodeViewWrapper>
  );
}
