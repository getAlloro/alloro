import type { SupportScreenshotClipboardStatus } from "../contexts/SupportQuickActionContext";

export const SUPPORT_CAPTURE_EXCLUDE_SELECTOR =
  "[data-support-capture-exclude]";
const SCREENSHOT_CAPTURE_TIMEOUT_MS = 10_000;
const CLIPBOARD_WRITE_TIMEOUT_MS = 1_200;
const CAPTURE_RISKY_TAGS = new Set(["CANVAS", "IFRAME", "VIDEO"]);

export type SupportScreenshotResult = {
  file: File;
  clipboardStatus: SupportScreenshotClipboardStatus;
};

export async function captureSupportScreenshot(): Promise<SupportScreenshotResult> {
  const { toBlob } = await import("html-to-image");
  const blob = await withTimeout(
    captureViewportBlob(toBlob),
    SCREENSHOT_CAPTURE_TIMEOUT_MS,
    "The screenshot capture timed out.",
  );
  const file = new File([blob], buildScreenshotFilename(), {
    type: "image/png",
  });
  const clipboardStatus = await copyScreenshotToClipboard(blob);

  return { file, clipboardStatus };
}

async function captureViewportBlob(
  toBlob: typeof import("html-to-image").toBlob,
): Promise<Blob> {
  const blob = await toBlob(document.body, {
    backgroundColor: "#ffffff",
    cacheBust: true,
    filter: shouldIncludeNode,
    fontEmbedCSS: "",
    height: window.innerHeight,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    skipAutoScale: true,
    style: {
      height: `${document.documentElement.scrollHeight}px`,
      transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`,
      transformOrigin: "top left",
      width: `${document.documentElement.scrollWidth}px`,
    },
    width: window.innerWidth,
  });

  if (blob) return blob;
  throw new Error("The screenshot could not be rendered.");
}

async function copyScreenshotToClipboard(
  blob: Blob,
): Promise<SupportScreenshotClipboardStatus> {
  const ClipboardItemCtor = window.ClipboardItem;
  if (!navigator.clipboard?.write || !ClipboardItemCtor) {
    return "unavailable";
  }

  try {
    await withTimeout(
      navigator.clipboard.write([new ClipboardItemCtor({ [blob.type]: blob })]),
      CLIPBOARD_WRITE_TIMEOUT_MS,
      "The clipboard write timed out.",
    );
    return "copied";
  } catch {
    return "failed";
  }
}

function shouldIncludeNode(node: HTMLElement): boolean {
  if (!(node instanceof Element)) return true;
  return (
    !CAPTURE_RISKY_TAGS.has(node.tagName) &&
    !node.closest(SUPPORT_CAPTURE_EXCLUDE_SELECTOR)
  );
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error(message)),
      timeoutMs,
    );

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function buildScreenshotFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `alloro-support-screenshot-${timestamp}.png`;
}
