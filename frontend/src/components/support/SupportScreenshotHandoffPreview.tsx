import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export const SUPPORT_HANDOFF_PREVIEW_WIDTH = 260;
export const SUPPORT_HANDOFF_PREVIEW_HEIGHT = 160;

export type SupportScreenshotHandoffMetrics = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
};

export type SupportScreenshotHandoffPreviewProps = {
  file: File;
  metrics: SupportScreenshotHandoffMetrics;
};

export function SupportScreenshotHandoffPreview({
  file,
  metrics,
}: SupportScreenshotHandoffPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  if (!previewUrl) return null;

  return (
    <motion.div
      className="pointer-events-none fixed z-[120] overflow-hidden rounded-2xl border border-alloro-orange/40 bg-white shadow-[0_24px_80px_rgba(17,21,28,0.32)] ring-8 ring-alloro-orange/10"
      style={{
        height: SUPPORT_HANDOFF_PREVIEW_HEIGHT,
        left: metrics.sourceX,
        top: metrics.sourceY,
        width: SUPPORT_HANDOFF_PREVIEW_WIDTH,
      }}
      initial={{ opacity: 0, scale: 1.12, x: 0, y: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        scale: [1.12, 0.74, 0.36, 0.2],
        x: [0, 0, metrics.targetX, metrics.targetX],
        y: [0, 0, metrics.targetY, metrics.targetY],
      }}
      transition={{
        duration: 1.18,
        ease: "easeInOut",
        times: [0, 0.28, 0.78, 1],
      }}
    >
      <img src={previewUrl} alt="" className="h-full w-full object-cover" />
    </motion.div>
  );
}
