import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { MousePointerClick } from "lucide-react";
import type { DocPage } from "../types/docs";
import { DesktopViewport } from "./DesktopViewport";
import { PageChangelog } from "./PageChangelog";

interface DocPageTemplateProps {
  page: DocPage;
}

export function DocPageTemplate({ page }: DocPageTemplateProps) {
  const [activeStepIdx, setActiveStepIdx] = useState<number | null>(null);
  const activeHotspotId = activeStepIdx != null ? page.steps[activeStepIdx]?.hotspotId ?? null : null;
  const viewportRef = useRef<HTMLDivElement>(null);

  const Replica = page.replica;

  const handleHotspotClick = (h: { id: string }) => {
    const idx = page.steps.findIndex((s) => s.hotspotId === h.id);
    setActiveStepIdx(idx >= 0 ? idx : null);
  };

  const handleStepClick = (idx: number) => {
    setActiveStepIdx(activeStepIdx === idx ? null : idx);
    // Scroll the replica viewport into view so the user sees the highlight.
    viewportRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-10"
    >
      {/* Header */}
      <div>
        <h1 className="font-display text-4xl text-alloro-navy mb-3">{page.title}</h1>
        <p className="text-base text-alloro-slate max-w-[600px] leading-relaxed">
          {page.description}
        </p>
      </div>

      {/* Replica viewport */}
      <div ref={viewportRef}>
        <div className="flex items-center gap-2 mb-4">
          <MousePointerClick size={14} className="text-alloro-orange" />
          <span className="text-xs font-bold uppercase tracking-wider text-alloro-slate">
            Interactive — hover or click highlighted areas
          </span>
        </div>
        <DesktopViewport title={page.title}>
          <Replica
            hotspots={page.hotspots}
            activeHotspotId={activeHotspotId}
            onHotspotClick={handleHotspotClick}
          />
        </DesktopViewport>
      </div>

      {/* Step-by-step instructions */}
      {page.steps.length > 0 && (
        <div>
          <h2 className="font-display text-2xl text-alloro-navy mb-5">Step by Step</h2>
          <ol className="space-y-3">
            {page.steps.map((step, idx) => (
              <li
                key={step.number}
                className={`flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
                  activeStepIdx === idx
                    ? "border-alloro-orange bg-alloro-orange-light shadow-sm"
                    : "border-alloro-border bg-white hover:border-alloro-orange/30"
                }`}
                onClick={() => handleStepClick(idx)}
              >
                <div className="shrink-0 w-7 h-7 rounded-full bg-alloro-orange text-white text-xs font-bold flex items-center justify-center">
                  {step.number}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-alloro-navy">{step.title}</h4>
                  <p className="text-xs text-alloro-slate mt-1 leading-relaxed">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Per-page changelog */}
      {page.changelog.length > 0 && (
        <PageChangelog entries={page.changelog} />
      )}
    </motion.div>
  );
}
