import { motion } from "framer-motion";
import { Bug, Loader2 } from "lucide-react";
import type { RefObject } from "react";
import type { RageClickMotion } from "../../utils/supportRageClick";

export type SupportLauncherButtonProps = {
  buttonRef: RefObject<HTMLButtonElement | null>;
  isCapturing: boolean;
  isOpen: boolean;
  rageMotion: RageClickMotion;
  shakeKey: number;
  onClick: () => void;
};

export function SupportLauncherButton({
  buttonRef,
  isCapturing,
  isOpen,
  rageMotion,
  shakeKey,
  onClick,
}: SupportLauncherButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={isOpen ? "Close support menu" : "Open support menu"}
      aria-expanded={isOpen}
      disabled={isCapturing}
      onClick={onClick}
      className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-alloro-navy text-white shadow-[0_18px_45px_rgba(17,21,28,0.28)] transition hover:scale-[1.03] hover:bg-alloro-orange focus:outline-none focus-visible:ring-4 focus-visible:ring-alloro-orange/25 disabled:cursor-wait disabled:opacity-75 sm:h-16 sm:w-16"
    >
      <motion.span
        key={shakeKey}
        animate={
          shakeKey > 0
            ? {
                rotate: [
                  0,
                  rageMotion.rotate,
                  rageMotion.rotate,
                  rageMotion.rotate * 0.7,
                  rageMotion.rotate * 1.16,
                  rageMotion.rotate * 0.84,
                  0,
                ],
                scale: [1, 1.035, 1.035, 1.015, 1.035, 1.01, 1],
                x: [
                  0,
                  rageMotion.x,
                  rageMotion.x,
                  rageMotion.x - 1.2,
                  rageMotion.x + 1.2,
                  rageMotion.x * 0.65,
                  0,
                ],
                y: [
                  0,
                  rageMotion.y,
                  rageMotion.y,
                  rageMotion.y + 0.8,
                  rageMotion.y - 0.8,
                  rageMotion.y * 0.65,
                  0,
                ],
              }
            : { rotate: 0, scale: 1, x: 0, y: 0 }
        }
        transition={{
          duration: 0.62,
          ease: "easeInOut",
          times: [0, 0.22, 0.38, 0.5, 0.62, 0.76, 1],
        }}
        className="flex items-center justify-center"
      >
        {isCapturing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Bug className="h-5 w-5 sm:h-6 sm:w-6" />
        )}
      </motion.span>
    </button>
  );
}
