import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";

interface DesktopViewportProps {
  title: string;
  children: ReactNode;
}

const DESIGN_WIDTH = 1440;
const MAX_HEIGHT = 600;

export function DesktopViewport({ title, children }: DesktopViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setScale(entry.contentRect.width / DESIGN_WIDTH);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const measureContent = useCallback(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const observer = new ResizeObserver(() => measureContent());
    observer.observe(content);
    return () => observer.disconnect();
  }, [measureContent]);

  const layoutGap = contentHeight > 0 ? contentHeight * (1 - scale) : 0;

  return (
    <div
      ref={containerRef}
      className="rounded-2xl overflow-hidden border border-alloro-border shadow-lg bg-white"
    >
      {/* Browser chrome */}
      <div className="flex items-center px-4 py-3 bg-gradient-to-b from-gray-100 to-gray-50 border-b border-alloro-border">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
          <div className="w-3 h-3 rounded-full bg-[#28C840]" />
        </div>
        <div className="flex-1 text-center">
          <span className="text-xs font-medium text-alloro-slate">{title}</span>
        </div>
        <div className="w-[54px]" />
      </div>

      {/* Scaled content area */}
      <div
        className="overflow-y-auto overflow-x-hidden"
        style={{ maxHeight: MAX_HEIGHT }}
      >
        <div
          ref={contentRef}
          style={{
            width: `${DESIGN_WIDTH}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            marginBottom: layoutGap > 0 ? `-${layoutGap}px` : undefined,
            // Expose the visible viewport height in unscaled coordinates
            // so sticky sidebars inside replicas can fill it exactly
            ["--viewport-h" as string]: `${Math.round(MAX_HEIGHT / scale)}px`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
