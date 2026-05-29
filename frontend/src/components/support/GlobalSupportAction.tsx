import { AnimatePresence, motion } from "framer-motion";
import { Bug, Globe2, Lightbulb } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import type { SupportTicketType } from "../../api/support";
import { useSupportQuickAction } from "../../contexts/SupportQuickActionContext";
import { createSupportConsoleLogFile } from "../../utils/supportConsoleLogs";
import { captureSupportScreenshot } from "../../utils/supportScreenshot";
import { SupportLauncherButton } from "./SupportLauncherButton";
import { SupportLauncherTooltip } from "./SupportLauncherTooltip";
import { useRageClickPrompt } from "./useRageClickPrompt";

type SupportQuickOption = {
  type: SupportTicketType;
  label: string;
  description: string;
  icon: typeof Bug;
};

const OPTIONS: SupportQuickOption[] = [
  {
    type: "bug_report",
    label: "Bug report",
    description: "Something is broken or blocked.",
    icon: Bug,
  },
  {
    type: "website_edit",
    label: "Website edit",
    description: "Request copy, media, or layout changes.",
    icon: Globe2,
  },
  {
    type: "feature_request",
    label: "Feature request",
    description: "Suggest a workflow improvement.",
    icon: Lightbulb,
  },
];

export function GlobalSupportAction() {
  const actionRef = useRef<HTMLDivElement | null>(null);
  const launcherButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [capturingType, setCapturingType] =
    useState<SupportTicketType | null>(null);
  const { setPendingDraft } = useSupportQuickAction();
  const navigate = useNavigate();
  const isCapturing = capturingType !== null;
  const { isPromptVisible, rageMotion, shakeKey } = useRageClickPrompt({
    anchorElementRef: launcherButtonRef,
    disabled: isOpen || isCapturing,
    ignoredElementRef: actionRef,
  });
  const launcherTooltipText = isOpen
    ? "Select what you need and we'll take a screenshot of the page along with Alloro logs so we can help you better!"
    : "Having issues? Help us improve!";
  const isTooltipVisible = isOpen || isPromptVisible;

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (actionRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
      launcherButtonRef.current?.blur();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      launcherButtonRef.current?.blur();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleSelectType = async (type: SupportTicketType) => {
    if (isCapturing) return;

    setIsOpen(false);
    setCapturingType(type);

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      const sourceUrl = window.location.href;
      const screenshot = await captureSupportScreenshot();

      // Order matters: the screenshot is captured with the current view (incl.
      // any open modal/overlay) intact, THEN we dismiss those overlays so the
      // page is clean, THEN we hand off to the support composer where the
      // attachment animation plays.
      dismissOpenOverlays();
      await new Promise((resolve) => window.setTimeout(resolve, 220));

      const consoleLogFile = createSupportConsoleLogFile(sourceUrl);
      const draftId = buildDraftId();
      const draft = {
        id: draftId,
        type,
        sourceUrl,
        screenshotFile: screenshot.file,
        consoleLogFile,
        clipboardStatus: screenshot.clipboardStatus,
        createdAt: Date.now(),
      };

      setPendingDraft(draft);

      if (screenshot.clipboardStatus === "copied") {
        toast.success("Screenshot captured and copied");
      } else {
        toast.success("Screenshot captured and attached");
      }

      navigate(`/help?newTicket=${type}`, {
        state: { supportDraft: draft },
      });
    } catch {
      toast.error("We couldn't capture this screen. Try again in a moment.");
    } finally {
      setCapturingType(null);
    }
  };

  return (
    <div
      ref={actionRef}
      data-support-capture-exclude
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-[115] flex flex-col items-end gap-3 lg:bottom-6 lg:right-6"
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="w-[min(calc(100vw-2rem),360px)] overflow-hidden rounded-xl border border-white/10 bg-alloro-navy/95 p-2 shadow-[0_20px_60px_rgba(17,21,28,0.28)] backdrop-blur-xl"
          >
            <div className="space-y-1.5">
              {OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.type}
                    type="button"
                    disabled={isCapturing}
                    onClick={() => handleSelectType(option.type)}
                    className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/10 focus:outline-none focus:ring-4 focus:ring-alloro-teal/20 disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-alloro-orange/15 text-alloro-orange transition group-hover:bg-alloro-orange group-hover:text-white">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold text-white">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-medium leading-4 text-white/55">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCapturing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.28, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="pointer-events-none fixed inset-0 z-30 border-[10px] border-alloro-orange bg-alloro-orange/20"
          />
        )}
      </AnimatePresence>

      <div className="group/support-launcher relative flex items-center">
        <SupportLauncherTooltip
          isOpen={isTooltipVisible}
          text={launcherTooltipText}
        />
        <SupportLauncherButton
          buttonRef={launcherButtonRef}
          isCapturing={isCapturing}
          isOpen={isOpen}
          rageMotion={rageMotion}
          shakeKey={shakeKey}
          onClick={() => setIsOpen((current) => !current)}
        />
      </div>
    </div>
  );
}

/**
 * Dismiss whatever overlay is currently open (DetailsModal, confirm dialogs, the
 * FAB menu, etc.). They all close on a document-level Escape keydown, so a
 * synthetic Escape is the decoupled way to close them without a central modal
 * registry. Called AFTER the screenshot is captured so the modal still appears
 * in the capture, then the page is clean before the support handoff.
 */
function dismissOpenOverlays(): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
}

function buildDraftId(): string {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `support-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
